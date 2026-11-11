"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { PostgresSnapshot } from "@/lib/postgres";
import type { MetricSeries, RailwaySnapshot } from "@/lib/railway";

type DashboardPayload = {
  generatedAt: string;
  rangeHours: number;
  railway: RailwaySnapshot | null;
  postgres: PostgresSnapshot | null;
  sourceErrors: { railway: string | null; postgres: string | null };
  error?: string;
};

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; payload: DashboardPayload };

const ranges = [
  { label: "1 hour", value: 1 },
  { label: "6 hours", value: 6 },
  { label: "24 hours", value: 24 },
  { label: "7 days", value: 168 },
];

function bytes(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(Math.abs(value)) / Math.log(1024)),
    units.length - 1,
  );
  return `${(value / 1024 ** index).toFixed(index > 1 ? 2 : 0)} ${units[index]}`;
}

function compact(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  return `${value.toFixed(1)}%`;
}

function shortTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function dateTime(value: string | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function duration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} hr`;
}

function latestValue(series: MetricSeries[], measurement: string) {
  const matches = series.filter((item) => item.measurement === measurement);
  return matches.reduce((total, item) => {
    const latest = item.values[item.values.length - 1];
    return total + (latest?.value || 0);
  }, 0);
}

function chartData(series: MetricSeries[], measurements: string[]) {
  const points = new Map<string, Record<string, number | string>>();
  series
    .filter((item) => measurements.includes(item.measurement))
    .forEach((item) => {
      item.values.forEach((point) => {
        const row = points.get(point.ts) || { ts: point.ts };
        row[item.measurement] =
          Number(row[item.measurement] || 0) + point.value;
        points.set(point.ts, row);
      });
    });
  return [...points.values()].sort((a, b) =>
    String(a.ts).localeCompare(String(b.ts)),
  );
}

function statusTone(status: string) {
  if (status === "SUCCESS") return "success" as const;
  if (["FAILED", "CRASHED"].includes(status)) return "danger" as const;
  if (["BUILDING", "DEPLOYING", "QUEUED", "WAITING"].includes(status))
    return "warning" as const;
  return "neutral" as const;
}

function Mark() {
  return (
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-600 text-sm font-black text-white shadow-[0_6px_18px_rgba(109,40,217,0.28)]">
      P
    </span>
  );
}

function LoadingView() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
        <div className="mb-8 flex items-center gap-3">
          <Mark />
          <div>
            <div className="h-4 w-36 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Loading Railway and PostgreSQL telemetry
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Card key={item} className="h-32 animate-pulse bg-slate-100 dark:bg-slate-900" />
          ))}
        </div>
        <Card className="mt-4 h-[360px] animate-pulse bg-slate-100 dark:bg-slate-900" />
      </div>
    </main>
  );
}

function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-5 dark:bg-slate-950">
      <Card className="w-full max-w-lg border-red-200 dark:border-red-900">
        <CardHeader>
          <Badge tone="danger" className="mb-3 w-fit">
            Connection failed
          </Badge>
          <CardTitle className="text-xl">Telemetry could not be loaded</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onRetry}>Retry connection</Button>
        </CardContent>
      </Card>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <Card
      className={
        accent
          ? "border-violet-300 bg-violet-600 text-white shadow-[0_18px_45px_rgba(91,33,182,0.2)] dark:border-violet-700"
          : undefined
      }
    >
      <CardContent className="pt-5">
        <p
          className={`text-sm font-medium ${
            accent ? "text-violet-100" : "text-slate-600 dark:text-slate-400"
          }`}
        >
          {label}
        </p>
        <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
        <p
          className={`mt-2 text-xs ${
            accent ? "text-violet-100" : "text-slate-600 dark:text-slate-400"
          }`}
        >
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}

function EmptySource({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex min-h-48 flex-col justify-center pt-5">
        <p className="text-base font-semibold">{title}</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-400">
          {message}
        </p>
      </CardContent>
    </Card>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-950">
      <p className="mb-2 font-semibold">{dateTime(label)}</p>
      {payload.map((item) => (
        <p key={item.name} style={{ color: item.color }} className="mt-1">
          {item.name}: {item.value.toFixed(3)} {unit}
        </p>
      ))}
    </div>
  );
}

function Infrastructure({ railway }: { railway: RailwaySnapshot }) {
  const cpuData = chartData(railway.metrics, ["CPU_USAGE", "CPU_LIMIT"]);
  const memoryData = chartData(railway.metrics, [
    "MEMORY_USAGE_GB",
    "MEMORY_LIMIT_GB",
  ]);
  const networkData = chartData(railway.metrics, [
    "NETWORK_RX_GB",
    "NETWORK_TX_GB",
  ]);

  if (!railway.metrics.length) {
    return (
      <EmptySource
        title="No infrastructure samples in this range"
        message="The environment is connected, but Railway returned no metric samples. Select a longer range or confirm that a service has an active deployment."
      />
    );
  }

  const networkReceived = latestValue(railway.metrics, "NETWORK_RX_GB");
  const networkSent = latestValue(railway.metrics, "NETWORK_TX_GB");
  const persistentDisk = latestValue(railway.metrics, "DISK_USAGE_GB");
  const ephemeralDisk = latestValue(railway.metrics, "EPHEMERAL_DISK_USAGE_GB");
  const backupStorage = latestValue(railway.metrics, "BACKUP_USAGE_GB");
  const regions = [
    ...new Set(railway.metrics.map((item) => item.tags.region).filter(Boolean)),
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Network received" value={`${networkReceived.toFixed(3)} GB`} detail="Latest combined sample" accent />
        <MetricCard label="Network sent" value={`${networkSent.toFixed(3)} GB`} detail="Latest combined sample" />
        <MetricCard label="Storage in use" value={`${(persistentDisk + ephemeralDisk).toFixed(2)} GB`} detail={`${persistentDisk.toFixed(2)} GB persistent, ${ephemeralDisk.toFixed(2)} GB ephemeral`} />
        <MetricCard label="Backup storage" value={`${backupStorage.toFixed(2)} GB`} detail={regions.length ? `Regions: ${regions.join(", ")}` : "Region tags unavailable"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>CPU allocation and use</CardTitle>
          <CardDescription>Combined cores across services</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cpuData}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="ts" tickFormatter={shortTime} tickLine={false} axisLine={false} minTickGap={48} />
              <YAxis tickLine={false} axisLine={false} width={36} />
              <Tooltip content={<ChartTooltip unit="cores" />} />
              <Line type="monotone" dataKey="CPU_LIMIT" name="Limit" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="CPU_USAGE" name="Use" stroke="#6d28d9" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Memory allocation and use</CardTitle>
          <CardDescription>Combined gigabytes across services</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={memoryData}>
              <defs>
                <linearGradient id="memoryFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6d28d9" stopOpacity={0.24} />
                  <stop offset="100%" stopColor="#6d28d9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="ts" tickFormatter={shortTime} tickLine={false} axisLine={false} minTickGap={48} />
              <YAxis tickLine={false} axisLine={false} width={36} />
              <Tooltip content={<ChartTooltip unit="GB" />} />
              <Area type="monotone" dataKey="MEMORY_USAGE_GB" name="Use" stroke="#6d28d9" strokeWidth={2.5} fill="url(#memoryFill)" />
              <Line type="monotone" dataKey="MEMORY_LIMIT_GB" name="Limit" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Network transfer</CardTitle>
          <CardDescription>Received and transmitted gigabytes</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={networkData}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="ts" tickFormatter={shortTime} tickLine={false} axisLine={false} minTickGap={48} />
              <YAxis tickLine={false} axisLine={false} width={44} />
              <Tooltip content={<ChartTooltip unit="GB" />} />
              <Line type="monotone" dataKey="NETWORK_RX_GB" name="Received" stroke="#6d28d9" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="NETWORK_TX_GB" name="Sent" stroke="#0f766e" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function DatabaseOverview({ postgres }: { postgres: PostgresSnapshot }) {
  if (!postgres.available || !postgres.overview) {
    return (
      <EmptySource
        title="PostgreSQL is not connected"
        message={postgres.notices[0] || "No existing PostgreSQL service was discovered in this environment."}
      />
    );
  }

  const overview = postgres.overview;
  const connectionUse =
    overview.maxConnections > 0
      ? (overview.totalConnections / overview.maxConnections) * 100
      : null;
  const totalTransactions =
    overview.transactionsCommitted + overview.transactionsRolledBack;
  const commitRate =
    totalTransactions > 0
      ? (overview.transactionsCommitted / totalTransactions) * 100
      : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Database size" value={bytes(overview.databaseSizeBytes)} detail={postgres.database || "Current database"} accent />
        <MetricCard label="Connections" value={`${overview.totalConnections} / ${overview.maxConnections}`} detail={`${percent(connectionUse)} of capacity`} />
        <MetricCard label="Cache hit ratio" value={percent(overview.cacheHitRatio)} detail="Shared buffer reads served from cache" />
        <MetricCard label="Commit rate" value={percent(commitRate)} detail={`${compact(overview.transactionsCommitted)} committed transactions`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Connection states</CardTitle>
            <CardDescription>Sessions grouped by their current PostgreSQL state</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {postgres.connections?.map((connection) => (
                <div key={connection.state}>
                  <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                    <span>
                      <span className="font-medium capitalize">{connection.state}</span>
                      <span className="ml-2 text-xs text-slate-600 dark:text-slate-400">
                        oldest {duration(connection.oldestSeconds)}
                      </span>
                    </span>
                    <span className="tabular-nums text-slate-600 dark:text-slate-400">{connection.count}</span>
                  </div>
                  <div className="h-2 rounded-sm bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-2 rounded-sm bg-violet-600"
                      style={{
                        width: `${Math.max(
                          2,
                          (connection.count / Math.max(overview.totalConnections, 1)) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Database counters</CardTitle>
            <CardDescription>Values accumulated by PostgreSQL since statistics were reset</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
              {[
                ["Rows returned", compact(overview.tuplesReturned)],
                ["Rows fetched", compact(overview.tuplesFetched)],
                ["Rows inserted", compact(overview.tuplesInserted)],
                ["Rows updated", compact(overview.tuplesUpdated)],
                ["Rows deleted", compact(overview.tuplesDeleted)],
                ["Temporary data", bytes(overview.tempBytes)],
                ["Deadlocks", compact(overview.deadlocks)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-5 py-3">
                  <dt className="text-slate-600 dark:text-slate-400">{label}</dt>
                  <dd className="font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lock inventory</CardTitle>
          <CardDescription>Current PostgreSQL locks grouped by mode and grant state</CardDescription>
        </CardHeader>
        <CardContent>
          {postgres.locks?.length ? (
            <div className="flex flex-wrap gap-2">
              {postgres.locks.map((lock) => (
                <Badge
                  key={`${lock.mode}-${lock.granted}`}
                  tone={lock.granted ? "neutral" : "warning"}
                  className="min-h-8"
                >
                  {lock.mode}: {lock.count} {lock.granted ? "granted" : "waiting"}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-400">No lock records are visible to this database role.</p>
          )}
        </CardContent>
      </Card>
      {postgres.version && (
        <p className="break-words font-mono text-xs leading-5 text-slate-600 dark:text-slate-400">
          {postgres.version}
        </p>
      )}
    </div>
  );
}

function DataTable({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[760px] text-left text-sm" aria-label={label}>
        {children}
      </table>
    </div>
  );
}

function TablesView({ postgres }: { postgres: PostgresSnapshot }) {
  if (!postgres.available) {
    return <EmptySource title="Table statistics are unavailable" message={postgres.notices[0]} />;
  }
  if (!postgres.tables?.length) {
    return <EmptySource title="No user tables found" message="This database has no user tables visible to the configured PostgreSQL role." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-base font-semibold">Table statistics</h2>
        <DataTable label="PostgreSQL table statistics">
      <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400">
        <tr>
          <th className="px-4 py-3 font-semibold">Table</th>
          <th className="px-4 py-3 font-semibold">Total size</th>
          <th className="px-4 py-3 font-semibold">Table size</th>
          <th className="px-4 py-3 font-semibold">Index size</th>
          <th className="px-4 py-3 font-semibold">Live rows</th>
          <th className="px-4 py-3 font-semibold">Estimated rows</th>
          <th className="px-4 py-3 font-semibold">Dead rows</th>
          <th className="px-4 py-3 font-semibold">Index scans</th>
          <th className="px-4 py-3 font-semibold">Sequential scans</th>
          <th className="px-4 py-3 font-semibold">Last analyze</th>
          <th className="px-4 py-3 font-semibold">Last vacuum</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
        {postgres.tables.map((table) => (
          <tr key={`${table.schema}.${table.table}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/70">
            <td className="px-4 py-4">
              <p className="font-semibold">{table.table}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{table.schema}</p>
            </td>
            <td className="px-4 py-4 tabular-nums">{bytes(table.totalBytes)}</td>
            <td className="px-4 py-4 tabular-nums">{bytes(table.tableBytes)}</td>
            <td className="px-4 py-4 tabular-nums">{bytes(table.indexBytes)}</td>
            <td className="px-4 py-4 tabular-nums">{compact(table.liveRows)}</td>
            <td className="px-4 py-4 tabular-nums">{compact(table.estimatedRows)}</td>
            <td className="px-4 py-4 tabular-nums">{compact(table.deadRows)}</td>
            <td className="px-4 py-4 tabular-nums">{compact(table.indexScans)}</td>
            <td className="px-4 py-4 tabular-nums">{compact(table.sequentialScans)}</td>
            <td className="px-4 py-4 text-slate-600 dark:text-slate-400">{dateTime(table.lastAnalyze)}</td>
            <td className="px-4 py-4 text-slate-600 dark:text-slate-400">{dateTime(table.lastVacuum)}</td>
          </tr>
        ))}
      </tbody>
        </DataTable>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold">Index statistics</h2>
        {postgres.indexes?.length ? (
          <DataTable label="PostgreSQL index statistics">
            <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Index</th>
                <th className="px-4 py-3 font-semibold">Table</th>
                <th className="px-4 py-3 font-semibold">Size</th>
                <th className="px-4 py-3 font-semibold">Scans</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {postgres.indexes.map((index) => (
                <tr key={`${index.schema}.${index.index}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/70">
                  <td className="px-4 py-4 font-mono text-xs">{index.index}</td>
                  <td className="px-4 py-4">
                    <p className="font-semibold">{index.table}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{index.schema}</p>
                  </td>
                  <td className="px-4 py-4 tabular-nums">{bytes(index.sizeBytes)}</td>
                  <td className="px-4 py-4 tabular-nums">{compact(index.scans)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400">No user indexes are visible to this database role.</p>
        )}
      </div>
    </div>
  );
}

function QueriesView({ postgres }: { postgres: PostgresSnapshot }) {
  if (!postgres.available) {
    return <EmptySource title="Query statistics are unavailable" message={postgres.notices[0]} />;
  }
  if (!postgres.slowQueries?.length) {
    return (
      <EmptySource
        title="No query analytics available"
        message={postgres.notices[0] || "No statements have been recorded yet."}
      />
    );
  }

  return (
    <DataTable label="PostgreSQL statement statistics">
      <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400">
        <tr>
          <th className="px-4 py-3 font-semibold">Statement</th>
          <th className="px-4 py-3 font-semibold">Calls</th>
          <th className="px-4 py-3 font-semibold">Mean time</th>
          <th className="px-4 py-3 font-semibold">Total time</th>
          <th className="px-4 py-3 font-semibold">Rows</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
        {postgres.slowQueries.map((query, index) => (
          <tr key={`${query.query}-${index}`} className="align-top hover:bg-slate-50 dark:hover:bg-slate-900/70">
            <td className="max-w-xl px-4 py-4 font-mono text-xs leading-5">{query.query}</td>
            <td className="px-4 py-4 tabular-nums">{compact(query.calls)}</td>
            <td className="px-4 py-4 tabular-nums">{query.meanMs.toFixed(2)} ms</td>
            <td className="px-4 py-4 tabular-nums">{query.totalMs.toFixed(2)} ms</td>
            <td className="px-4 py-4 tabular-nums">{compact(query.rows)}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function DeploymentsView({ railway }: { railway: RailwaySnapshot }) {
  if (!railway.deployments.length) {
    return (
      <EmptySource
        title="No deployments found"
        message="Railway returned no deployment records for services in this environment."
      />
    );
  }
  return (
    <DataTable label="Railway deployments">
      <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400">
        <tr>
          <th className="px-4 py-3 font-semibold">Service</th>
          <th className="px-4 py-3 font-semibold">Status</th>
          <th className="px-4 py-3 font-semibold">Deployment ID</th>
          <th className="px-4 py-3 font-semibold">Created</th>
          <th className="px-4 py-3 font-semibold">Updated</th>
          <th className="px-4 py-3 font-semibold">Rollback</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
        {railway.deployments.map((deployment) => (
          <tr key={deployment.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/70">
            <td className="px-4 py-4 font-semibold">{deployment.serviceName}</td>
            <td className="px-4 py-4"><Badge tone={statusTone(deployment.status)}>{deployment.status}</Badge></td>
            <td className="px-4 py-4 font-mono text-xs">{deployment.id}</td>
            <td className="px-4 py-4 text-slate-600 dark:text-slate-400">{dateTime(deployment.createdAt)}</td>
            <td className="px-4 py-4 text-slate-600 dark:text-slate-400">{dateTime(deployment.updatedAt)}</td>
            <td className="px-4 py-4">{deployment.canRollback ? "Available" : "Unavailable"}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function Overview({
  railway,
  postgres,
}: {
  railway: RailwaySnapshot | null;
  postgres: PostgresSnapshot | null;
}) {
  const metrics = railway?.metrics || [];
  const cpuUse = latestValue(metrics, "CPU_USAGE");
  const cpuLimit = latestValue(metrics, "CPU_LIMIT");
  const memoryUse = latestValue(metrics, "MEMORY_USAGE_GB");
  const memoryLimit = latestValue(metrics, "MEMORY_LIMIT_GB");
  const diskUse =
    latestValue(metrics, "DISK_USAGE_GB") +
    latestValue(metrics, "EPHEMERAL_DISK_USAGE_GB");
  const running =
    railway?.services.filter(
      (service) => service.latestDeployment?.status === "SUCCESS",
    ).length || 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {railway ? (
          <>
            <MetricCard label="Services online" value={`${running} / ${railway.services.length}`} detail={railway.environment.name} accent />
            <MetricCard label="CPU in use" value={`${cpuUse.toFixed(3)} cores`} detail={cpuLimit ? `${percent((cpuUse / cpuLimit) * 100)} of allocation` : "Limit data unavailable"} />
            <MetricCard label="Memory in use" value={`${memoryUse.toFixed(2)} GB`} detail={memoryLimit ? `${percent((memoryUse / memoryLimit) * 100)} of allocation` : "Limit data unavailable"} />
            <MetricCard label="Disk in use" value={`${diskUse.toFixed(2)} GB`} detail="Persistent and ephemeral storage" />
          </>
        ) : (
          <div className="sm:col-span-2 xl:col-span-4">
            <EmptySource title="Railway metrics are not connected" message="Add a Railway API token and project scope to see service health, resource use, and deployments." />
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_.75fr]">
        {railway ? (
          <Card>
            <CardHeader>
              <CardTitle>Service health</CardTitle>
              <CardDescription>Latest deployment status for every service in this environment</CardDescription>
            </CardHeader>
            <CardContent>
              {railway.services.length ? (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {railway.services.map((service) => (
                    <div key={service.id} className="flex min-h-16 items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{service.name}</p>
                        <p className="mt-1 truncate font-mono text-xs text-slate-600 dark:text-slate-400">
                          service {service.id}
                        </p>
                        <p className="mt-1 truncate font-mono text-xs text-slate-600 dark:text-slate-400">
                          deployment {service.latestDeployment?.id || "unavailable"}
                        </p>
                      </div>
                      <Badge tone={statusTone(service.latestDeployment?.status || "EMPTY")}>
                        {service.latestDeployment?.status || "NO DEPLOYMENT"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-slate-600 dark:text-slate-400">
                  No services exist in this environment.
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>PostgreSQL health</CardTitle>
            <CardDescription>Live values from the connected database</CardDescription>
          </CardHeader>
          <CardContent>
            {postgres?.available && postgres.overview ? (
              <dl className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
                <div className="flex justify-between gap-5 py-3"><dt className="text-slate-600 dark:text-slate-400">Cache hit</dt><dd className="font-semibold">{percent(postgres.overview.cacheHitRatio)}</dd></div>
                <div className="flex justify-between gap-5 py-3"><dt className="text-slate-600 dark:text-slate-400">Active sessions</dt><dd className="font-semibold">{postgres.overview.activeConnections}</dd></div>
                <div className="flex justify-between gap-5 py-3"><dt className="text-slate-600 dark:text-slate-400">Database size</dt><dd className="font-semibold">{bytes(postgres.overview.databaseSizeBytes)}</dd></div>
                <div className="flex justify-between gap-5 py-3"><dt className="text-slate-600 dark:text-slate-400">Deadlocks</dt><dd className="font-semibold">{compact(postgres.overview.deadlocks)}</dd></div>
              </dl>
            ) : (
              <p className="py-12 text-center text-sm leading-6 text-slate-600 dark:text-slate-400">
                {postgres?.notices[0] || "PostgreSQL telemetry is unavailable."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [range, setRange] = React.useState(24);
  const [state, setState] = React.useState<ViewState>({ kind: "loading" });
  const [dark, setDark] = React.useState(false);

  const load = React.useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await fetch(`/api/dashboard?hours=${range}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as DashboardPayload;
      if (!response.ok) {
        const details = Object.values(payload.sourceErrors || {})
          .filter(Boolean)
          .join(" ");
        throw new Error(details || payload.error || "Telemetry request failed.");
      }
      setState({ kind: "ready", payload });
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Telemetry request failed.",
      });
    }
  }, [range]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.assign("/login");
  }

  if (state.kind === "loading") return <LoadingView />;
  if (state.kind === "error")
    return <ErrorView message={state.message} onRetry={load} />;

  const { payload } = state;
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Mark />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Postgres Observer</p>
              <p className="truncate text-xs text-slate-600 dark:text-slate-400">
                {payload.railway
                  ? `${payload.railway.project.name} / ${payload.railway.environment.name}`
                  : "PostgreSQL telemetry"}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="sr-only" htmlFor="time-range">Metric time range</label>
            <select
              id="time-range"
              value={range}
              onChange={(event) => setRange(Number(event.target.value))}
              className="min-h-11 min-w-[8rem] flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 dark:border-slate-700 dark:bg-slate-950 sm:flex-none"
            >
              {ranges.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <Button variant="outline" size="icon" onClick={() => setDark((value) => !value)} aria-label={dark ? "Use light theme" : "Use dark theme"}>
              {dark ? "L" : "D"}
            </Button>
            <Button variant="outline" onClick={load}>Refresh</Button>
            <Button variant="ghost" onClick={signOut}>Sign out</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">Live operations</p>
            <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              Infrastructure and database telemetry in one view.
            </h1>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400 md:text-right">
            <p>Updated {dateTime(payload.generatedAt)}</p>
            {payload.railway?.rateLimit.remaining && (
              <p className="mt-1">
                Railway API quota: {payload.railway.rateLimit.remaining}
                {payload.railway.rateLimit.limit
                  ? ` of ${payload.railway.rateLimit.limit} remaining`
                  : " remaining"}
              </p>
            )}
          </div>
        </div>

        {(payload.sourceErrors.railway || payload.sourceErrors.postgres) && (
          <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <strong>Partial data:</strong>{" "}
            {payload.sourceErrors.railway || payload.sourceErrors.postgres}
          </div>
        )}

        <Tabs defaultValue="overview">
          <TabsList aria-label="Dashboard sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
            <TabsTrigger value="database">Database</TabsTrigger>
            <TabsTrigger value="deployments">Deployments</TabsTrigger>
            <TabsTrigger value="tables">Tables</TabsTrigger>
            <TabsTrigger value="queries">Queries</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Overview railway={payload.railway} postgres={payload.postgres} />
          </TabsContent>
          <TabsContent value="infrastructure">
            {payload.railway ? <Infrastructure railway={payload.railway} /> : <EmptySource title="Railway metrics are unavailable" message={payload.sourceErrors.railway || "Configure Railway API access to load infrastructure metrics."} />}
          </TabsContent>
          <TabsContent value="database">
            {payload.postgres ? <DatabaseOverview postgres={payload.postgres} /> : <EmptySource title="PostgreSQL metrics are unavailable" message={payload.sourceErrors.postgres || "No existing PostgreSQL service was discovered in this environment."} />}
          </TabsContent>
          <TabsContent value="deployments">
            {payload.railway ? <DeploymentsView railway={payload.railway} /> : <EmptySource title="Deployments are unavailable" message={payload.sourceErrors.railway || "Configure Railway API access to load deployments."} />}
          </TabsContent>
          <TabsContent value="tables">
            {payload.postgres ? <TablesView postgres={payload.postgres} /> : <EmptySource title="Tables are unavailable" message={payload.sourceErrors.postgres || "No existing PostgreSQL service was discovered in this environment."} />}
          </TabsContent>
          <TabsContent value="queries">
            {payload.postgres ? <QueriesView postgres={payload.postgres} /> : <EmptySource title="Queries are unavailable" message={payload.sourceErrors.postgres || "No existing PostgreSQL service was discovered in this environment."} />}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
