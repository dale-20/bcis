import { SCHEMA_VERSION, type Readiness } from '@bcis/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Environment } from '../config.js';
import { applicationMetadata } from './schema.js';

export function createDatabase(environment: Pick<Environment, 'DATABASE_URL' | 'DATABASE_POOL_MAX'>) {
  const pool = new pg.Pool({
    connectionString: environment.DATABASE_URL,
    max: environment.DATABASE_POOL_MAX,
    connectionTimeoutMillis: 2000,
    statement_timeout: 2000,
    idleTimeoutMillis: 10000,
  });
  const db = drizzle(pool);
  async function probe(): Promise<Readiness['database']> {
    try {
      const rows = await db.select({ version: applicationMetadata.schemaVersion }).from(applicationMetadata);
      return rows.length === 1 && rows[0]?.version === SCHEMA_VERSION ? 'connected' : 'migration_required';
    } catch (error) {
      const cause = error instanceof Error && 'cause' in error ? error.cause : error;
      if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '42P01') {
        return 'migration_required';
      }
      return 'unavailable';
    }
  }
  return { db, pool, probe, close: () => pool.end() };
}
export type Database = ReturnType<typeof createDatabase>;
