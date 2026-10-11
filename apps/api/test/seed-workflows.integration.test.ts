import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PasswordHasher, type ScryptParameters } from '../src/auth/password.js';
import { seedAuthorization } from '../src/auth/seed.js';
import type { DemoAccount } from '../src/auth/seed.js';
import { createDatabase } from '../src/db/client.js';
import { seedOperationalDemoData } from '../src/db/seed-operational.js';
import { seedDemoWorkflowData } from '../src/db/seed-workflows.js';
import { ReportService } from '../src/reports/service.js';
import {
  adjustments, applicationSettings, auditLogs, billingCycles, collectionBatchAccounts,
  collectionBatches, collectorAssignments, collectorRemittances, collectors,
  invoiceItems, invoices, ledgerEntries, paymentAllocations, paymentProofs, paymentReversals,
  payments, receipts, reconnectionRecords, serviceAccounts, serviceEvents, servicePlans,
  serviceTypes, subscriberAddresses, subscriberContacts, subscriberCredits, subscribers,
  suspensionRecords, users,
} from '../src/db/schema.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || url === process.env.DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a separate disposable database ending in _test.');
}

const database = createDatabase({ DATABASE_URL: url, DATABASE_POOL_MAX: 5 });
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const hasher = new PasswordHasher({ cost: 16_384, blockSize: 8, parallelization: 1, keyLength: 32, saltLength: 16, maxMemory: 64 * 1024 * 1024 } satisfies ScryptParameters);
const accounts: readonly DemoAccount[] = [
  { username: 'owner.demo', displayName: 'Demo Owner', role: 'OWNER' },
  { username: 'admin.demo', displayName: 'Demo Administrator', role: 'ADMIN' },
  { username: 'cashier.demo', displayName: 'Demo Cashier', role: 'CASHIER' },
  { username: 'collections.demo', displayName: 'Demo Collection Supervisor', role: 'COLLECTION_SUPERVISOR' },
  { username: 'auditor.demo', displayName: 'Demo Auditor', role: 'AUDITOR' },
  { username: 'technician.demo', displayName: 'Demo Technician', role: 'TECHNICIAN' },
  { username: 'viewer.demo', displayName: 'Demo Read-only Viewer', role: 'VIEWER' },
];
let proofDirectory = '';

beforeAll(async () => {
  proofDirectory = await mkdtemp(join(tmpdir(), 'bcis-demo-proof-'));
  await database.pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await database.pool.query('CREATE SCHEMA public');
  await database.pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await migrate(database.db, { migrationsFolder });
  await seedAuthorization(database, 'password', hasher, accounts, { mustChangePassword: false });
  await seedOperationalDemoData(database);
});

afterAll(async () => {
  await database.close();
  if (proofDirectory) await rm(proofDirectory, { recursive: true, force: true });
});

