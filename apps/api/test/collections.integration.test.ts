import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { and, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { CollectionBatch, Dashboard, PaymentResult, ReceivableAgingResponse, ReportData, ServiceHistory } from '@bcis/shared';
import { buildApp } from '../src/app.js';
import { PasswordHasher, type ScryptParameters } from '../src/auth/password.js';
import { seedAuthorization, type DemoAccount } from '../src/auth/seed.js';
import { AuthService } from '../src/auth/service.js';
import { createDatabase } from '../src/db/client.js';
import { seedOperationalDemoData } from '../src/db/seed-operational.js';
import { auditLogs, collectionBatches, collectorAssignments, collectorRemittances, serviceAccounts, users } from '../src/db/schema.js';

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
  { username: 'technician.demo', displayName: 'Demo Technician', role: 'TECHNICIAN' },
  { username: 'viewer.demo', displayName: 'Demo Read-only Viewer', role: 'VIEWER' },
];
const database = createDatabase({ DATABASE_URL: url, DATABASE_POOL_MAX: 5 });
const authService = new AuthService(database, hasher);
const app = await buildApp({ database, authService, probeDatabase: database.probe, logLevel: process.env.BCIS_TEST_LOG_LEVEL ?? 'silent' });
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const tokens = { admin: '', cashier: '', collections: '', auditor: '', technician: '', viewer: '' };
let collectorId = '';
let areaId = '';
let subscriberId = '';
const moneyToCentavos = (value: string) => {
  const normalized = value.replace(/[^\d.-]/g, '');
  const negative = normalized.startsWith('-');
  const [whole = '0', fraction = '0'] = normalized.replace('-', '').split('.');
  const amount = BigInt(whole.replaceAll(',', '')) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
  return negative ? -amount : amount;
};

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
  const eligible = await app.inject({ method: 'GET', url: `/collection-batches/${batch.id}/accounts/${routeAccount.id}/eligible-payments`, headers: { authorization: `Bearer ${tokens.collections}` } });
  expect(eligible.statusCode, eligible.body).toBe(200);
  expect(eligible.json<{ paymentId: string; receiptNumber: string }[]>()).toEqual(expect.arrayContaining([expect.objectContaining({ paymentId: posted.paymentId, receiptNumber: expect.stringMatching(/^OR-/) })]));
  expect((await app.inject({ method: 'GET', url: `/collection-batches/${batch.id}/accounts/${routeAccount.id}/eligible-payments`, headers: { authorization: `Bearer ${tokens.cashier}` } })).statusCode).toBe(403);
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
  tokens.technician = await activate('technician.demo');
  tokens.viewer = await activate('viewer.demo');
  for (const period of ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']) {
    const generated = await app.inject({ method: 'POST', url: '/billing/cycles/generate', headers: { authorization: `Bearer ${tokens.admin}` }, payload: { period } });
    expect(generated.statusCode).toBe(200);
  }
  const [service] = await database.db.select({ subscriberId: serviceAccounts.subscriberId, collectorId: serviceAccounts.assignedCollectorId, areaId: serviceAccounts.collectionAreaId }).from(serviceAccounts).where(eq(serviceAccounts.serviceAccountNumber, 'SVC-00001-1'));
  if (!service?.collectorId || !service.areaId) throw new Error('Synthetic route assignment missing');
  collectorId = service.collectorId;
  areaId = service.areaId;
  subscriberId = service.subscriberId;
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

  it('filters collection batches on the server and sorts them with stable paging', async () => {
    const earlier = await createBatch('2026-11-18');
    const later = await createBatch('2026-11-19');
    const sharedFilters = new URLSearchParams({ from: '2026-11-18', to: '2026-11-19', status: 'OPEN', collectorId, collectionAreaId: areaId, page: '1', pageSize: '1', sort: 'date', direction: 'asc' });
    const ascending = await app.inject({ method: 'GET', url: `/collection-batches?${sharedFilters}`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(ascending.statusCode, ascending.body).toBe(200);
    expect(ascending.json<{ total: number; pageCount: number; items: { id: string; collectionDate: string }[] }>()).toMatchObject({
      total: 2, pageCount: 2, items: [{ id: earlier.id, collectionDate: '2026-11-18' }],
    });
    sharedFilters.set('page', '2');
    const secondPage = await app.inject({ method: 'GET', url: `/collection-batches?${sharedFilters}`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(secondPage.json<{ items: { id: string }[] }>().items.map((item) => item.id)).toEqual([later.id]);
    sharedFilters.set('page', '1');
    sharedFilters.set('direction', 'desc');
    const descending = await app.inject({ method: 'GET', url: `/collection-batches?${sharedFilters}`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(descending.json<{ items: { id: string }[] }>().items.map((item) => item.id)).toEqual([later.id]);

    const byBatch = await app.inject({ method: 'GET', url: `/collection-batches?query=${encodeURIComponent(earlier.batchNumber)}&collectorId=${collectorId}&collectionAreaId=${areaId}`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(byBatch.json<{ total: number; items: { id: string }[] }>()).toEqual({
      total: 1,
      items: expect.arrayContaining([expect.objectContaining({ id: earlier.id })]),
      page: 1, pageSize: 20, pageCount: 1,
    });

    const invalidRange = await app.inject({ method: 'GET', url: '/collection-batches?from=2026-11-20&to=2026-11-19', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(invalidRange.statusCode).toBe(400);
    const invalidSort = await app.inject({ method: 'GET', url: '/collection-batches?sort=untrusted', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(invalidSort.statusCode).toBe(400);
  });

  it('AT-07 records a balanced ₱20,000 remittance and enforces authorized closing', async () => {
    const created = await createBatch('2026-11-15');
    expect(created).toMatchObject({ status: 'OPEN', collectorId, collectionAreaId: areaId });
    const listed = await app.inject({ method: 'GET', url: '/collection-batches?page=1&pageSize=5', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(listed.statusCode, listed.body).toBe(200);
    expect(listed.json<{ items: { id: string; batchNumber: string; accountCount: number }[]; total: number }>()).toMatchObject({ total: expect.any(Number), items: expect.arrayContaining([expect.objectContaining({ id: created.id, batchNumber: created.batchNumber, accountCount: created.accounts.length })]) });
    expect((await app.inject({ method: 'GET', url: '/collection-batches?page=1&pageSize=5', headers: { authorization: `Bearer ${tokens.cashier}` } })).statusCode).toBe(403);
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
    const newerBalanced = await createBatch('2026-11-17');
    await recordCash(newerBalanced);
    const balancedRemittance = await submitAndRemit(newerBalanced.id, '2000000');
    expect(balancedRemittance.remittance?.differenceCentavos).toBe('0');
    const balancedReconciliation = await app.inject({ method: 'POST', url: `/collection-batches/${newerBalanced.id}/reconcile`, headers: { authorization: `Bearer ${tokens.collections}` }, payload: { notes: 'Synthetic later balanced batch' } });
    expect(balancedReconciliation.statusCode).toBe(200);
    const balancedClose = await app.inject({ method: 'POST', url: `/collection-batches/${newerBalanced.id}/close`, headers: { authorization: `Bearer ${tokens.collections}` }, payload: {} });
    expect(balancedClose.statusCode).toBe(200);
    const exceptionPreview = await app.inject({ method: 'GET', url: '/collection-batches?page=1&pageSize=5&exceptionsOnly=true', headers: { authorization: `Bearer ${tokens.collections}` } });
    expect(exceptionPreview.statusCode, exceptionPreview.body).toBe(200);
    const exceptionItems = exceptionPreview.json<{ items: { id: string; status: string; remittance: { differenceCentavos: string } | null }[] }>().items;
    expect(exceptionItems.map((item) => item.id)).toEqual([created.id]);
    expect(exceptionItems.every((item) => item.remittance?.differenceCentavos !== '0' || ['SUBMITTED', 'REMITTED', 'RECONCILED'].includes(item.status))).toBe(true);
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
    const accounts = await app.inject({ method: 'GET', url: `/receivables/accounts?asOf=2026-11-15&collectorId=${collectorId}&collectionAreaId=${areaId}&page=1&pageSize=100`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(accounts.statusCode, accounts.body).toBe(200);
    expect(accounts.json<{ arrearsCentavos: string }>().arrearsCentavos).toBe(aging.totals.total);
    const sortedAccounts = await app.inject({ method: 'GET', url: `/receivables/accounts?asOf=2026-11-15&collectorId=${collectorId}&collectionAreaId=${areaId}&page=1&pageSize=100&sort=arrears&direction=desc`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(sortedAccounts.statusCode, sortedAccounts.body).toBe(200);
    const sortedRows = sortedAccounts.json<{ rows: { arrearsCentavos: string }[] }>().rows;
    expect(sortedRows.length).toBeGreaterThan(1);
    expect(sortedRows.slice(1).every((row, index) => BigInt(sortedRows[index]?.arrearsCentavos ?? '0') >= BigInt(row.arrearsCentavos))).toBe(true);
    const searchTerm = aging.rows[0]?.invoiceNumber;
    if (!searchTerm) throw new Error('Expected a receivable invoice for search coverage');
    const searched = await app.inject({ method: 'GET', url: `/receivables/aging?asOf=2026-11-15&query=${encodeURIComponent(searchTerm)}&page=1&pageSize=100`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(searched.statusCode, searched.body).toBe(200);
    expect(searched.json<ReceivableAgingResponse>().rows.map((row) => row.invoiceNumber)).toEqual([searchTerm]);
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

  it('builds live dashboard and authorized financial reports from posted records', async () => {
    const [assignmentActor] = await database.db.select({ id: users.id }).from(users).where(eq(users.username, 'collections.demo'));
    const [assignmentService] = await database.db.select({ id: serviceAccounts.id }).from(serviceAccounts).where(eq(serviceAccounts.serviceAccountNumber, 'SVC-00001-1'));
    if (!assignmentActor || !assignmentService) throw new Error('Synthetic assignment report fixture missing');
    await database.db.insert(collectorAssignments).values({ collectorId, serviceAccountId: assignmentService.id, effectiveFrom: '2026-01-01', assignedByUserId: assignmentActor.id });
    const boundaryPayment = await app.inject({ method: 'POST', url: '/payments', headers: { authorization: `Bearer ${tokens.cashier}` }, payload: {
      subscriberId, amountCentavos: '1', paymentDate: '2026-01-31T16:30:00.000Z', idempotencyKey: randomUUID(), method: 'CASH', notes: 'Synthetic Manila date-boundary test',
    } });
    expect(boundaryPayment.statusCode, boundaryPayment.body).toBe(200);
    const dashboard = await app.inject({ method: 'GET', url: '/dashboard?from=2026-01-01&to=2026-12-31', headers: { authorization: `Bearer ${tokens.cashier}` } });
    expect(dashboard.statusCode, dashboard.body).toBe(200);
    const summary = dashboard.json<Dashboard>();
    expect(BigInt(summary.collectedCentavos)).toBeGreaterThan(0n);
    expect(BigInt(summary.billedCentavos)).toBeGreaterThan(0n);
    expect(summary.postedPaymentCount).toBeGreaterThan(0);
    expect(summary.recentPayments.length).toBeGreaterThan(0);
    expect(summary.overdueInvoiceCount).toBeGreaterThanOrEqual(0);
    expect(summary.overdueSubscriberCount).toBeGreaterThanOrEqual(0);
    expect(summary.monthlyCollections.length).toBeGreaterThan(0);
    expect(summary.monthlyCollections.reduce((total, row) => total + BigInt(row.billedCentavos), 0n)).toBe(BigInt(summary.billedCentavos));
    expect(summary.monthlyCollections.reduce((total, row) => total + BigInt(row.amountCentavos), 0n)).toBe(BigInt(summary.collectedCentavos));
    const february = await app.inject({ method: 'GET', url: '/dashboard?from=2026-02-01&to=2026-02-28', headers: { authorization: `Bearer ${tokens.cashier}` } });
    expect(february.statusCode, february.body).toBe(200);
    expect(february.json<Dashboard>().monthlyCollections).toEqual(expect.arrayContaining([expect.objectContaining({ month: '2026-02', amountCentavos: '1', count: 1 })]));
    expect((await app.inject({ method: 'GET', url: '/dashboard?from=2026-12-31&to=2026-01-01', headers: { authorization: `Bearer ${tokens.cashier}` } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/dashboard?from=2024-01-01&to=2025-01-02', headers: { authorization: `Bearer ${tokens.cashier}` } })).statusCode).toBe(400);
    expect(summary.paymentMethods.some((row) => row.method === 'CASH')).toBe(true);
    expect(summary.collectorPerformance).toEqual([]);
    const supervisorDashboard = await app.inject({ method: 'GET', url: '/dashboard?from=2026-01-01&to=2026-12-31', headers: { authorization: `Bearer ${tokens.collections}` } });
    expect(supervisorDashboard.statusCode, supervisorDashboard.body).toBe(200);
    expect(supervisorDashboard.json<Dashboard>().collectorPerformance).toEqual(expect.arrayContaining([expect.objectContaining({ collectorId, assignedAccounts: expect.any(Number), collectedAccounts: expect.any(Number), amountCentavos: expect.any(String), varianceCentavos: expect.any(String) })]));
    const viewerDashboard = await app.inject({ method: 'GET', url: '/dashboard?from=2026-01-01&to=2026-12-31', headers: { authorization: `Bearer ${tokens.viewer}` } });
    expect(viewerDashboard.statusCode, viewerDashboard.body).toBe(200);
    expect(viewerDashboard.json<Dashboard>()).toMatchObject({ recentPayments: [], collectorPerformance: [] });
    const auditorDashboard = await app.inject({ method: 'GET', url: '/dashboard?from=2026-01-01&to=2026-12-31', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(auditorDashboard.statusCode, auditorDashboard.body).toBe(200);
    expect(auditorDashboard.json<Dashboard>().collectorPerformance.length).toBeGreaterThan(0);

    const monthly = await app.inject({ method: 'GET', url: '/reports/data?report=MONTHLY_COLLECTIONS&from=2026-01-01&to=2026-12-31', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(monthly.statusCode, monthly.body).toBe(200);
    const monthlyReport = monthly.json<ReportData>();
    expect(monthlyReport).toMatchObject({ report: 'MONTHLY_COLLECTIONS', title: 'Monthly collections', subtitle: '2026-01-01 to 2026-12-31', columns: expect.any(Array), rows: expect.any(Array) });
    const methodSummary = await app.inject({ method: 'GET', url: '/reports/data?report=PAYMENT_METHODS&from=2026-01-01&to=2026-12-31', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(methodSummary.statusCode, methodSummary.body).toBe(200);
    expect(methodSummary.json<ReportData>().totals.find((total) => total.label === 'Total collected')?.value)
      .toBe(monthlyReport.totals.find((total) => total.label === 'Total collected')?.value);
    for (const [report, title, label] of [
      ['DAILY_COLLECTIONS', 'Daily collections', 'Date'],
      ['WEEKLY_COLLECTIONS', 'Weekly collections', 'ISO week'],
      ['ANNUAL_COLLECTIONS', 'Annual collections', 'Year'],
    ] as const) {
      const response = await app.inject({ method: 'GET', url: `/reports/data?report=${report}&from=2026-01-01&to=2026-12-31`, headers: { authorization: `Bearer ${tokens.auditor}` } });
      expect(response.statusCode, response.body).toBe(200);
      const reportData = response.json<ReportData>();
      expect(reportData).toMatchObject({ report, title, subtitle: monthlyReport.subtitle });
      expect(reportData.columns[0]).toMatchObject({ key: 'period', label });
      expect(reportData.totals.find((total) => total.label === 'Total collected')?.value)
        .toBe(monthlyReport.totals.find((total) => total.label === 'Total collected')?.value);
      expect(reportData.rows.reduce((count, row) => count + Number(row.transactions), 0))
        .toBe(monthlyReport.rows.reduce((count, row) => count + Number(row.transactions), 0));
    }
    let revenueTotal: string | undefined;
    for (const report of ['REVENUE_BY_PLAN', 'REVENUE_BY_SERVICE', 'REVENUE_BY_AREA'] as const) {
      const response = await app.inject({ method: 'GET', url: `/reports/data?report=${report}&from=2026-01-01&to=2026-12-31`, headers: { authorization: `Bearer ${tokens.auditor}` } });
      expect(response.statusCode, response.body).toBe(200);
      const revenue = response.json<ReportData>();
      expect(revenue.rows.length).toBeGreaterThan(0);
      const total = revenue.totals.find((item) => item.label === 'Billed subscription amount')?.value;
      expect(total).toBeTruthy();
      if (revenueTotal === undefined) revenueTotal = total;
      else expect(total).toBe(revenueTotal);
    }
    const billingComparison = await app.inject({ method: 'GET', url: '/reports/data?report=BILLING_VS_COLLECTION&from=2026-01-01&to=2026-12-31', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(billingComparison.statusCode, billingComparison.body).toBe(200);
    const billingData = billingComparison.json<ReportData>();
    expect(billingData.rows).toHaveLength(2);
    expect(billingData.totals.find((total) => total.label === 'Billed')?.value).toBeTruthy();
    expect(billingData.totals.find((total) => total.label === 'Collected')?.value).toBe(monthlyReport.totals.find((total) => total.label === 'Total collected')?.value);
    const billedSource = await database.pool.query<{ amount: string }>("select coalesce(sum(total_centavos),0)::text amount from invoices where status not in ('DRAFT','VOID') and invoice_date between '2026-01-01' and '2026-12-31'");
    const billedTotal = billingData.totals.find((total) => total.label === 'Billed')?.value;
    expect(moneyToCentavos(billedTotal ?? '')).toBe(BigInt(billedSource.rows[0]?.amount ?? '0'));
    const masterList = await app.inject({ method: 'GET', url: '/reports/data?report=SUBSCRIBER_MASTER_LIST&from=2026-01-01&to=2026-12-31', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(masterList.statusCode, masterList.body).toBe(200);
    expect(masterList.json<ReportData>().rows).toEqual(expect.arrayContaining([expect.objectContaining({ account: expect.any(String), subscriber: expect.any(String), outstanding: expect.any(String) })]));
    const aging = await app.inject({ method: 'GET', url: '/reports/data?report=AR_AGING&from=2026-01-01&to=2026-12-31', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(aging.statusCode, aging.body).toBe(200);
    const agingTotal = aging.json<ReportData>().totals.find((total) => total.label === 'Outstanding')?.value;
    const agingSource = await database.pool.query<{ amount: string }>("select coalesce(sum(balance_centavos),0)::text amount from invoices where balance_centavos>0 and status in ('UNPAID','PARTIALLY_PAID','OVERDUE')");
    expect(moneyToCentavos(agingTotal ?? '')).toBe(BigInt(agingSource.rows[0]?.amount ?? '0'));
    const agingList = await app.inject({ method: 'GET', url: `/reports/data?report=RECEIVABLE_AGING_LIST&from=2026-11-15&to=2026-11-15&agingAsOf=2026-11-15&agingOverdueOnly=false&agingCollectorId=${collectorId}&agingAreaId=${areaId}&agingSort=balance&agingDirection=desc`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(agingList.statusCode, agingList.body).toBe(200);
    expect(agingList.json<ReportData>()).toMatchObject({ title: 'Receivable aging list', rows: expect.any(Array), columns: expect.arrayContaining([expect.objectContaining({ key: 'balance' })]) });
    const serviceControlReport = await app.inject({ method: 'GET', url: '/reports/data?report=SERVICE_CONTROL_ACCOUNTS&from=2026-11-15&to=2026-11-15&serviceControlAsOf=2026-11-15&serviceControlOverdueOnly=true&serviceControlCollectorId=' + collectorId + '&serviceControlAreaId=' + areaId + '&serviceControlSort=arrears&serviceControlDirection=desc', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(serviceControlReport.statusCode, serviceControlReport.body).toBe(200);
    const serviceControlData = serviceControlReport.json<ReportData>();
    expect(serviceControlData).toMatchObject({ title: 'Overdue service accounts', rows: expect.any(Array) });
    expect(serviceControlData.columns).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'arrears' }), expect.objectContaining({ key: 'daysOverdue' })]));
    const viewerMasterList = await app.inject({ method: 'GET', url: '/reports/data?report=SUBSCRIBER_MASTER_LIST&from=2026-01-01&to=2026-12-31', headers: { authorization: `Bearer ${tokens.viewer}` } });
    expect(viewerMasterList.statusCode).toBe(403);
    const remittanceReport = await app.inject({ method: 'GET', url: '/reports/data?report=COLLECTOR_REMITTANCE&from=2026-01-01&to=2026-12-31', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(remittanceReport.statusCode, remittanceReport.body).toBe(200);
    expect(remittanceReport.json<ReportData>()).toMatchObject({ title: 'Collector remittance and performance', columns: expect.arrayContaining([expect.objectContaining({ key: 'uncollectedAccounts' }), expect.objectContaining({ key: 'difference' })]), totals: expect.arrayContaining([expect.objectContaining({ label: 'Collected amount' })]) });
    const assignmentReport = await app.inject({ method: 'GET', url: `/reports/data?report=COLLECTOR_ASSIGNMENTS&from=2026-01-01&to=2026-12-31&collectorId=${collectorId}`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(assignmentReport.statusCode, assignmentReport.body).toBe(200);
    expect(assignmentReport.json<ReportData>()).toMatchObject({ title: 'Collector assignment history', columns: expect.arrayContaining([expect.objectContaining({ key: 'effectiveFrom' }), expect.objectContaining({ key: 'effectiveTo' })]), rows: expect.arrayContaining([expect.objectContaining({ collector: expect.any(String), effectiveTo: 'Current' })]) });
    const statement = await app.inject({ method: 'GET', url: `/reports/data?report=SUBSCRIBER_STATEMENT&from=2026-01-01&to=2026-12-31&subscriberId=${subscriberId}`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(statement.statusCode, statement.body).toBe(200);
    const statementData = statement.json<ReportData>();
    expect(statementData.title).toContain('Subscriber statement');
    const statementClosing = statementData.totals.find((total) => total.label === 'Closing balance')?.value;
    const statementSource = await database.pool.query<{ balance: string }>('select coalesce(sum(debit_centavos-credit_centavos),0)::text balance from ledger_entries where subscriber_id=$1', [subscriberId]);
    expect(moneyToCentavos(statementClosing ?? '')).toBe(BigInt(statementSource.rows[0]?.balance ?? '0'));
    if (statementData.rows.length > 0) expect(statementData.rows.at(-1)?.balance).toBe(statementClosing);
    const rangedStatement = await app.inject({ method: 'GET', url: `/reports/data?report=SUBSCRIBER_STATEMENT&from=2026-09-01&to=2026-09-30&subscriberId=${subscriberId}`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(rangedStatement.statusCode, rangedStatement.body).toBe(200);
    expect(rangedStatement.json<ReportData>().totals).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Opening balance', value: expect.stringMatching(/\$|₱/) }),
      expect.objectContaining({ label: 'Closing balance', value: expect.any(String) }),
    ]));
    const denied = await app.inject({ method: 'GET', url: '/reports/data?report=AR_AGING&from=2026-01-01&to=2026-12-31', headers: { authorization: `Bearer ${tokens.cashier}` } });
    expect(denied.statusCode).toBe(403);
  });

  it('runs the suspension and payment-triggered reconnection workflow with assigned Technician-only completion', async () => {
    const [service] = await database.db.select({ id: serviceAccounts.id, subscriberId: serviceAccounts.subscriberId, planId: serviceAccounts.planId }).from(serviceAccounts).where(eq(serviceAccounts.serviceAccountNumber, 'SVC-00001-1'));
    if (!service) throw new Error('Synthetic service account missing');
    const technician = await database.pool.query<{ id: string }>("select id from users where normalized_username='technician.demo'");
    const technicianId = technician.rows[0]?.id;
    if (!technicianId) throw new Error('Synthetic Technician missing');
    const technicianList = await app.inject({ method: 'GET', url: '/service-control/technicians', headers: { authorization: `Bearer ${tokens.admin}` } });
    expect(technicianList.statusCode, technicianList.body).toBe(200);
    expect(technicianList.json<{ id: string; displayName: string }[]>()).toEqual(expect.arrayContaining([expect.objectContaining({ id: technicianId, displayName: 'Demo Technician' })]));

    const policyResponse = await app.inject({ method: 'PUT', url: '/service-control/policy', headers: { authorization: `Bearer ${tokens.admin}` }, payload: { gracePeriodDays: 0, suspensionThresholdDays: 1, reconnectionFeeCentavos: '50000' } });
    expect(policyResponse.statusCode, policyResponse.body).toBe(200);
    const policyDenied = await app.inject({ method: 'PUT', url: '/service-control/policy', headers: { authorization: `Bearer ${tokens.cashier}` }, payload: { gracePeriodDays: 0, suspensionThresholdDays: 1, reconnectionFeeCentavos: '0' } });
    expect(policyDenied.statusCode).toBe(403);

    const candidates = await app.inject({ method: 'GET', url: `/receivables/accounts?asOf=${new Date().toISOString().slice(0, 10)}&suspensionCandidates=true&planId=${service.planId}&page=1&pageSize=25`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(candidates.statusCode, candidates.body).toBe(200);
    const candidateRows = candidates.json<{ rows: { serviceAccountId: string; monthsUnpaid: number; arrearsCentavos: string }[] }>().rows;
    expect(candidateRows.length).toBeGreaterThan(0);
    const workflowCandidate = candidateRows[0];
    if (!workflowCandidate) throw new Error('No synthetic service qualified for the first suspension scenario');
    const [workflowService] = await database.db.select({ id: serviceAccounts.id, subscriberId: serviceAccounts.subscriberId, planId: serviceAccounts.planId })
      .from(serviceAccounts).where(eq(serviceAccounts.id, workflowCandidate.serviceAccountId));
    if (!workflowService) throw new Error('Synthetic suspension candidate missing from service records');

    const effectiveDate = new Date().toISOString().slice(0, 10);
    const requestBody = { serviceAccountId: workflowService.id, effectiveDate, reason: 'Synthetic delinquency test', notes: 'Policy-approved integration scenario' };
    const cashierDenied = await app.inject({ method: 'POST', url: '/service-control/suspensions', headers: { authorization: `Bearer ${tokens.cashier}` }, payload: requestBody });
    expect(cashierDenied.statusCode).toBe(403);
    const request = await app.inject({ method: 'POST', url: '/service-control/suspensions', headers: { authorization: `Bearer ${tokens.admin}` }, payload: requestBody });
    expect(request.statusCode, request.body).toBe(201);
    const suspensionId = request.json<{ id: string }>().id;
    const approved = await app.inject({ method: 'POST', url: `/service-control/suspensions/${suspensionId}/approve`, headers: { authorization: `Bearer ${tokens.admin}` } });
    expect(approved.statusCode, approved.body).toBe(204);
    const secondApproval = await app.inject({ method: 'POST', url: `/service-control/suspensions/${suspensionId}/approve`, headers: { authorization: `Bearer ${tokens.admin}` } });
    expect(secondApproval.statusCode).toBe(409);

    const beforePartialResult = await database.pool.query<{ total: string }>("select coalesce(sum(balance_centavos),0)::text total from invoices where subscriber_id=$1 and balance_centavos>0 and status in ('UNPAID','PARTIALLY_PAID','OVERDUE')", [workflowService.subscriberId]);
    const beforePartial = beforePartialResult.rows[0];
    expect(BigInt(beforePartial?.total ?? '0')).toBeGreaterThan(1n);
    const post = async (amountCentavos: string, key: string) => app.inject({ method: 'POST', url: '/payments', headers: { authorization: `Bearer ${tokens.cashier}` }, payload: { subscriberId: workflowService.subscriberId, amountCentavos, method: 'CASH', paymentDate: new Date().toISOString(), idempotencyKey: key } });
    const partial = await post('100', randomUUID());
    expect(partial.statusCode, partial.body).toBe(200);
    const noReconnect = await app.inject({ method: 'GET', url: '/service-control/reconnections?page=1&pageSize=25', headers: { authorization: `Bearer ${tokens.admin}` } });
    expect(noReconnect.json<{ items: { serviceAccountId: string }[] }>().items.some((item) => item.serviceAccountId === workflowService.id)).toBe(false);

    const remainingResult = await database.pool.query<{ total: string }>("select coalesce(sum(balance_centavos),0)::text total from invoices where subscriber_id=$1 and balance_centavos>0 and status in ('UNPAID','PARTIALLY_PAID','OVERDUE')", [workflowService.subscriberId]);
    const remaining = remainingResult.rows[0];
    const settled = await post(remaining?.total ?? '0', randomUUID());
    expect(settled.statusCode, settled.body).toBe(200);
    const reconnections = await app.inject({ method: 'GET', url: '/service-control/reconnections?page=1&pageSize=25', headers: { authorization: `Bearer ${tokens.admin}` } });
    expect(reconnections.statusCode).toBe(200);
    const reconnection = reconnections.json<{ items: { id: string; serviceAccountId: string; feeCentavos: string }[] }>().items.find((item) => item.serviceAccountId === workflowService.id);
    expect(reconnection).toMatchObject({ serviceAccountId: workflowService.id, feeCentavos: '50000' });
    const assigned = await app.inject({ method: 'PATCH', url: `/service-control/reconnections/${reconnection?.id}/assignment`, headers: { authorization: `Bearer ${tokens.admin}` }, payload: { technicianUserId: technicianId, scheduledDate: effectiveDate } });
    expect(assigned.statusCode, assigned.body).toBe(204);
    const unassignedCompletion = await app.inject({ method: 'POST', url: `/service-control/reconnections/${reconnection?.id}/complete`, headers: { authorization: `Bearer ${tokens.cashier}` } });
    expect(unassignedCompletion.statusCode).toBe(403);
    const technicianFinancial = await app.inject({ method: 'GET', url: '/payments?page=1&pageSize=10', headers: { authorization: `Bearer ${tokens.technician}` } });
    expect(technicianFinancial.statusCode).toBe(403);
    const completed = await app.inject({ method: 'POST', url: `/service-control/reconnections/${reconnection?.id}/complete`, headers: { authorization: `Bearer ${tokens.technician}` } });
    expect(completed.statusCode, completed.body).toBe(204);
    const directSuspension = await app.inject({ method: 'POST', url: `/subscribers/${workflowService.subscriberId}/services/${workflowService.id}/status`, headers: { authorization: `Bearer ${tokens.admin}` }, payload: { status: 'SUSPENDED', reason: 'Should require the explicit approval workflow' } });
    expect(directSuspension.statusCode).toBe(409);
    const history = await app.inject({ method: 'GET', url: `/subscribers/${workflowService.subscriberId}/service-history`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(history.json<ServiceHistory>().events.map((event) => event.type)).toContain('RECONNECTION');
  });

  it('completes a second synthetic suspension and reconnection for an independently settled subscriber', async () => {
    const secondServiceResult = await database.pool.query<{ id: string; subscriber_id: string }>(
      "select id, subscriber_id from service_accounts where service_account_number='SVC-00002-1' and status='ACTIVE'",
    );
    const secondService = secondServiceResult.rows[0];
    if (!secondService) throw new Error('Second synthetic active service is missing');
    const asOf = new Date().toISOString().slice(0, 10);
    const arrears = await database.pool.query<{ amount: string }>(
      "select coalesce(sum(balance_centavos),0)::text amount from invoices where service_account_id=$1 and balance_centavos>0 and status in ('UNPAID','PARTIALLY_PAID','OVERDUE')",
      [secondService.id],
    );
    expect(BigInt(arrears.rows[0]?.amount ?? '0')).toBeGreaterThan(0n);
    const request = await app.inject({ method: 'POST', url: '/service-control/suspensions', headers: { authorization: `Bearer ${tokens.admin}` }, payload: { serviceAccountId: secondService.id, effectiveDate: asOf, reason: 'Second synthetic delinquency scenario' } });
    expect(request.statusCode, request.body).toBe(201);
    const suspensionId = request.json<{ id: string }>().id;
    const approved = await app.inject({ method: 'POST', url: `/service-control/suspensions/${suspensionId}/approve`, headers: { authorization: `Bearer ${tokens.admin}` } });
    expect(approved.statusCode, approved.body).toBe(204);

    const subscriberBalance = await database.pool.query<{ amount: string }>(
      "select coalesce(sum(balance_centavos),0)::text amount from invoices where subscriber_id=$1 and balance_centavos>0 and status in ('UNPAID','PARTIALLY_PAID','OVERDUE')",
      [secondService.subscriber_id],
    );
    const amount = subscriberBalance.rows[0]?.amount ?? '0';
    expect(BigInt(amount)).toBeGreaterThan(0n);
    const payment = await app.inject({ method: 'POST', url: '/payments', headers: { authorization: `Bearer ${tokens.cashier}` }, payload: {
      subscriberId: secondService.subscriber_id, amountCentavos: amount, method: 'CASH', paymentDate: new Date().toISOString(), idempotencyKey: randomUUID(),
    } });
    expect(payment.statusCode, payment.body).toBe(200);
    const queue = await app.inject({ method: 'GET', url: '/service-control/reconnections?page=1&pageSize=25', headers: { authorization: `Bearer ${tokens.admin}` } });
    expect(queue.statusCode, queue.body).toBe(200);
    const item = queue.json<{ items: { id: string; serviceAccountId: string }[] }>().items.find((entry) => entry.serviceAccountId === secondService.id);
    expect(item).toBeDefined();
    if (!item) throw new Error('Settled second service did not receive a reconnection request');
    const technicianResult = await database.pool.query<{ id: string }>("select id from users where normalized_username='technician.demo'");
    const technicianId = technicianResult.rows[0]?.id;
    if (!technicianId) throw new Error('Synthetic Technician is missing');
    const assignment = await app.inject({ method: 'PATCH', url: `/service-control/reconnections/${item.id}/assignment`, headers: { authorization: `Bearer ${tokens.admin}` }, payload: { technicianUserId: technicianId, scheduledDate: asOf } });
    expect(assignment.statusCode, assignment.body).toBe(204);
    const completed = await app.inject({ method: 'POST', url: `/service-control/reconnections/${item.id}/complete`, headers: { authorization: `Bearer ${tokens.technician}` } });
    expect(completed.statusCode, completed.body).toBe(204);
    const state = await database.pool.query<{ status: string; reconnection_status: string }>(
      'select service.status, reconnect.status reconnection_status from service_accounts service join reconnection_records reconnect on reconnect.service_account_id=service.id where service.id=$1 and reconnect.id=$2',
      [secondService.id, item.id],
    );
    expect(state.rows[0]).toEqual({ status: 'ACTIVE', reconnection_status: 'COMPLETED' });
  });

  it('exports valid PDF/XLSX files and records suspension/reconnection history', async () => {
    const pdf = await app.inject({ method: 'GET', url: '/reports/export?report=AR_AGING&from=2026-01-01&to=2026-12-31&format=PDF', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(pdf.statusCode, pdf.body).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    const xlsx = await app.inject({ method: 'GET', url: '/reports/export?report=PAYMENT_METHODS&from=2026-01-01&to=2026-12-31&format=XLSX', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(xlsx.statusCode, xlsx.body).toBe(200);
    expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
    const dailyPdf = await app.inject({ method: 'GET', url: '/reports/export?report=DAILY_COLLECTIONS&from=2026-01-01&to=2026-12-31&format=PDF', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(dailyPdf.statusCode, dailyPdf.body).toBe(200);
    expect(dailyPdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    expect(dailyPdf.headers['content-disposition']).toContain('bcis-daily-collections-2026-12-31.pdf');
    const annualXlsx = await app.inject({ method: 'GET', url: '/reports/export?report=ANNUAL_COLLECTIONS&from=2026-01-01&to=2026-12-31&format=XLSX', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(annualXlsx.statusCode, annualXlsx.body).toBe(200);
    expect(annualXlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
    expect(annualXlsx.headers['content-disposition']).toContain('bcis-annual-collections-2026-12-31.xlsx');
    const batchXlsx = await app.inject({ method: 'GET', url: '/reports/export?report=COLLECTION_BATCH_LIST&from=2026-01-01&to=2026-12-31&batchStatus=CLOSED&batchSort=date&batchDirection=asc&format=XLSX', headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(batchXlsx.statusCode, batchXlsx.body).toBe(200);
    expect(batchXlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
    expect(batchXlsx.headers['content-disposition']).toContain('bcis-collection-batch-list-2026-12-31.xlsx');
    const receivablesPdf = await app.inject({ method: 'GET', url: `/reports/export?report=SERVICE_CONTROL_ACCOUNTS&from=2026-11-15&to=2026-11-15&serviceControlAsOf=2026-11-15&serviceControlOverdueOnly=true&serviceControlCollectorId=${collectorId}&serviceControlAreaId=${areaId}&serviceControlSort=arrears&serviceControlDirection=desc&format=PDF`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(receivablesPdf.statusCode, receivablesPdf.body).toBe(200);
    expect(receivablesPdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    const receivablesXlsx = await app.inject({ method: 'GET', url: `/reports/export?report=SERVICE_CONTROL_ACCOUNTS&from=2026-11-15&to=2026-11-15&serviceControlAsOf=2026-11-15&serviceControlOverdueOnly=true&serviceControlCollectorId=${collectorId}&serviceControlAreaId=${areaId}&serviceControlSort=arrears&serviceControlDirection=desc&format=XLSX`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(receivablesXlsx.statusCode, receivablesXlsx.body).toBe(200);
    expect(receivablesXlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
    expect(receivablesXlsx.headers['content-disposition']).toContain('bcis-service-control-accounts-2026-11-15.xlsx');
    const agingPdf = await app.inject({ method: 'GET', url: `/reports/export?report=RECEIVABLE_AGING_LIST&from=2026-11-15&to=2026-11-15&agingAsOf=2026-11-15&agingOverdueOnly=true&agingCollectorId=${collectorId}&agingAreaId=${areaId}&agingSort=balance&agingDirection=desc&format=PDF`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(agingPdf.statusCode, agingPdf.body).toBe(200);
    expect(agingPdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    const agingXlsx = await app.inject({ method: 'GET', url: `/reports/export?report=RECEIVABLE_AGING_LIST&from=2026-11-15&to=2026-11-15&agingAsOf=2026-11-15&agingOverdueOnly=true&agingCollectorId=${collectorId}&agingAreaId=${areaId}&agingSort=balance&agingDirection=desc&format=XLSX`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(agingXlsx.statusCode, agingXlsx.body).toBe(200);
    expect(agingXlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
    expect(agingXlsx.headers['content-disposition']).toContain('bcis-receivable-aging-list-2026-11-15.xlsx');

    const actor = await database.pool.query<{ id: string }>("select id from users where username='admin.demo'");
    const service = await database.pool.query<{ id: string }>("select id from service_accounts where service_account_number='SVC-00001-1'");
    const userId = actor.rows[0]?.id; const serviceId = service.rows[0]?.id;
    if (!userId || !serviceId) throw new Error('Synthetic history references missing');
    const suspended = await database.pool.query<{ id: string }>("insert into suspension_records(service_account_id,status,reason,effective_date,requested_by_user_id,approved_by_user_id,approved_at,notes) values($1,'LIFTED','Synthetic overdue test','2026-10-01',$2,$2,'2026-10-01T08:00:00Z','Reconnected after payment') returning id", [serviceId, userId]);
    await database.pool.query("insert into reconnection_records(service_account_id,suspension_id,status,fee_centavos,requested_at,completed_at,completed_by_user_id,notes) values($1,$2,'COMPLETED',50000,'2026-10-02T08:00:00Z','2026-10-03T08:00:00Z',$3,'Synthetic completed reconnect')", [serviceId, suspended.rows[0]?.id, userId]);
    const history = await app.inject({ method: 'GET', url: `/subscribers/${subscriberId}/service-history`, headers: { authorization: `Bearer ${tokens.auditor}` } });
    expect(history.statusCode, history.body).toBe(200);
    expect(history.json<ServiceHistory>().events.map((event) => event.type)).toEqual(['RECONNECTION', 'SUSPENSION']);
    const exports = await database.pool.query("select count(*)::int count from audit_logs where action='report.exported'");
    expect(exports.rows[0]?.count).toBe(9);
  });
});
