import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { buildApp } from '../src/app.js';
import { PasswordHasher, type ScryptParameters } from '../src/auth/password.js';
import { seedAuthorization, type DemoAccount } from '../src/auth/seed.js';
import { AuthService } from '../src/auth/service.js';
import { createDatabase } from '../src/db/client.js';
import { auditLogs, users } from '../src/db/schema.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || url === process.env.DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a separate disposable database ending in _test. Integration tests reset its schemas.');
}

const testScryptParameters: ScryptParameters = {
  cost: 16_384,
  blockSize: 8,
  parallelization: 1,
  keyLength: 32,
  saltLength: 16,
  maxMemory: 64 * 1024 * 1024,
};
const seededAccounts: readonly DemoAccount[] = [
  { username: 'admin.demo', displayName: 'Demo Administrator', role: 'ADMIN' },
  { username: 'cashier.demo', displayName: 'Demo Cashier', role: 'CASHIER' },
];
const initialPassword = 'Synthetic-demo-password-1';
const database = createDatabase({ DATABASE_URL: url, DATABASE_POOL_MAX: 4 });
const hasher = new PasswordHasher(testScryptParameters);
const authService = new AuthService(database, hasher);
const app = await buildApp({ database, authService, probeDatabase: database.probe, logLevel: 'silent' });
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

interface LoginBody {
  token: string;
  user: { roles: string[]; permissions: string[]; mustChangePassword: boolean };
}

async function login(username: string, password: string): Promise<LoginBody> {
  const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { username, password } });
  expect(response.statusCode).toBe(200);
  return response.json<LoginBody>();
}

beforeAll(async () => {
  await database.pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await database.pool.query('CREATE SCHEMA public');
  await database.pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await migrate(database.db, { migrationsFolder });
  await seedAuthorization(database, initialPassword, hasher, seededAccounts);
});

afterAll(async () => {
  await app.close();
  await database.close();
});

describe.sequential('authentication and server-side authorization', () => {
  let adminToken = '';
  let cashierToken = '';

  it('returns the same public error for an unknown username and a wrong password', async () => {
    const unknown = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'missing.demo', password: 'wrong-password' } });
    const wrong = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'admin.demo', password: 'wrong-password' } });
    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json()).toMatchObject({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    expect(wrong.json()).toMatchObject({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
  });

  it('forces seeded administrators to replace the shared demo password', async () => {
    const result = await login('ADMIN.DEMO', initialPassword);
    adminToken = result.token;
    expect(result.user).toMatchObject({ roles: ['ADMIN'], mustChangePassword: true });

    const blocked = await app.inject({ method: 'GET', url: '/admin/users', headers: { authorization: `Bearer ${adminToken}` } });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({ error: 'PASSWORD_CHANGE_REQUIRED' });

    const changed = await app.inject({
      method: 'POST', url: '/auth/change-password', headers: { authorization: `Bearer ${adminToken}` },
      payload: { currentPassword: initialPassword, newPassword: 'Synthetic-admin-password-2' },
    });
    expect(changed.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/admin/users', headers: { authorization: `Bearer ${adminToken}` } })).statusCode).toBe(200);
  });

  it('denies a Cashier that calls an Administrator route directly and audits the attempt', async () => {
    const result = await login('cashier.demo', initialPassword);
    cashierToken = result.token;
    expect(result.user.roles).toEqual(['CASHIER']);
    expect(result.user.permissions).not.toContain('user.manage');
    const changed = await app.inject({
      method: 'POST', url: '/auth/change-password', headers: { authorization: `Bearer ${cashierToken}` },
      payload: { currentPassword: initialPassword, newPassword: 'Synthetic-cashier-password-2' },
    });
    expect(changed.statusCode).toBe(204);

    const response = await app.inject({ method: 'GET', url: '/admin/users', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'FORBIDDEN' });
    const denied = await database.db.select().from(auditLogs).where(eq(auditLogs.action, 'authorization.denied'));
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ entityId: 'user.manage', reason: 'MISSING_PERMISSION' });
    const backupResponse = await app.inject({ method: 'GET', url: '/system/backups', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(backupResponse.statusCode).toBe(403);
    expect(backupResponse.json()).toMatchObject({ error: 'FORBIDDEN' });
    const backupDenied = await database.db.select().from(auditLogs).where(eq(auditLogs.entityId, 'backup.create'));
    expect(backupDenied).toHaveLength(1);
  });

  it('requires a valid bearer session for protected routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/admin/users' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'SESSION_INVALID' });
  });

  it('revokes a session on logout', async () => {
    const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(logout.statusCode).toBe(204);
    const afterLogout = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(afterLogout.statusCode).toBe(401);
  });

  it('locks an account after five failed login attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST', url: '/auth/login', payload: { username: 'cashier.demo', password: 'still-the-wrong-password' },
      });
      expect(response.statusCode).toBe(401);
    }
    const lockedLogin = await app.inject({
      method: 'POST', url: '/auth/login', payload: { username: 'cashier.demo', password: 'Synthetic-cashier-password-2' },
    });
    expect(lockedLogin.statusCode).toBe(401);
    expect(lockedLogin.json()).toMatchObject({ error: 'INVALID_CREDENTIALS' });
    const [cashier] = await database.db.select({ lockedUntil: users.lockedUntil }).from(users)
      .where(eq(users.normalizedUsername, 'cashier.demo'));
    expect(cashier?.lockedUntil).toBeInstanceOf(Date);
  });

  it('prevents audit updates and deletes in PostgreSQL', async () => {
    await expect(database.pool.query("UPDATE audit_logs SET reason = 'tampered' WHERE action = 'authorization.denied'"))
      .rejects.toMatchObject({ code: '55000' });
    await expect(database.pool.query("DELETE FROM audit_logs WHERE action = 'authorization.denied'"))
      .rejects.toMatchObject({ code: '55000' });
  });
});

describe('normalized mandatory schema', () => {
  it('creates the required entity tables and concurrency constraints', async () => {
    const requiredTables = [
      'users', 'roles', 'permissions', 'role_permissions', 'user_roles', 'audit_logs',
      'subscribers', 'subscriber_contacts', 'subscriber_addresses', 'service_types', 'service_plans', 'service_accounts',
      'billing_cycles', 'invoices', 'invoice_items', 'adjustments', 'ledger_entries',
      'payments', 'payment_allocations', 'payment_proofs', 'payment_reversals', 'receipts', 'subscriber_credits',
      'collectors', 'collection_areas', 'collector_assignments', 'collection_batches', 'collection_batch_accounts', 'collector_remittances',
      'suspension_records', 'reconnection_records', 'application_settings', 'backup_history',
    ];
    const tableResult = await database.pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const actualTables = new Set(tableResult.rows.map((row) => row.table_name));
    for (const table of requiredTables) expect(actualTables.has(table), `missing table ${table}`).toBe(true);

    const indexResult = await database.pool.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'",
    );
    const indexes = new Set(indexResult.rows.map((row) => row.indexname));
    for (const index of [
      'invoices_service_cycle_uq', 'payments_gcash_reference_uq', 'receipts_number_uq', 'payment_reversals_payment_uq',
    ]) expect(indexes.has(index), `missing index ${index}`).toBe(true);
  });
});
