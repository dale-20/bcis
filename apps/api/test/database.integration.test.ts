import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../src/db/client.js';
import { applicationMetadata } from '../src/db/schema.js';
import { buildApp } from '../src/app.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || url === process.env.DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a separate disposable database ending in _test. Integration tests reset its foundation tables.');
}
const database = createDatabase({ DATABASE_URL: url, DATABASE_POOL_MAX: 3 });
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const app = await buildApp({ probeDatabase: database.probe, logLevel: 'silent' });

beforeAll(async () => {
  await database.pool.query('DROP TABLE IF EXISTS application_metadata');
  await database.pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
});
afterAll(async () => { await app.close(); await database.close(); });

describe.sequential('real PostgreSQL foundation', () => {
  it('reports missing migrations before schema creation', async () => {
    expect(await database.probe()).toBe('migration_required');
    expect((await app.inject('/health/ready')).statusCode).toBe(503);
  });
  it('applies migrations on a clean database, then safely applies them again', async () => {
    await migrate(database.db, { migrationsFolder });
    await migrate(database.db, { migrationsFolder });
    expect(await database.probe()).toBe('connected');
    expect(await database.db.select().from(applicationMetadata)).toHaveLength(1);
  });
  it('enforces the singleton and positive schema-version constraints', async () => {
    await expect(database.pool.query('INSERT INTO application_metadata VALUES (true, 1, now())')).rejects.toMatchObject({ code: '23505' });
    await expect(database.pool.query('INSERT INTO application_metadata VALUES (false, 1, now())')).rejects.toMatchObject({ code: '23514' });
    await expect(database.pool.query('UPDATE application_metadata SET schema_version = 0')).rejects.toMatchObject({ code: '23514' });
  });
  it('rolls back a multi-step transaction after a constraint failure', async () => {
    await expect(database.db.transaction(async (transaction) => {
      await transaction.update(applicationMetadata).set({ schemaVersion: 2 });
      await transaction.execute(sql`INSERT INTO application_metadata (singleton, schema_version) VALUES (false, 1)`);
    })).rejects.toThrow();
    expect(await database.probe()).toBe('connected');
  });
  it('serves simultaneous readiness reads for three clients', async () => {
    const responses = await Promise.all(Array.from({ length: 3 }, () => app.inject('/health/ready')));
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    for (const response of responses) expect(response.json()).toMatchObject({ database: 'connected', status: 'ready' });
  });
  it('reports a wrong schema version and recovers after correction', async () => {
    try {
      await database.db.update(applicationMetadata).set({ schemaVersion: 2 });
      expect(await database.probe()).toBe('migration_required');
    } finally { await database.db.update(applicationMetadata).set({ schemaVersion: 1 }); }
    expect(await database.probe()).toBe('connected');
  });
  it('reports unreachable PostgreSQL without pretending the API died', async () => {
    const unavailable = createDatabase({ DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/bcis_test', DATABASE_POOL_MAX: 1 });
    try { expect(await unavailable.probe()).toBe('unavailable'); }
    finally { await unavailable.close(); }
  });
});
