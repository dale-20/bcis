import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { BillingCycleDetail, BillingCycleList, BillingGenerationResult, BillingPreview, InvoiceDetail, InvoiceListResponse, ReportData, SubscriberLedger } from '@bcis/shared';
import { buildApp } from '../src/app.js';
import { PasswordHasher, type ScryptParameters } from '../src/auth/password.js';
import { seedAuthorization, type DemoAccount } from '../src/auth/seed.js';
import { AuthService } from '../src/auth/service.js';
import { createDatabase } from '../src/db/client.js';
import { seedOperationalDemoData } from '../src/db/seed-operational.js';
import { adjustments, auditLogs, billingCycles, invoiceItems, invoices, ledgerEntries, serviceAccounts, servicePlans } from '../src/db/schema.js';

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

  it('previews eligible services without writing financial records', async () => {
    const before = await database.db.select({ id: billingCycles.id }).from(billingCycles);
    const response = await app.inject({ method: 'GET', url: '/billing/cycles/preview?period=2026-08', headers: { authorization: `Bearer ${adminToken}` } });
    expect(response.statusCode).toBe(200);
    const preview = response.json<BillingPreview>();
    expect(preview).toMatchObject({ period: '2026-08', alreadyInvoicedServices: 0, existingCycle: null });
    expect(preview.eligibleServices).toBeGreaterThan(0);
    expect(preview.invoicesToCreate).toBe(preview.eligibleServices);
    expect(BigInt(preview.projectedTotalCentavos)).toBeGreaterThan(0n);
    expect(await database.db.select({ id: billingCycles.id }).from(billingCycles)).toEqual(before);
    const denied = await app.inject({ method: 'GET', url: '/billing/cycles/preview?period=2026-08', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(denied.statusCode).toBe(403);
  });

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

  it('lists cycles and server-paginates searchable invoices with immutable detail', async () => {
    const cyclesResponse = await app.inject({ method: 'GET', url: '/billing/cycles', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(cyclesResponse.statusCode).toBe(200);
    expect(cyclesResponse.json<BillingCycleList>().items[0]).toMatchObject({ id: cycleId, period: '2026-08', invoiceCount: expectedActiveServices, totalInvoicedCentavos: expectedTotal.toString() });

    const listResponse = await app.inject({ method: 'GET', url: '/invoices?period=2026-08&status=UNPAID&page=1&pageSize=10&query=SVC-00001-1&dueFrom=2026-08-11&dueTo=2026-08-11&minAmountCentavos=99900&maxAmountCentavos=99900', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(listResponse.statusCode).toBe(200);
    const list = listResponse.json<InvoiceListResponse>();
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ period: '2026-08', serviceAccountNumber: 'SVC-00001-1', totalCentavos: '99900', balanceCentavos: '99900' });
    const sortedResponse = await app.inject({ method: 'GET', url: '/invoices?period=2026-08&sort=total&direction=asc&page=1&pageSize=100', headers: { authorization: `Bearer ${cashierToken}` } });
    expect(sortedResponse.statusCode, sortedResponse.body).toBe(200);
    const sorted = sortedResponse.json<InvoiceListResponse>().items;
    expect(sorted.length).toBeGreaterThan(1);
    expect(sorted.map((item) => BigInt(item.totalCentavos))).toEqual([...sorted.map((item) => BigInt(item.totalCentavos))].sort((left, right) => left < right ? -1 : left > right ? 1 : 0));
    const invoiceExportQuery = 'report=INVOICE_LIST&from=0001-01-01&to=9999-12-31&invoiceQuery=SVC-00001-1&invoicePeriod=2026-08&invoiceStatus=UNPAID&invoiceMinAmountCentavos=99900&invoiceMaxAmountCentavos=99900&invoiceSort=total&invoiceDirection=asc';
    const invoiceReport = await app.inject({ method: 'GET', url: `/reports/data?${invoiceExportQuery}`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(invoiceReport.statusCode, invoiceReport.body).toBe(200);
    expect(invoiceReport.json<ReportData>().rows).toHaveLength(1);
    const invoiceXlsx = await app.inject({ method: 'GET', url: `/reports/export?${invoiceExportQuery}&format=XLSX`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(invoiceXlsx.statusCode, invoiceXlsx.body).toBe(200);
    expect(invoiceXlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
    const invoiceId = list.items[0]?.id;
    if (!invoiceId) throw new Error('Invoice list row missing');
    const detailResponse = await app.inject({ method: 'GET', url: `/invoices/${invoiceId}`, headers: { authorization: `Bearer ${cashierToken}` } });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json<InvoiceDetail>()).toMatchObject({ id: invoiceId, items: [{ type: 'SUBSCRIPTION', amountCentavos: '99900' }], ledgerEntry: { referenceNumber: list.items[0]?.invoiceNumber } });

    const duplicatePreview = await app.inject({ method: 'GET', url: '/billing/cycles/preview?period=2026-08', headers: { authorization: `Bearer ${adminToken}` } });
    expect(duplicatePreview.json<BillingPreview>()).toMatchObject({ eligibleServices: expectedActiveServices, alreadyInvoicedServices: expectedActiveServices, invoicesToCreate: 0, projectedTotalCentavos: '0', existingCycle: { id: cycleId, status: 'FINALIZED' } });
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

  it('posts signed adjustments atomically and denies Cashier adjustment access', async () => {
    const target = (await app.inject({ method: 'GET', url: '/invoices?query=SVC-00002-1&page=1&pageSize=10', headers: { authorization: `Bearer ${adminToken}` } })).json<InvoiceListResponse>().items[0];
    if (!target) throw new Error('Adjustment target missing');
    const denied = await app.inject({ method: 'POST', url: `/invoices/${target.id}/adjustments`, headers: { authorization: `Bearer ${cashierToken}` }, payload: { amountCentavos: '25000', lineType: 'INSTALLATION', reason: 'Synthetic installation charge' } });
    expect(denied.statusCode).toBe(403);
    const debit = await app.inject({ method: 'POST', url: `/invoices/${target.id}/adjustments`, headers: { authorization: `Bearer ${adminToken}` }, payload: { amountCentavos: '25000', lineType: 'INSTALLATION', reason: 'Synthetic installation charge' } });
    expect(debit.statusCode).toBe(200);
    expect(debit.json()).toMatchObject({ invoiceId: target.id, balanceCentavos: (BigInt(target.balanceCentavos) + 25_000n).toString() });
    const credit = await app.inject({ method: 'POST', url: `/invoices/${target.id}/adjustments`, headers: { authorization: `Bearer ${adminToken}` }, payload: { amountCentavos: '-5000', lineType: 'DISCOUNT', reason: 'Synthetic loyalty discount' } });
    expect(credit.statusCode).toBe(200);
    const detail = (await app.inject({ method: 'GET', url: `/invoices/${target.id}`, headers: { authorization: `Bearer ${adminToken}` } })).json<InvoiceDetail>();
    expect(detail.balanceCentavos).toBe((BigInt(target.balanceCentavos) + 20_000n).toString());
    expect(detail.adjustments.map((item) => item.amountCentavos)).toEqual(['25000', '-5000']);
    const paymentResponse = await app.inject({ method: 'POST', url: '/payments', headers: { authorization: `Bearer ${adminToken}` }, payload: {
      subscriberId: target.subscriberId, amountCentavos: '10000', paymentDate: '2026-08-20T08:00:00.000Z', idempotencyKey: '00000000-0000-4000-8000-000000000101', method: 'CASH',
    } });
    expect(paymentResponse.statusCode).toBe(200);
    const paymentId = paymentResponse.json<{ paymentId: string; allocations: { invoiceId: string }[] }>().paymentId;
    expect(paymentResponse.json<{ allocations: { invoiceId: string }[] }>().allocations[0]?.invoiceId).toBe(target.id);
    const reversed = await app.inject({ method: 'POST', url: `/payments/${paymentId}/reverse`, headers: { authorization: `Bearer ${adminToken}` }, payload: { reason: 'Synthetic adjustment reversal test' } });
    expect(reversed.statusCode, JSON.stringify(reversed.json())).toBe(200);
    const restored = (await app.inject({ method: 'GET', url: `/invoices/${target.id}`, headers: { authorization: `Bearer ${adminToken}` } })).json<InvoiceDetail>();
    expect(restored).toMatchObject({
      balanceCentavos: detail.balanceCentavos,
      status: target.dueDate < new Date().toISOString().slice(0, 10) ? 'OVERDUE' : 'UNPAID',
    });
    const [posted] = await database.db.select().from(adjustments).where(eq(adjustments.invoiceId, target.id)).limit(1);
    if (!posted) throw new Error('Posted adjustment missing');
    await expect(database.db.delete(adjustments).where(eq(adjustments.id, posted.id))).rejects.toMatchObject({ cause: { code: '55000' } });
    const adjustmentAudit = await database.db.select().from(auditLogs).where(and(eq(auditLogs.action, 'invoice.adjustment.posted'), eq(auditLogs.entityId, target.id)));
    expect(adjustmentAudit).toHaveLength(2);
    const report = await app.inject({ method: 'GET', url: '/reports/data?report=BILLING_ADJUSTMENTS&from=2020-01-01&to=2099-12-31', headers: { authorization: `Bearer ${adminToken}` } });
    expect(report.statusCode, report.body).toBe(200);
    expect(report.json<ReportData>()).toMatchObject({ title: 'Billing adjustment report', rows: expect.arrayContaining([
      expect.objectContaining({ invoice: target.invoiceNumber, amount: expect.stringMatching(/250\.00/), reason: 'Synthetic installation charge', status: 'POSTED' }),
      expect.objectContaining({ invoice: target.invoiceNumber, reason: 'Synthetic loyalty discount', status: 'POSTED' }),
    ]), totals: expect.arrayContaining([expect.objectContaining({ label: 'Posted adjustment total', value: expect.stringMatching(/200\.00/) })]) });
    const exported = await app.inject({ method: 'GET', url: '/reports/export?report=BILLING_ADJUSTMENTS&from=2020-01-01&to=2099-12-31&format=XLSX', headers: { authorization: `Bearer ${adminToken}` } });
    expect(exported.statusCode, exported.body).toBe(200);
    expect(exported.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });

  it('voids only untouched invoices with a compensating ledger entry', async () => {
    const target = (await app.inject({ method: 'GET', url: '/invoices?query=SVC-00003-1&page=1&pageSize=10', headers: { authorization: `Bearer ${adminToken}` } })).json<InvoiceListResponse>().items[0];
    if (!target) throw new Error('Void target missing');
    const response = await app.inject({ method: 'POST', url: `/invoices/${target.id}/void`, headers: { authorization: `Bearer ${adminToken}` }, payload: { reason: 'Synthetic duplicate service validation' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ invoiceId: target.id, status: 'VOID', balanceCentavos: '0' });
    const detail = (await app.inject({ method: 'GET', url: `/invoices/${target.id}`, headers: { authorization: `Bearer ${adminToken}` } })).json<InvoiceDetail>();
    expect(detail).toMatchObject({ status: 'VOID', balanceCentavos: '0', voidReason: 'Synthetic duplicate service validation' });
    const [credit] = await database.db.select().from(ledgerEntries).where(and(eq(ledgerEntries.referenceType, 'INVOICE_VOID'), eq(ledgerEntries.referenceId, target.id))).limit(1);
    expect(credit?.creditCentavos).toBe(BigInt(target.totalCentavos));
    const repeat = await app.inject({ method: 'POST', url: `/invoices/${target.id}/void`, headers: { authorization: `Bearer ${adminToken}` }, payload: { reason: 'Synthetic repeated void attempt' } });
    expect(repeat.statusCode).toBe(409);
  });

  it('processes overdue invoice states with authorized, audited bulk posting', async () => {
    const denied = await app.inject({ method: 'POST', url: '/billing/overdue/process', headers: { authorization: `Bearer ${cashierToken}` }, payload: { asOf: '2026-09-01' } });
    expect(denied.statusCode).toBe(403);
    const response = await app.inject({ method: 'POST', url: '/billing/overdue/process', headers: { authorization: `Bearer ${adminToken}` }, payload: { asOf: '2026-09-01' } });
    expect(response.statusCode).toBe(200);
    const { invoicesMarkedOverdue } = response.json<{ invoicesMarkedOverdue: number }>();
    expect(invoicesMarkedOverdue).toBeGreaterThan(0);
    const overdue = await database.db.select().from(invoices).where(eq(invoices.status, 'OVERDUE'));
    expect(overdue.length).toBeGreaterThan(0);
    const overdueAudits = await database.db.select().from(auditLogs).where(eq(auditLogs.action, 'invoice.marked_overdue'));
    expect(overdueAudits).toHaveLength(invoicesMarkedOverdue);
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
    const ranged = await app.inject({ method: 'GET', url: `/subscribers/${service.subscriberId}/ledger?from=2026-08-02&to=2026-08-31`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(ranged.statusCode).toBe(200);
    expect(ranged.json<SubscriberLedger>()).toMatchObject({ from: '2026-08-02', to: '2026-08-31', openingBalanceCentavos: '154800', entries: [], closingBalanceCentavos: '154800' });
    const invalidRange = await app.inject({ method: 'GET', url: `/subscribers/${service.subscriberId}/ledger?from=2026-08-31&to=2026-08-01`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(invalidRange.statusCode).toBe(400);
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
