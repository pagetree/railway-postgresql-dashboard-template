# Deploy and Host Postgres Observer on Railway

A deployable Railway dashboard for infrastructure and PostgreSQL telemetry.

## About Hosting Postgres Observer

Railway data includes services, environments, deployment IDs, deployment status, rollback availability, CPU use and limits, memory use and limits, network transfer, persistent disk, ephemeral disk, backup storage, regions, and deployment grouping.

PostgreSQL data includes database size, connection use, cache hit ratio, commits, rollbacks, deadlocks, temporary data, row activity, locks, table sizes, indexes, scans, dead rows, vacuum history, analyze history, and statement performance when `pg_stat_statements` is available.

## Why Deploy Postgres Observer on Railway?

Postgres Observer combines Railway infrastructure metrics and PostgreSQL statistics in one private dashboard. It connects to the PostgreSQL database already running in your Railway project and keeps credentials in server variables.

## Common Use Cases

Monitor CPU, memory, network, disk, backups, deployments, database connections, cache efficiency, table growth, locks, vacuum activity, indexes, and query performance.

## Dependencies for Postgres Observer Hosting

### Deployment Dependencies

The template deploys only the Observer service. It connects to an existing PostgreSQL service.

## Railway Template Configuration

The deployer provides two connections:

1. `DATABASE_URL`

   What it is: The connection string for the PostgreSQL database that is already running.

   Where to find it: Open the existing PostgreSQL service in Railway, select Variables, and reference its `DATABASE_URL`. A typical reference is `${{Postgres.DATABASE_URL}}`, with `Postgres` replaced by the actual service name.

2. `RAILWAY_PROJECT_TOKEN`

   What it is: A project scoped token that lets Observer read CPU, RAM, network, storage, service, and deployment metrics from Railway.

   Where to find it: Open the Railway project, select Project Settings, select Tokens, create a token for the environment being observed, then paste its value here.

The template generates `DASHBOARD_PASSWORD` automatically as a secret. Deployers do not enter project IDs, environment IDs, or a dashboard password.

The dashboard sends Railway credentials only from the server. Tokens and database credentials are never returned to the browser.

## Local setup

Copy `.env.example` to `.env.local`, add the required values, install dependencies, then use the standard Next.js development command.

## PostgreSQL permissions

The dashboard performs read only statistics queries. Standard PostgreSQL statistics are available to the connected role. Statement analytics require `pg_stat_statements` to already be enabled and visible to that role. This project does not install extensions or modify the database schema.

## Health check

Railway checks `/api/health`. This endpoint reports process availability and does not expose credentials or telemetry.
