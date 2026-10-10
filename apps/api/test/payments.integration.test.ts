import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { and, asc, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { PaymentResult } from '@bcis/shared';
import { buildApp } from '../src/app.js';
import { PasswordHasher, type ScryptParameters } from '../src/auth/password.js';
import { seedAuthorization, type DemoAccount } from '../src/auth/seed.js';
import { AuthService } from '../src/auth/service.js';
import { createDatabase } from '../src/db/client.js';
import { seedOperationalDemoData } from '../src/db/seed-operational.js';
import {
  auditLogs, billingCycles, invoices, ledgerEntries, paymentAllocations, paymentProofs,
  paymentReversals, payments, receipts, serviceAccounts, subscriberCredits,
} from '../src/db/schema.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || url === process.env.DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a separate disposable database ending in _test.');

const initialPassword = 'password';
const testHasher = new PasswordHasher({ cost: 16_384, blockSize: 8, parallelization: 1, keyLength: 32, saltLength: 16, maxMemory: 64 * 1024 * 1024 } satisfies ScryptParameters);
const accounts: readonly DemoAccount[] = [
  { username: 'admin.demo', displayName: 'Demo Administrator', role: 'ADMIN' },
  { username: 'cashier.demo', displayName: 'Demo Cashier', role: 'CASHIER' },
  { username: 'viewer.demo', displayName: 'Demo Viewer', role: 'VIEWER' },
];
const database = createDatabase({ DATABASE_URL: url, DATABASE_POOL_MAX: 5 });
const authService = new AuthService(database, testHasher);
const app = await buildApp({ database, authService, probeDatabase: database.probe, logLevel: 'silent' });
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
let adminToken = '';
let cashierToken = '';
let viewerToken = '';
const subscriberIds: Record<'exact' | 'partial' | 'advance' | 'oldest' | 'gcash', string> = { exact: '', partial: '', advance: '', oldest: '', gcash: '' };
let exactPaymentId = '';
let exactInvoiceId = '';

async function activate(username: string) {
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { username, password: initialPassword } });
  const token = login.json<{ token: string }>().token;
  const changed = await app.inject({ method: 'POST', url: '/auth/change-password', headers: { authorization: `Bearer ${token}` }, payload: { currentPassword: initialPassword, newPassword: initialPassword } });
  expect(changed.statusCode).toBe(204);
  return token;
}

async function subscriberFor(serviceAccountNumber: string, rate: bigint) {
  const [service] = await database.db.update(serviceAccounts).set({ currentRateCentavos: rate })
    .where(eq(serviceAccounts.serviceAccountNumber, serviceAccountNumber)).returning({ subscriberId: serviceAccounts.subscriberId });
  if (!service) throw new Error(`Missing synthetic service ${serviceAccountNumber}`);
  return service.subscriberId;
}

async function generate(period: string) {
  const response = await app.inject({ method: 'POST', url: '/billing/cycles/generate', headers: { authorization: `Bearer ${adminToken}` }, payload: { period } });
  expect(response.statusCode).toBe(200);
}

async function postCash(subscriberId: string, amountCentavos: string) {
  return app.inject({
    method: 'POST', url: '/payments', headers: { authorization: `Bearer ${cashierToken}` },
    payload: { subscriberId, amountCentavos, paymentDate: '2026-08-15T08:00:00.000Z', idempotencyKey: randomUUID(), method: 'CASH' },
  });
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
  viewerToken = await activate('viewer.demo');
  subscriberIds.exact = await subscriberFor('SVC-00016-1', 99_900n);
  subscriberIds.partial = await subscriberFor('SVC-00018-1', 99_900n);
  subscriberIds.advance = await subscriberFor('SVC-00019-1', 100_000n);
  subscriberIds.oldest = await subscriberFor('SVC-00020-1', 99_900n);
  subscriberIds.gcash = await subscriberFor('SVC-00021-1', 99_900n);
  await generate('2026-08');
});

afterAll(async () => { await app.close(); await database.close(); });

