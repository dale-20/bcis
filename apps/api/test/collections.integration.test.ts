import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { CollectionBatch, PaymentResult, ReceivableAgingResponse } from '@bcis/shared';
import { buildApp } from '../src/app.js';
import { PasswordHasher, type ScryptParameters } from '../src/auth/password.js';
import { seedAuthorization, type DemoAccount } from '../src/auth/seed.js';
import { AuthService } from '../src/auth/service.js';
import { createDatabase } from '../src/db/client.js';
import { seedOperationalDemoData } from '../src/db/seed-operational.js';
import { auditLogs, collectionBatches, collectorRemittances, serviceAccounts } from '../src/db/schema.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || url === process.env.DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a separate disposable database ending in _test.');
const password = 'password';
const hasher = new PasswordHasher({ cost: 16_384, blockSize: 8, parallelization: 1, keyLength: 32, saltLength: 16, maxMemory: 64 * 1024 * 1024 } satisfies ScryptParameters);
const accounts: readonly DemoAccount[] = [
  { username: 'admin.demo', displayName: 'Demo Administrator', role: 'ADMIN' },
  { username: 'cashier.demo', displayName: 'Demo Cashier', role: 'CASHIER' },
  { username: 'collections.demo', displayName: 'Demo Collection Supervisor', role: 'COLLECTION_SUPERVISOR' },
  { username: 'auditor.demo', displayName: 'Demo Auditor', role: 'AUDITOR' },
];
const database = createDatabase({ DATABASE_URL: url, DATABASE_POOL_MAX: 5 });
const authService = new AuthService(database, hasher);
const app = await buildApp({ database, authService, probeDatabase: database.probe, logLevel: 'silent' });
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const tokens = { admin: '', cashier: '', collections: '', auditor: '' };
let collectorId = '';
let areaId = '';

async function activate(username: string) {
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { username, password } });
  expect(login.statusCode).toBe(200);
  const token = login.json<{ token: string }>().token;
  const changed = await app.inject({ method: 'POST', url: '/auth/change-password', headers: { authorization: `Bearer ${token}` }, payload: { currentPassword: password, newPassword: password } });
  expect(changed.statusCode).toBe(204);
  return token;
}

async function createBatch(collectionDate: string) {
  const response = await app.inject({ method: 'POST', url: '/collection-batches', headers: { authorization: `Bearer ${tokens.collections}` }, payload: { collectorId, collectionAreaId: areaId, collectionDate } });
  expect(response.statusCode, response.body).toBe(201);
  const batch = response.json<CollectionBatch>();
  expect(batch.accounts.length).toBeGreaterThan(0);
  expect(batch.accounts.every((account) => BigInt(account.currentBillCentavos) + BigInt(account.arrearsCentavos) === BigInt(account.amountDueCentavos))).toBe(true);
  return batch;
}

async function recordCash(batch: CollectionBatch, amount = '2000000') {
  const routeAccount = batch.accounts[0];
  if (!routeAccount) throw new Error('Route account missing');
  const payment = await app.inject({
    method: 'POST', url: '/payments', headers: { authorization: `Bearer ${tokens.cashier}` },
    payload: { subscriberId: routeAccount.subscriberId, amountCentavos: amount, paymentDate: `${batch.collectionDate}T08:00:00.000Z`, idempotencyKey: randomUUID(), method: 'CASH' },
  });
  expect(payment.statusCode).toBe(200);
  const posted = payment.json<PaymentResult>();
  const recorded = await app.inject({
    method: 'POST', url: `/collection-batches/${batch.id}/collections`, headers: { authorization: `Bearer ${tokens.collections}` },
    payload: { batchAccountId: routeAccount.id, paymentId: posted.paymentId, notes: 'Synthetic route collection' },
  });
  expect(recorded.statusCode).toBe(200);
  return recorded.json<CollectionBatch>();
}

async function submitAndRemit(batchId: string, remittedCashCentavos: string) {
  const submitted = await app.inject({ method: 'POST', url: `/collection-batches/${batchId}/submit`, headers: { authorization: `Bearer ${tokens.collections}` } });
  expect(submitted.statusCode).toBe(200);
  const remitted = await app.inject({ method: 'POST', url: `/collection-batches/${batchId}/remittance`, headers: { authorization: `Bearer ${tokens.collections}` }, payload: { remittedCashCentavos, notes: 'Synthetic counter remittance' } });
  expect(remitted.statusCode).toBe(200);
  return remitted.json<CollectionBatch>();
}

