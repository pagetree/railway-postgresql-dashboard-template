# Deploy and Host Postgres Observer on Railway

A deployable Railway dashboard for infrastructure and PostgreSQL telemetry.

## About Hosting Postgres Observer

Railway data includes services, environments, deployment IDs, deployment status, rollback availability, CPU use and limits, memory use and limits, network transfer, persistent disk, ephemeral disk, backup storage, regions, and deployment grouping.

PostgreSQL data includes database size, connection use, cache hit ratio, commits, rollbacks, deadlocks, temporary data, row activity, locks, table sizes, indexes, scans, dead rows, vacuum history, analyze history, and statement performance when `pg_stat_statements` is available.

## Why Deploy Postgres Observer on Railway?

Postgres Observer combines Railway infrastructure metrics and PostgreSQL statistics in one private dashboard. Railway hosts the dashboard beside its database, wires the internal database connection, manages deployment health checks, and keeps credentials in server variables.

## Common Use Cases

Monitor CPU, memory, network, disk, backups, deployments, database connections, cache efficiency, table growth, locks, vacuum activity, indexes, and query performance.

## Dependencies for Postgres Observer Hosting

### Deployment Dependencies

The template includes the dashboard service and PostgreSQL. The deployer supplies one project scoped Railway token.

## Railway Template Configuration

The deployer enters only one value:

1. `RAILWAY_PROJECT_TOKEN`: A project token scoped to the environment being observed.

The template wires `DATABASE_URL` to `${{Postgres.DATABASE_URL}}` and generates `DASHBOARD_PASSWORD` automatically as a secret. Deployers do not enter a database URL, project ID, environment ID, or dashboard password.

The dashboard sends Railway credentials only from the server. Tokens and database credentials are never returned to the browser.

## Local setup

Copy `.env.example` to `.env.local`, add the required values, install dependencies, then use the standard Next.js development command.

## PostgreSQL permissions

The dashboard performs read only statistics queries. Standard PostgreSQL statistics are available to the connected role. Statement analytics require `pg_stat_statements` to already be enabled and visible to that role. This project does not install extensions or modify the database schema.

## Health check

Railway checks `/api/health`. This endpoint reports process availability and does not expose credentials or telemetry.
