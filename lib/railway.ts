const RAILWAY_API = "https://backboard.railway.com/graphql/v2";

export type MetricPoint = { ts: string; value: number };
export type MetricSeries = {
  measurement: string;
  tags: {
    deploymentId?: string;
    deploymentInstanceId?: string;
    serviceId?: string;
    region?: string;
  };
  values: MetricPoint[];
};

export type Deployment = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  canRollback?: boolean;
  serviceId: string;
  serviceName: string;
};

export type RailwaySnapshot = {
  project: { id: string; name: string };
  environment: { id: string; name: string };
  services: Array<{
    id: string;
    name: string;
    latestDeployment: Omit<Deployment, "serviceId" | "serviceName"> | null;
  }>;
  deployments: Deployment[];
  metrics: MetricSeries[];
  rateLimit: {
    limit: string | null;
    remaining: string | null;
    reset: string | null;
  };
};

type GraphQlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

function authHeaders() {
  const projectToken = process.env.RAILWAY_PROJECT_TOKEN;

  if (projectToken) return { "Project-Access-Token": projectToken };

  throw new Error("Railway access is not configured. Add RAILWAY_PROJECT_TOKEN.");
}

async function railwayQuery<T>(
  query: string,
  variables: Record<string, unknown> = {},
) {
  const response = await fetch(RAILWAY_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const payload = (await response.json()) as GraphQlResponse<T>;
  if (!response.ok || payload.errors?.length) {
    throw new Error(
      payload.errors?.map((error) => error.message).join("; ") ||
        `Railway API returned ${response.status}.`,
    );
  }

  if (!payload.data) throw new Error("Railway API returned no data.");
  return {
    data: payload.data,
    headers: response.headers,
  };
}

async function resolveScope() {
  const result = await railwayQuery<{
    projectToken: { projectId: string; environmentId: string };
  }>("query Scope { projectToken { projectId environmentId } }");

  return result.data.projectToken;
}

export async function discoverPostgresUrl() {
  const { projectId, environmentId } = await resolveScope();
  const project = await railwayQuery<{
    project: {
      services: { edges: Array<{ node: { id: string; name: string } }> };
    };
  }>(
    `query DatabaseServices($projectId: String!) {
      project(id: $projectId) {
        services { edges { node { id name } } }
      }
    }`,
    { projectId },
  );

  const currentServiceId = process.env.RAILWAY_SERVICE_ID;
  const candidates = project.data.project.services.edges.filter(
    ({ node }) => node.id !== currentServiceId,
  );

  const servicesWithVariables = await Promise.all(
    candidates.map(async ({ node }) => {
      const result = await railwayQuery<{
        variables: Record<string, string>;
      }>(
        `query DatabaseVariables(
          $projectId: String!
          $environmentId: String!
          $serviceId: String!
        ) {
          variables(
            projectId: $projectId
            environmentId: $environmentId
            serviceId: $serviceId
          )
        }`,
        { projectId, environmentId, serviceId: node.id },
      );
      return { service: node, variables: result.data.variables };
    }),
  );

  const database = servicesWithVariables.find(
    ({ variables }) => variables.DATABASE_URL || variables.POSTGRES_URL,
  );

  return database
    ? database.variables.DATABASE_URL || database.variables.POSTGRES_URL
    : null;
}

const PROJECT_QUERY = `
  query DashboardProject($projectId: String!) {
    project(id: $projectId) {
      id
      name
      environments {
        edges { node { id name } }
      }
      services {
        edges {
          node {
            id
            name
            serviceInstances {
              edges {
                node {
                  environmentId
                  latestDeployment { id status createdAt updatedAt canRollback }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const DEPLOYMENTS_QUERY = `
  query DashboardDeployments($input: DeploymentListInput!, $first: Int) {
    deployments(input: $input, first: $first) {
      edges {
        node { id status createdAt updatedAt canRollback }
      }
    }
  }
`;

const METRICS_QUERY = `
  query DashboardMetrics(
    $environmentId: String!
    $startDate: DateTime!
    $sampleRateSeconds: Int
    $measurements: [MetricMeasurement!]!
  ) {
    metrics(
      environmentId: $environmentId
      startDate: $startDate
      sampleRateSeconds: $sampleRateSeconds
      groupBy: [SERVICE_ID, DEPLOYMENT_ID, REGION]
      measurements: $measurements
    ) {
      measurement
      tags { deploymentId deploymentInstanceId serviceId region }
      values { ts value }
    }
  }
`;

type ProjectResponse = {
  project: {
    id: string;
    name: string;
    environments: { edges: Array<{ node: { id: string; name: string } }> };
    services: {
      edges: Array<{
        node: {
          id: string;
          name: string;
          serviceInstances: {
            edges: Array<{
              node: {
                environmentId: string;
                latestDeployment: Omit<
                  Deployment,
                  "serviceId" | "serviceName"
                > | null;
              };
            }>;
          };
        };
      }>;
    };
  };
};

export async function getRailwaySnapshot(
  hours = 24,
): Promise<RailwaySnapshot> {
  const { projectId, environmentId } = await resolveScope();
  const projectResult = await railwayQuery<ProjectResponse>(PROJECT_QUERY, {
    projectId,
  });

  const environment = projectResult.data.project.environments.edges.find(
    ({ node }) => node.id === environmentId,
  )?.node;
  if (!environment) throw new Error("The configured Railway environment was not found.");

  const services = projectResult.data.project.services.edges.map(({ node }) => {
    const instance = node.serviceInstances.edges.find(
      ({ node: serviceInstance }) =>
        serviceInstance.environmentId === environmentId,
    )?.node;
    return {
      id: node.id,
      name: node.name,
      latestDeployment: instance?.latestDeployment || null,
    };
  });

  const deploymentResults = await Promise.all(
    services.map(async (service) => {
      const result = await railwayQuery<{
        deployments: {
          edges: Array<{
            node: Omit<Deployment, "serviceId" | "serviceName">;
          }>;
        };
      }>(DEPLOYMENTS_QUERY, {
        input: { serviceId: service.id, environmentId },
        first: 12,
      });
      return result.data.deployments.edges.map(({ node }) => ({
        ...node,
        serviceId: service.id,
        serviceName: service.name,
      }));
    }),
  );

  const startDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const metricsResult = await railwayQuery<{ metrics: MetricSeries[] }>(
    METRICS_QUERY,
    {
      environmentId,
      startDate,
      sampleRateSeconds: hours <= 6 ? 60 : hours <= 24 ? 300 : 1800,
      measurements: [
        "CPU_USAGE",
        "CPU_LIMIT",
        "MEMORY_USAGE_GB",
        "MEMORY_LIMIT_GB",
        "NETWORK_RX_GB",
        "NETWORK_TX_GB",
        "DISK_USAGE_GB",
        "EPHEMERAL_DISK_USAGE_GB",
        "BACKUP_USAGE_GB",
      ],
    },
  );

  return {
    project: {
      id: projectResult.data.project.id,
      name: projectResult.data.project.name,
    },
    environment,
    services,
    deployments: deploymentResults.flat().sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
    metrics: metricsResult.data.metrics,
    rateLimit: {
      limit: projectResult.headers.get("ratelimit-limit"),
      remaining: projectResult.headers.get("ratelimit-remaining"),
      reset: projectResult.headers.get("ratelimit-reset"),
    },
  };
}
