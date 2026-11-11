import { Pool } from "pg";
import { discoverPostgresUrl } from "@/lib/railway";

export type PostgresSnapshot = {
  available: boolean;
  version?: string;
  database?: string;
  collectedAt?: string;
  overview?: {
    databaseSizeBytes: number;
    activeConnections: number;
    totalConnections: number;
    maxConnections: number;
    cacheHitRatio: number | null;
    transactionsCommitted: number;
    transactionsRolledBack: number;
    deadlocks: number;
    tempBytes: number;
    tuplesReturned: number;
    tuplesFetched: number;
    tuplesInserted: number;
    tuplesUpdated: number;
    tuplesDeleted: number;
  };
  connections?: Array<{
    state: string;
    count: number;
    oldestSeconds: number;
  }>;
  tables?: Array<{
    schema: string;
    table: string;
    totalBytes: number;
    tableBytes: number;
    indexBytes: number;
    estimatedRows: number;
    sequentialScans: number;
    indexScans: number;
    liveRows: number;
    deadRows: number;
    lastVacuum: string | null;
    lastAnalyze: string | null;
  }>;
  indexes?: Array<{
    schema: string;
    table: string;
    index: string;
    sizeBytes: number;
    scans: number;
  }>;
  locks?: Array<{ mode: string; granted: boolean; count: number }>;
  slowQueries?: Array<{
    query: string;
    calls: number;
    totalMs: number;
    meanMs: number;
    rows: number;
  }>;
  notices: string[];
};

let pool: Pool | undefined;

async function getPool() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    (await discoverPostgresUrl());
  if (!connectionString) return null;

  pool ||= new Pool({
    connectionString,
    max: 3,
    application_name: "railway-postgres-observer",
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
    ssl:
      process.env.PGSSLMODE === "disable"
        ? false
        : { rejectUnauthorized: false },
  });
  return pool;
}