describe.sequential('synthetic demo workflow seed', () => {
  it('populates related entities through domain services and stays idempotent', async () => {
    expect(await seedDemoWorkflowData(database, proofDirectory)).toBe(true);

    const [planCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(servicePlans);
    const [typeCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(serviceTypes);
    const [subscriberCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(subscribers);
    const [contactCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(subscriberContacts);
    const [addressCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(subscriberAddresses);
    const [collectorCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(collectors);
    const [serviceCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(serviceAccounts);
    const [assignmentCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(collectorAssignments);
    const [eventCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(serviceEvents);
    const [cycleCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(billingCycles);
    const [invoiceCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(invoices);
    const [itemCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(invoiceItems);
    const [ledgerCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(ledgerEntries);
    const [adjustmentCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(adjustments);
    const [paymentCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(payments);
    const [allocationCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(paymentAllocations);
    const [receiptCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(receipts);
    const [creditCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(subscriberCredits);
    const [proofCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(paymentProofs);
    const [reversalCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(paymentReversals);
    const [batchCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(collectionBatches);
    const [batchAccountCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(collectionBatchAccounts);
    const [remittanceCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(collectorRemittances);
    const [suspensionCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(suspensionRecords);
    const [reconnectionCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(reconnectionRecords);
    const [settingCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(applicationSettings);
    const [auditCount] = await database.db.select({ value: sql<number>`count(*)::int` }).from(auditLogs);

    for (const count of [typeCount, planCount, subscriberCount, contactCount, addressCount, collectorCount, serviceCount,
      assignmentCount, eventCount, cycleCount, invoiceCount, itemCount, ledgerCount, paymentCount, allocationCount,
      receiptCount, creditCount, proofCount, reversalCount, batchCount, batchAccountCount, remittanceCount, settingCount, auditCount]) {
      expect(count?.value).toBeGreaterThan(0);
    }
    expect(adjustmentCount?.value).toBeGreaterThan(0);
    expect(suspensionCount?.value).toBeGreaterThanOrEqual(2);
    expect(reconnectionCount?.value).toBeGreaterThanOrEqual(2);

    const [beforePayments] = await database.db.select({ value: sql<number>`count(*)::int` }).from(payments);
    expect(await seedDemoWorkflowData(database, proofDirectory)).toBe(false);
    const [afterPayments] = await database.db.select({ value: sql<number>`count(*)::int` }).from(payments);
    expect(afterPayments?.value).toBe(beforePayments?.value);
  });

  it('provides visible dashboard metrics and rows for every report type', async () => {
    const currentDate = new Date().toISOString().slice(0, 10);
    const reports = new ReportService(database);
    const dashboard = await reports.dashboard({ from: '2026-01-01', to: currentDate }, { collectionView: true, subscriberView: true });
    expect(BigInt(dashboard.billedCentavos)).toBeGreaterThan(0n);
    expect(BigInt(dashboard.collectedCentavos)).toBeGreaterThan(0n);
    expect(dashboard.postedPaymentCount).toBeGreaterThan(0);
    expect(dashboard.overdueSubscriberCount).toBeGreaterThanOrEqual(10);
    expect(dashboard.monthlyCollections.length).toBeGreaterThanOrEqual(6);
    expect(dashboard.paymentMethods.map((item) => item.method)).toEqual(expect.arrayContaining(['CASH', 'GCASH']));
    for (const [bucket, amount] of Object.entries(dashboard.aging)) {
      expect(BigInt(amount), `${bucket} aging balance should be visible`).toBeGreaterThan(0n);
    }
    expect(dashboard.collectorPerformance.some((item) => item.assignedAccounts > 0)).toBe(true);
    expect(dashboard.recentPayments.length).toBeGreaterThan(0);

    const [subscriber] = await database.db.select({ id: subscribers.id }).from(subscribers)
      .where(sql`${subscribers.accountNumber} = 'BCIS-00001'`).limit(1);
    if (!subscriber) throw new Error('Synthetic statement subscriber missing');
    const reportKinds = [
      'DAILY_COLLECTIONS', 'WEEKLY_COLLECTIONS', 'MONTHLY_COLLECTIONS', 'ANNUAL_COLLECTIONS',
      'BILLING_VS_COLLECTION', 'REVENUE_BY_PLAN', 'REVENUE_BY_SERVICE', 'REVENUE_BY_AREA',
      'SUBSCRIBER_MASTER_LIST', 'PAYMENT_METHODS', 'OUTSTANDING_BALANCES', 'AR_AGING',
      'SUBSCRIBER_STATEMENT', 'COLLECTOR_REMITTANCE', 'COLLECTOR_ASSIGNMENTS', 'USER_ACTIVITY',
      'BILLING_ADJUSTMENTS', 'PAYMENT_REVERSALS', 'VOIDED_RECEIPTS',
    ] as const;
    for (const report of reportKinds) {
      const request = report === 'SUBSCRIBER_STATEMENT'
        ? { report, from: '2026-01-01', to: '2026-12-31', subscriberId: subscriber.id }
        : { report, from: '2026-01-01', to: '2026-12-31' };
      const result = await reports.report(request);
      expect(result.rows.length, `${report} should have seeded rows`).toBeGreaterThan(0);
    }

    const [seededUsers] = await database.db.select({ value: sql<number>`count(*)::int` }).from(users)
      .where(sql`${users.normalizedUsername} like '%.demo' and ${users.mustChangePassword} = false`);
    expect(seededUsers?.value).toBe(7);
  });
});