describe.sequential('AT-01 through AT-06 payment invariants', () => {
  it('AT-01 posts an exact cash payment, clears the invoice, balances the ledger, and issues a unique receipt', async () => {
    const response = await postCash(subscriberIds.exact, '99900');
    expect(response.statusCode).toBe(200);
    const result = response.json<PaymentResult>();
    expect(result).toMatchObject({ status: 'POSTED', amountCentavos: '99900', allocatedCentavos: '99900', unappliedCreditCentavos: '0' });
    expect(result.receiptNumber).toMatch(/^OR-2026-\d{8}$/);
    expect(result.allocations).toHaveLength(1);
    exactPaymentId = result.paymentId;
    exactInvoiceId = result.allocations[0]?.invoiceId ?? '';
    const [invoice] = await database.db.select().from(invoices).where(eq(invoices.id, exactInvoiceId));
    expect(invoice).toMatchObject({ status: 'PAID', balanceCentavos: 0n });
    const entries = await database.db.select().from(ledgerEntries).where(eq(ledgerEntries.subscriberId, subscriberIds.exact)).orderBy(asc(ledgerEntries.occurredAt));
    expect(entries.reduce((balance, entry) => balance + entry.debitCentavos - entry.creditCentavos, 0n)).toBe(0n);
  });

  it('AT-02 posts a partial payment and preserves the exact remaining balance', async () => {
    const result = (await postCash(subscriberIds.partial, '50000')).json<PaymentResult>();
    expect(result).toMatchObject({ allocatedCentavos: '50000', unappliedCreditCentavos: '0' });
    const [invoice] = await database.db.select().from(invoices).where(eq(invoices.id, result.allocations[0]?.invoiceId ?? ''));
    expect(invoice).toMatchObject({ status: 'PARTIALLY_PAID', balanceCentavos: 49_900n });
  });

  it('AT-03 preserves a three-month payment as allocation plus unapplied customer credit', async () => {
    const result = (await postCash(subscriberIds.advance, '300000')).json<PaymentResult>();
    expect(result).toMatchObject({ allocatedCentavos: '100000', unappliedCreditCentavos: '200000' });
    const [credit] = await database.db.select().from(subscriberCredits).where(eq(subscriberCredits.sourcePaymentId, result.paymentId));
    expect(credit).toMatchObject({ originalAmountCentavos: 200_000n, remainingAmountCentavos: 200_000n, status: 'AVAILABLE' });
    expect(BigInt(result.allocatedCentavos) + BigInt(result.unappliedCreditCentavos)).toBe(300_000n);
  });

  it('AT-04 allocates oldest invoice first with a stable order', async () => {
    await generate('2026-09');
    const result = (await postCash(subscriberIds.oldest, '120000')).json<PaymentResult>();
    expect(result.allocations.map((allocation) => allocation.amountCentavos)).toEqual(['99900', '20100']);
    const cycles = await database.db.select().from(billingCycles).orderBy(asc(billingCycles.periodStart));
    const augustCycle = cycles.find((cycle) => cycle.periodStart === '2026-08-01');
    const septemberCycle = cycles.find((cycle) => cycle.periodStart === '2026-09-01');
    const rows = await database.db.select().from(invoices).where(eq(invoices.subscriberId, subscriberIds.oldest));
    const august = rows.find((invoice) => invoice.billingCycleId === augustCycle?.id);
    const september = rows.find((invoice) => invoice.billingCycleId === septemberCycle?.id);
    expect(august).toMatchObject({ status: 'PAID', balanceCentavos: 0n });
    expect(september).toMatchObject({ status: 'PARTIALLY_PAID', balanceCentavos: 79_800n });
    expect(result.allocations.map((allocation) => allocation.invoiceId)).toEqual([august?.id, september?.id]);
  });

  it('AT-05 keeps GCash unposted until verification and blocks a reused canonical reference', async () => {
    const payload = {
      subscriberId: subscriberIds.gcash, amountCentavos: '99900', paymentDate: '2026-08-16T08:00:00.000Z', idempotencyKey: randomUUID(), method: 'GCASH',
      referenceNumber: ' gcash-ref-0001 ', senderDetails: 'Synthetic Sender',
      proof: { storageKey: 'synthetic/gcash-proof-0001.png', originalFilename: 'proof.png', mimeType: 'image/png', sizeBytes: '1024', sha256: 'a'.repeat(64) },
    };
    const submitted = await app.inject({ method: 'POST', url: '/payments', headers: { authorization: `Bearer ${cashierToken}` }, payload });
    expect(submitted.statusCode).toBe(201);
    const pending = submitted.json<PaymentResult>();
    expect(pending).toMatchObject({ status: 'PENDING_VERIFICATION', receiptNumber: null, allocatedCentavos: '0' });
    const [beforeProof] = await database.db.select().from(paymentProofs).where(eq(paymentProofs.paymentId, pending.paymentId));
    expect(beforeProof?.status).toBe('PENDING');
    const verified = await app.inject({ method: 'POST', url: `/payments/${pending.paymentId}/gcash-verification`, headers: { authorization: `Bearer ${cashierToken}` }, payload: { decision: 'VERIFIED' } });
    expect(verified.statusCode).toBe(200);
    expect(verified.json<PaymentResult>().status).toBe('POSTED');
    const duplicate = await app.inject({ method: 'POST', url: '/payments', headers: { authorization: `Bearer ${cashierToken}` }, payload: { ...payload, idempotencyKey: randomUUID(), referenceNumber: 'GCASH-REF-0001', proof: { ...payload.proof, storageKey: 'synthetic/gcash-proof-0002.png' } } });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ error: 'GCASH_REFERENCE_DUPLICATE' });
  });

  it('AT-06 reverses with compensating history, restores balances, and blocks Cashier reversal', async () => {
    const denied = await app.inject({ method: 'POST', url: `/payments/${exactPaymentId}/reverse`, headers: { authorization: `Bearer ${cashierToken}` }, payload: { reason: 'Synthetic correction' } });
    expect(denied.statusCode).toBe(403);
    const response = await app.inject({ method: 'POST', url: `/payments/${exactPaymentId}/reverse`, headers: { authorization: `Bearer ${adminToken}` }, payload: { reason: 'Synthetic correction' } });
    expect(response.statusCode).toBe(200);
    expect(response.json<PaymentResult>().status).toBe('REVERSED');
    const [invoice] = await database.db.select().from(invoices).where(eq(invoices.id, exactInvoiceId));
    const [original] = await database.db.select().from(payments).where(eq(payments.id, exactPaymentId));
    const [reversal] = await database.db.select().from(paymentReversals).where(eq(paymentReversals.paymentId, exactPaymentId));
    const [receipt] = await database.db.select().from(receipts).where(eq(receipts.paymentId, exactPaymentId));
    expect(invoice).toMatchObject({ status: 'UNPAID', balanceCentavos: 99_900n });
    expect(original?.status).toBe('REVERSED');
    expect(reversal).toMatchObject({ reason: 'Synthetic correction' });
    expect(receipt).toMatchObject({ status: 'VOID', voidReason: 'Synthetic correction' });
    const entries = await database.db.select().from(ledgerEntries).where(eq(ledgerEntries.subscriberId, subscriberIds.exact));
    expect(entries.reduce((balance, entry) => balance + entry.debitCentavos - entry.creditCentavos, 0n)).toBe(199_800n);
    const audit = await database.db.select().from(auditLogs).where(and(eq(auditLogs.action, 'payment.reversed'), eq(auditLogs.entityId, exactPaymentId)));
    expect(audit).toHaveLength(1);
    await expect(database.db.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, exactPaymentId))).rejects.toMatchObject({ cause: { code: '55000' } });
    await expect(database.db.update(payments).set({ amountCentavos: 1n }).where(eq(payments.id, exactPaymentId))).rejects.toMatchObject({ cause: { code: '55000' } });
  });

  it('replays concurrent idempotent requests without duplicate payments or receipts', async () => {
    const subscriberId = await subscriberFor('SVC-00022-1', 99_900n);
    const idempotencyKey = randomUUID();
    const request = () => app.inject({
      method: 'POST', url: '/payments', headers: { authorization: `Bearer ${cashierToken}` },
      payload: { subscriberId, amountCentavos: '50000', paymentDate: '2026-09-15T08:00:00.000Z', idempotencyKey, method: 'CASH' },
    });
    const responses = await Promise.all([request(), request(), request()]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
    const results = responses.map((response) => response.json<PaymentResult>());
    expect(new Set(results.map((result) => result.paymentId)).size).toBe(1);
    expect(new Set(results.map((result) => result.receiptNumber)).size).toBe(1);
    const storedPayments = await database.db.select().from(payments).where(eq(payments.idempotencyKey, idempotencyKey));
    const storedReceipts = await database.db.select().from(receipts).where(eq(receipts.paymentId, results[0]?.paymentId ?? ''));
    expect(storedPayments).toHaveLength(1);
    expect(storedReceipts).toHaveLength(1);
  });

  it('serializes distinct concurrent payments on one subscriber without over-allocation', async () => {
    const subscriberId = await subscriberFor('SVC-00024-1', 99_900n);
    const before = await database.db.select().from(invoices).where(eq(invoices.subscriberId, subscriberId));
    const outstanding = before.reduce((sum, invoice) => sum + invoice.balanceCentavos, 0n);
    expect(outstanding).toBeGreaterThan(0n);
    const request = () => app.inject({
      method: 'POST', url: '/payments', headers: { authorization: `Bearer ${cashierToken}` },
      payload: { subscriberId, amountCentavos: outstanding.toString(), paymentDate: '2026-09-16T08:00:00.000Z', idempotencyKey: randomUUID(), method: 'CASH' },
    });
    const responses = await Promise.all([request(), request()]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    const results = responses.map((response) => response.json<PaymentResult>());
    expect(results.reduce((sum, result) => sum + BigInt(result.allocatedCentavos), 0n)).toBe(outstanding);
    expect(results.reduce((sum, result) => sum + BigInt(result.unappliedCreditCentavos), 0n)).toBe(outstanding);
    const after = await database.db.select().from(invoices).where(eq(invoices.subscriberId, subscriberId));
    expect(after.every((invoice) => invoice.balanceCentavos === 0n && invoice.status === 'PAID')).toBe(true);
  });

  it('AT-09 isolates three concurrent sessions and preserves unique payment and receipt numbering', async () => {
    const secondLogin = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'cashier.demo', password: initialPassword } });
    expect(secondLogin.statusCode).toBe(200);
    const secondCashierSession = secondLogin.json<{ token: string }>().token;
    const firstSubscriber = await subscriberFor('SVC-00025-1', 99_900n);
    const secondSubscriber = await subscriberFor('SVC-00026-1', 99_900n);
    const payment = (token: string, subscriberId: string) => app.inject({
      method: 'POST', url: '/payments', headers: { authorization: `Bearer ${token}` },
      payload: { subscriberId, amountCentavos: '10000', paymentDate: '2026-09-17T08:00:00.000Z', idempotencyKey: randomUUID(), method: 'CASH' },
    });
    const [first, second, denied] = await Promise.all([
      payment(cashierToken, firstSubscriber), payment(secondCashierSession, secondSubscriber), payment(viewerToken, firstSubscriber),
    ]);
    expect([first.statusCode, second.statusCode, denied.statusCode]).toEqual([200, 200, 403]);
    const posted = [first.json<PaymentResult>(), second.json<PaymentResult>()];
    expect(new Set(posted.map((item) => item.paymentId)).size).toBe(2);
    expect(new Set(posted.map((item) => item.receiptNumber)).size).toBe(2);
    expect(posted.every((item) => item.status === 'POSTED' && item.allocatedCentavos === '10000')).toBe(true);
    expect(denied.json()).toMatchObject({ error: 'FORBIDDEN' });
    const stored = await database.db.select().from(payments).where(eq(payments.paymentDate, new Date('2026-09-17T08:00:00.000Z')));
    expect(stored).toHaveLength(2);
  });

  it('rolls back payment, allocation, balance, receipt, ledger, credit, and audit when posting fails', async () => {
    const subscriberId = await subscriberFor('SVC-00023-1', 99_900n);
    const [before] = await database.db.select().from(invoices).where(eq(invoices.subscriberId, subscriberId)).orderBy(asc(invoices.dueDate)).limit(1);
    if (!before) throw new Error('Synthetic invoice missing');
    const idempotencyKey = randomUUID();
    await database.pool.query(`
      CREATE FUNCTION test_reject_receipt_insert() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'synthetic receipt failure'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_reject_receipt_insert BEFORE INSERT ON receipts FOR EACH ROW EXECUTE FUNCTION test_reject_receipt_insert();
    `);
    try {
      const failed = await app.inject({
        method: 'POST', url: '/payments', headers: { authorization: `Bearer ${cashierToken}` },
        payload: { subscriberId, amountCentavos: '50000', paymentDate: '2026-09-15T08:00:00.000Z', idempotencyKey, method: 'CASH' },
      });
      expect(failed.statusCode).toBe(500);
    } finally {
      await database.pool.query('DROP TRIGGER IF EXISTS test_reject_receipt_insert ON receipts');
      await database.pool.query('DROP FUNCTION IF EXISTS test_reject_receipt_insert()');
    }
    const [after] = await database.db.select().from(invoices).where(eq(invoices.id, before.id));
    expect(after).toMatchObject({ balanceCentavos: before.balanceCentavos, status: before.status });
    expect(await database.db.select().from(payments).where(eq(payments.idempotencyKey, idempotencyKey))).toHaveLength(0);
    expect(await database.db.select().from(ledgerEntries).where(and(eq(ledgerEntries.subscriberId, subscriberId), eq(ledgerEntries.referenceType, 'PAYMENT')))).toHaveLength(0);
  });
});
