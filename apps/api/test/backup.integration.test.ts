import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PasswordHasher, type ScryptParameters } from '../src/auth/password.js';
import { seedAuthorization, type DemoAccount } from '../src/auth/seed.js';
import { createDatabase } from '../src/db/client.js';
import { seedOperationalDemoData } from '../src/db/seed-operational.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || url === process.env.DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a separate disposable database ending in _test.');
const database = createDatabase({ DATABASE_URL: url, DATABASE_POOL_MAX: 3 });
const hasher = new PasswordHasher({ cost: 16_384, blockSize: 8, parallelization: 1, keyLength: 32, saltLength: 16, maxMemory: 64 * 1024 * 1024 } satisfies ScryptParameters);
const accounts: readonly DemoAccount[] = [{ username: 'owner.demo', displayName: 'Demo Owner', role: 'OWNER' }];
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

beforeAll(async () => {
  await database.pool.query('DROP SCHEMA IF EXISTS public CASCADE'); await database.pool.query('CREATE SCHEMA public'); await database.pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await migrate(database.db, { migrationsFolder }); await seedAuthorization(database, 'password', hasher, accounts); await seedOperationalDemoData(database);
});
afterAll(async () => database.close());

describe('AT-12 backup and approved restore', () => {
  it('creates, hashes, restores, integrity-checks, and verifies expected records', async () => {
    const execute = promisify(execFile);
    const { stdout } = await execute(process.execPath, ['scripts/verify-backup-restore.mjs', '--approved-by', 'owner.demo'], { cwd: fileURLToPath(new URL('../../..', import.meta.url)), env: { ...process.env, TEST_DATABASE_URL: url }, windowsHide: true, timeout: 60_000 });
    const result = JSON.parse(stdout.trim()) as { status: string; mutationAbsentAfterRestore: boolean; sha256: string; sizeBytes: number; baseline: Record<string, number>; restored: Record<string, number> };
    expect(result).toMatchObject({ status: 'PASSED', mutationAbsentAfterRestore: true });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/); expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.restored).toMatchObject(result.baseline);
  }, 70_000);
});
