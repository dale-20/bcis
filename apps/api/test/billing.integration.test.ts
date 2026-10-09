import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { BillingCycleDetail, BillingGenerationResult, SubscriberLedger } from '@bcis/shared';
import { buildApp } from '../src/app.js';
import { PasswordHasher, type ScryptParameters } from '../src/auth/password.js';
import { seedAuthorization, type DemoAccount } from '../src/auth/seed.js';
import { AuthService } from '../src/auth/service.js';
import { createDatabase } from '../src/db/client.js';
import { seedOperationalDemoData } from '../src/db/seed-operational.js';
import { auditLogs, billingCycles, invoiceItems, invoices, ledgerEntries, serviceAccounts, servicePlans } from '../src/db/schema.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || url === process.env.DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a separate disposable database ending in _test.');
}

const initialPassword = 'password';
const testHasher = new PasswordHasher({ cost: 16_384, blockSize: 8, parallelization: 1, keyLength: 32, saltLength: 16, maxMemory: 64 * 1024 * 1024 } satisfies ScryptParameters);
const accounts: readonly DemoAccount[] = [
  { username: 'admin.demo', displayName: 'Demo Administrator', role: 'ADMIN' },
  { username: 'cashier.demo', displayName: 'Demo Cashier', role: 'CASHIER' },
];
const database = createDatabase({ DATABASE_URL: url, DATABASE_POOL_MAX: 5 });
const authService = new AuthService(database, testHasher);
const app = await buildApp({ database, authService, probeDatabase: database.probe, logLevel: 'silent' });
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
let adminToken = '';
let cashierToken = '';

async function activate(username: string): Promise<string> {
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { username, password: initialPassword } });
  expect(login.statusCode).toBe(200);
  const token = login.json<{ token: string }>().token;
  const changed = await app.inject({
    method: 'POST', url: '/auth/change-password', headers: { authorization: `Bearer ${token}` },
    payload: { currentPassword: initialPassword, newPassword: initialPassword },
  });
  expect(changed.statusCode).toBe(204);
  return token;
}

beforeAll(async () => {
  await database.pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await database.pool.query('CREATE SCHEMA public');
  await database.pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await migrate(database.db, { migrationsFolder });
  await seedAuthorization(database, initialPassword, testHasher, accounts);
  await seedOperationalDemoData(database);
  adminToken = await activate('admin.demo');
  cashierToken = await activate('cashier.demo');
});

afterAll(async () => { await app.close(); await database.close(); });