export async function getPostgresSnapshot(): Promise<PostgresSnapshot> {
  const databasePool = await getPool();
  if (!databasePool) {
    return {
      available: false,
      notices: [
        "No existing PostgreSQL service with DATABASE_URL was found in this Railway environment.",
      ],
    };
  }

  const client = await databasePool.connect();
  const notices: string[] = [];

  try {
    const [
      identity,
      overview,
      connections,
      tables,
      indexes,
      locks,
    ] = await Promise.all([
      client.query(`select version(), current_database() as database`),
      client.query(`
        select
          pg_database_size(current_database())::float8 as database_size_bytes,
          (select count(*) from pg_stat_activity where datname = current_database())::int as total_connections,
          (select count(*) from pg_stat_activity where datname = current_database() and state = 'active')::int as active_connections,
          current_setting('max_connections')::int as max_connections,
          case when blks_hit + blks_read = 0 then null
            else round((blks_hit::numeric / (blks_hit + blks_read)) * 100, 2)
          end::float8 as cache_hit_ratio,
          xact_commit::float8 as transactions_committed,
          xact_rollback::float8 as transactions_rolled_back,
          deadlocks::float8,
          temp_bytes::float8,
          tup_returned::float8 as tuples_returned,
          tup_fetched::float8 as tuples_fetched,
          tup_inserted::float8 as tuples_inserted,
          tup_updated::float8 as tuples_updated,
          tup_deleted::float8 as tuples_deleted
        from pg_stat_database
        where datname = current_database()
      `),
      client.query(`
        select coalesce(state, 'unknown') as state, count(*)::int,
          coalesce(max(extract(epoch from now() - query_start)), 0)::float8 as oldest_seconds
        from pg_stat_activity
        where datname = current_database()
        group by state
        order by count(*) desc
      `),
      client.query(`
        select
          s.schemaname as schema,
          s.relname as table,
          pg_total_relation_size(s.relid)::float8 as total_bytes,
          pg_relation_size(s.relid)::float8 as table_bytes,
          pg_indexes_size(s.relid)::float8 as index_bytes,
          c.reltuples::float8 as estimated_rows,
          s.seq_scan::float8 as sequential_scans,
          s.idx_scan::float8 as index_scans,
          s.n_live_tup::float8 as live_rows,
          s.n_dead_tup::float8 as dead_rows,
          s.last_vacuum,
          s.last_analyze
        from pg_stat_user_tables s
        join pg_class c on c.oid = s.relid
        order by pg_total_relation_size(s.relid) desc
        limit 50
      `),
      client.query(`
        select
          schemaname as schema,
          relname as table,
          indexrelname as index,
          pg_relation_size(indexrelid)::float8 as size_bytes,
          idx_scan::float8 as scans
        from pg_stat_user_indexes
        order by pg_relation_size(indexrelid) desc
        limit 50
      `),
      client.query(`
        select mode, granted, count(*)::int
        from pg_locks
        group by mode, granted
        order by count(*) desc
      `),
    ]);

    let slowQueries: PostgresSnapshot["slowQueries"] = [];
    try {
      const queryStats = await client.query(`
        select
          left(query, 300) as query,
          calls::float8,
          total_exec_time::float8 as total_ms,
          mean_exec_time::float8 as mean_ms,
          rows::float8
        from pg_stat_statements
        where query not ilike '%pg_stat_statements%'
        order by total_exec_time desc
        limit 15
      `);
      slowQueries = queryStats.rows.map((row) => ({
        query: row.query,
        calls: row.calls,
        totalMs: row.total_ms,
        meanMs: row.mean_ms,
        rows: row.rows,
      }));
    } catch {
      notices.push(
        "This view needs the pg_stat_statements extension on the Postgres database in DATABASE_URL. Open a SQL session on that Postgres service (not on Observer) and run: CREATE EXTENSION IF NOT EXISTS pg_stat_statements; Then open this tab again. Observer never creates extensions for you.",
      );
    }

    const metric = overview.rows[0];
    return {
      available: true,
      version: identity.rows[0].version,
      database: identity.rows[0].database,
      collectedAt: new Date().toISOString(),
      overview: {
        databaseSizeBytes: metric.database_size_bytes,
        activeConnections: metric.active_connections,
        totalConnections: metric.total_connections,
        maxConnections: metric.max_connections,
        cacheHitRatio: metric.cache_hit_ratio,
        transactionsCommitted: metric.transactions_committed,
        transactionsRolledBack: metric.transactions_rolled_back,
        deadlocks: metric.deadlocks,
        tempBytes: metric.temp_bytes,
        tuplesReturned: metric.tuples_returned,
        tuplesFetched: metric.tuples_fetched,
        tuplesInserted: metric.tuples_inserted,
        tuplesUpdated: metric.tuples_updated,
        tuplesDeleted: metric.tuples_deleted,
      },
      connections: connections.rows.map((row) => ({
        state: row.state,
        count: row.count,
        oldestSeconds: row.oldest_seconds,
      })),
      tables: tables.rows.map((row) => ({
        schema: row.schema,
        table: row.table,
        totalBytes: row.total_bytes,
        tableBytes: row.table_bytes,
        indexBytes: row.index_bytes,
        estimatedRows: row.estimated_rows,
        sequentialScans: row.sequential_scans,
        indexScans: row.index_scans,
        liveRows: row.live_rows,
        deadRows: row.dead_rows,
        lastVacuum: row.last_vacuum,
        lastAnalyze: row.last_analyze,
      })),
      indexes: indexes.rows.map((row) => ({
        schema: row.schema,
        table: row.table,
        index: row.index,
        sizeBytes: row.size_bytes,
        scans: row.scans,
      })),
      locks: locks.rows.map((row) => ({
        mode: row.mode,
        granted: row.granted,
        count: row.count,
      })),
      slowQueries,
      notices,
    };
  } finally {
    client.release();
  }
}