beforeAll(async () => {
  await database.pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await database.pool.query('CREATE SCHEMA public');
  await database.pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await migrate(database.db, { migrationsFolder });
  await seedAuthorization(database, password, hasher, accounts);
  await seedOperationalDemoData(database);
  tokens.admin = await activate('admin.demo');
  tokens.cashier = await activate('cashier.demo');
  tokens.collections = await activate('collections.demo');
  tokens.auditor = await activate('auditor.demo');
  for (const period of ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']) {
    const generated = await app.inject({ method: 'POST', url: '/billing/cycles/generate', headers: { authorization: `Bearer ${tokens.admin}` }, payload: { period } });
    expect(generated.statusCode).toBe(200);
  }
  const [service] = await database.db.select({ collectorId: serviceAccounts.assignedCollectorId, areaId: serviceAccounts.collectionAreaId }).from(serviceAccounts).where(eq(serviceAccounts.serviceAccountNumber, 'SVC-00001-1'));
  if (!service?.collectorId || !service.areaId) throw new Error('Synthetic route assignment missing');
  collectorId = service.collectorId;
  areaId = service.areaId;
});

afterAll(async () => { await app.close(); await database.close(); });

describe.sequential('collection batches, remittance, and receivable aging', () => {
  it('exposes collectors and areas through collection.view', async () => {
    const response = await app.inject({ method: 'GET', url: '/collections/reference-data', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json<{ collectors: unknown[]; areas: unknown[] }>()).toMatchObject({ collectors: expect.any(Array), areas: expect.any(Array) });
    const collector = await app.inject({ method: 'POST', url: '/collectors', headers: { authorization: `Bearer ${tokens.collections}` }, payload: { collectorNumber: 'COL-TEST', name: 'Synthetic Collector' } });
    const area = await app.inject({ method: 'POST', url: '/collection-areas', headers: { authorization: `Bearer ${tokens.collections}` }, payload: { code: 'TEST-AREA', name: 'Synthetic Test Area', description: 'Synthetic route only' } });
    expect(collector.statusCode).toBe(201);
    expect(area.statusCode).toBe(201);
    const refreshed = await app.inject({ method: 'GET', url: '/collections/reference-data', headers: { authorization: `Bearer ${tokens.auditor}` } });
    const references = refreshed.json<{ collectors: { code: string }[]; areas: { code: string }[] }>();
    expect(references.collectors.some((item) => item.code === 'COL-TEST')).toBe(true);
    expect(references.areas.some((item) => item.code === 'TEST-AREA')).toBe(true);
  });

  it('AT-07 records a balanced ₱20,000 remittance and enforces authorized closing', async () => {
    const created = await createBatch('2026-11-15');
    expect(created).toMatchObject({ status: 'OPEN', collectorId, collectionAreaId: areaId });
    const recorded = await recordCash(created);
    expect(recorded.status).toBe('IN_PROGRESS');
    expect(recorded.accounts.find((account) => account.paymentId)?.paymentAmountCentavos).toBe('2000000');
    const remitted = await submitAndRemit(created.id, '2000000');
    expect(remitted).toMatchObject({ status: 'REMITTED', remittance: { expectedCashCentavos: '2000000', remittedCashCentavos: '2000000', differenceCentavos: '0' } });
    const reconciled = await app.inject({ method: 'POST', url: `/collection-batches/${created.id}/reconcile`, headers: { authorization: `Bearer ${tokens.collections}` }, payload: { notes: 'Balanced against cashier records' } });
    expect(reconciled.statusCode).toBe(200);
    const denied = await app.inject({ method: 'POST', url: `/collection-batches/${created.id}/close`, headers: { authorization: `Bearer ${tokens.cashier}` }, payload: {} });
    expect(denied.statusCode).toBe(403);
    const closed = await app.inject({ method: 'POST', url: `/collection-batches/${created.id}/close`, headers: { authorization: `Bearer ${tokens.collections}` }, payload: {} });
    expect(closed.statusCode).toBe(200);
    expect(closed.json<CollectionBatch>()).toMatchObject({ status: 'CLOSED', remittance: { differenceCentavos: '0' } });
    await expect(database.db.update(collectionBatches).set({ expectedReceivableCentavos: 0n }).where(eq(collectionBatches.id, created.id))).rejects.toMatchObject({ cause: { code: '55000' } });
  });

  it('AT-08 preserves a visible ₱500 shortage and requires variance acknowledgement to close', async () => {
    const created = await createBatch('2026-11-16');
    await recordCash(created);
    const remitted = await submitAndRemit(created.id, '1950000');
    expect(remitted).toMatchObject({ status: 'REMITTED', remittance: { expectedCashCentavos: '2000000', remittedCashCentavos: '1950000', differenceCentavos: '-50000' } });
    const reconciled = await app.inject({ method: 'POST', url: `/collection-batches/${created.id}/reconcile`, headers: { authorization: `Bearer ${tokens.collections}` }, payload: { notes: 'Collector shortage confirmed during count' } });
    expect(reconciled.statusCode).toBe(200);
    const silentClose = await app.inject({ method: 'POST', url: `/collection-batches/${created.id}/close`, headers: { authorization: `Bearer ${tokens.collections}` }, payload: {} });
    expect(silentClose.statusCode).toBe(409);
    expect(silentClose.json()).toMatchObject({ error: 'VARIANCE_ACKNOWLEDGEMENT_REQUIRED' });
    const closed = await app.inject({ method: 'POST', url: `/collection-batches/${created.id}/close`, headers: { authorization: `Bearer ${tokens.collections}` }, payload: { notes: 'Authorized close with ₱500 collector shortage outstanding' } });
    expect(closed.statusCode).toBe(200);
    expect(closed.json<CollectionBatch>()).toMatchObject({ status: 'CLOSED', closeNotes: expect.stringContaining('shortage'), remittance: { differenceCentavos: '-50000' } });
    const [stored] = await database.db.select().from(collectorRemittances).where(eq(collectorRemittances.batchId, created.id));
    expect(stored?.differenceCentavos).toBe(-50_000n);
    const audits = await database.db.select().from(auditLogs).where(and(eq(auditLogs.action, 'collection.batch.closed'), eq(auditLogs.entityId, created.id)));
    expect(audits).toHaveLength(1);
  });

  it('returns reconciled aging totals, exact bucket boundaries, filters, and pagination', async () => {
    const response = await app.inject({ method: 'GET', url: `/receivables/aging?asOf=2026-11-15&collectorId=${collectorId}&collectionAreaId=${areaId}&page=1&pageSize=100`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(response.statusCode, response.body).toBe(200);
    const aging = response.json<ReceivableAgingResponse>();
    expect(aging.total).toBe(aging.rows.length);
    const bucketTotal = BigInt(aging.totals.CURRENT) + BigInt(aging.totals['1_30']) + BigInt(aging.totals['31_60']) + BigInt(aging.totals['61_90']) + BigInt(aging.totals['90_PLUS']);
    expect(bucketTotal).toBe(BigInt(aging.totals.total));
    for (const row of aging.rows) {
      if (row.daysOverdue === 0) expect(row.bucket).toBe('CURRENT');
      else if (row.daysOverdue <= 30) expect(row.bucket).toBe('1_30');
      else if (row.daysOverdue <= 60) expect(row.bucket).toBe('31_60');
      else if (row.daysOverdue <= 90) expect(row.bucket).toBe('61_90');
      else expect(row.bucket).toBe('90_PLUS');
    }
    const overdue = await app.inject({ method: 'GET', url: `/receivables/aging?asOf=2026-11-15&overdueOnly=true&collectorId=${collectorId}&collectionAreaId=${areaId}&page=1&pageSize=10`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(overdue.statusCode).toBe(200);
    const filtered = overdue.json<ReceivableAgingResponse>();
    expect(filtered.rows.every((row) => row.daysOverdue > 0 && row.bucket !== 'CURRENT')).toBe(true);
    expect(filtered.rows.length).toBeLessThanOrEqual(10);
  });
});