describe.sequential('monthly billing and reproducible ledger', () => {
  let cycleId = '';
  let expectedActiveServices = 0;
  let expectedTotal = 0n;

  it('generates one finalized invoice per active service atomically under concurrent runs', async () => {
    const [expected] = await database.db.select({
      count: sql<number>`count(*)::int`,
      total: sql<bigint>`sum(${serviceAccounts.currentRateCentavos})::bigint`,
    }).from(serviceAccounts).where(and(eq(serviceAccounts.status, 'ACTIVE'), sql`${serviceAccounts.billingStartDate} <= '2026-08-31'`));
    expectedActiveServices = expected?.count ?? 0;
    expectedTotal = expected?.total ?? 0n;

    const requests = await Promise.all([1, 2].map(() => app.inject({
      method: 'POST', url: '/billing/cycles/generate', headers: { authorization: `Bearer ${adminToken}` }, payload: { period: '2026-08' },
    })));
    expect(requests.map((response) => response.statusCode)).toEqual([200, 200]);
    const results = requests.map((response) => response.json<BillingGenerationResult>());
    const created = results.find((result) => result.invoicesCreated > 0);
    const duplicate = results.find((result) => result.invoicesCreated === 0);
    expect(created).toMatchObject({ periodStart: '2026-08-01', periodEnd: '2026-08-31', status: 'FINALIZED', invoicesCreated: expectedActiveServices, duplicatesSkipped: 0, totalInvoicedCentavos: expectedTotal.toString() });
    expect(duplicate).toMatchObject({ invoicesCreated: 0, duplicatesSkipped: expectedActiveServices, totalInvoicedCentavos: expectedTotal.toString() });
    cycleId = created?.cycleId ?? '';
    expect(cycleId).toBeTypeOf('string');

    const [stored] = await database.db.select({ count: sql<number>`count(*)::int` }).from(invoices);
    const [ledger] = await database.db.select({ count: sql<number>`count(*)::int` }).from(ledgerEntries);
    expect(stored?.count).toBe(expectedActiveServices);
    expect(ledger?.count).toBe(expectedActiveServices);
  });

  it('snapshots integer-centavo charges, invoice states, and deterministic due dates', async () => {
    const response = await app.inject({ method: 'GET', url: `/billing/cycles/${cycleId}`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(response.statusCode).toBe(200);
    const detail = response.json<BillingCycleDetail>();
    expect(detail.invoices).toHaveLength(expectedActiveServices);
    const invoice = detail.invoices.find((candidate) => candidate.serviceAccountNumber === 'SVC-00001-1');
    expect(invoice).toMatchObject({
      invoiceDate: '2026-08-01', dueDate: '2026-08-11', status: 'UNPAID',
      totalCentavos: '99900', balanceCentavos: '99900',
    });
    expect(invoice?.items).toEqual([expect.objectContaining({ type: 'SUBSCRIPTION', amountCentavos: '99900' })]);
    expect(detail.invoices.every((candidate) => candidate.status !== 'DRAFT' && candidate.finalizedAt.length > 0)).toBe(true);
  });

  it('keeps finalized invoice values and line items immutable after plan and service changes', async () => {
    const [service] = await database.db.select({ id: serviceAccounts.id, planId: serviceAccounts.planId }).from(serviceAccounts)
      .where(eq(serviceAccounts.serviceAccountNumber, 'SVC-00001-1')).limit(1);
    if (!service) throw new Error('Synthetic service missing');
    await database.db.update(serviceAccounts).set({ currentRateCentavos: 123_456n }).where(eq(serviceAccounts.id, service.id));
    await database.db.update(servicePlans).set({ priceCentavos: 123_456n }).where(eq(servicePlans.id, service.planId));
    const [invoice] = await database.db.select({ id: invoices.id }).from(invoices)
      .where(and(eq(invoices.serviceAccountId, service.id), eq(invoices.billingCycleId, cycleId))).limit(1);
    if (!invoice) throw new Error('Generated invoice missing');

    await expect(database.db.update(invoices).set({ totalCentavos: 123_456n }).where(eq(invoices.id, invoice.id))).rejects.toMatchObject({ cause: { code: 'P0001' } });
    await expect(database.db.update(invoiceItems).set({ amountCentavos: 123_456n }).where(eq(invoiceItems.invoiceId, invoice.id))).rejects.toMatchObject({ cause: { code: 'P0001' } });
    await expect(database.db.delete(invoices).where(eq(invoices.id, invoice.id))).rejects.toMatchObject({ cause: { code: 'P0001' } });
    const detail = await (await app.inject({ method: 'GET', url: `/billing/cycles/${cycleId}`, headers: { authorization: `Bearer ${adminToken}` } })).json<BillingCycleDetail>();
    expect(detail.invoices.find((candidate) => candidate.id === invoice.id)).toMatchObject({ totalCentavos: '99900', balanceCentavos: '99900' });
  });

  it('returns a chronological ledger with a reproducible running balance', async () => {
    const [service] = await database.db.select({ subscriberId: serviceAccounts.subscriberId }).from(serviceAccounts)
      .where(eq(serviceAccounts.serviceAccountNumber, 'SVC-00001-1')).limit(1);
    if (!service) throw new Error('Synthetic subscriber missing');
    const first = await app.inject({ method: 'GET', url: `/subscribers/${service.subscriberId}/ledger`, headers: { authorization: `Bearer ${adminToken}` } });
    const second = await app.inject({ method: 'GET', url: `/subscribers/${service.subscriberId}/ledger`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(first.statusCode).toBe(200);
    const ledger = first.json<SubscriberLedger>();
    expect(ledger.entries).toHaveLength(2);
    expect(ledger.entries.map((entry) => entry.debitCentavos)).toEqual(['99900', '54900']);
    expect(ledger.entries.map((entry) => entry.runningBalanceCentavos)).toEqual(['99900', '154800']);
    expect(ledger.closingBalanceCentavos).toBe('154800');
    expect(second.json()).toEqual(ledger);
  });

  it('rolls back the entire cycle when any financial posting step fails', async () => {
    await database.pool.query(`
      CREATE FUNCTION test_reject_ledger_insert() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'synthetic ledger failure'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_reject_ledger_insert BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION test_reject_ledger_insert();
    `);
    try {
      const failed = await app.inject({
        method: 'POST', url: '/billing/cycles/generate', headers: { authorization: `Bearer ${adminToken}` }, payload: { period: '2026-09' },
      });
      expect(failed.statusCode).toBe(500);
    } finally {
      await database.pool.query('DROP TRIGGER IF EXISTS test_reject_ledger_insert ON ledger_entries');
      await database.pool.query('DROP FUNCTION IF EXISTS test_reject_ledger_insert()');
    }
    const septemberCycles = await database.db.select().from(billingCycles).where(eq(billingCycles.periodStart, '2026-09-01'));
    const septemberInvoices = await database.db.select({ id: invoices.id }).from(invoices)
      .innerJoin(billingCycles, eq(invoices.billingCycleId, billingCycles.id)).where(eq(billingCycles.periodStart, '2026-09-01'));
    expect(septemberCycles).toHaveLength(0);
    expect(septemberInvoices).toHaveLength(0);
  });

  it('rejects invalid periods and Cashier generation while preserving audit evidence', async () => {
    const invalid = await app.inject({ method: 'POST', url: '/billing/cycles/generate', headers: { authorization: `Bearer ${adminToken}` }, payload: { period: '2026-13' } });
    const denied = await app.inject({ method: 'POST', url: '/billing/cycles/generate', headers: { authorization: `Bearer ${cashierToken}` }, payload: { period: '2026-09' } });
    expect(invalid.statusCode).toBe(400);
    expect(denied.statusCode).toBe(403);
    const generatedAudit = await database.db.select().from(auditLogs).where(eq(auditLogs.action, 'billing.cycle.generated'));
    expect(generatedAudit).toHaveLength(1);
    expect(generatedAudit[0]).toMatchObject({ entityId: cycleId, reason: 'MONTHLY_BILLING' });
  });
});
