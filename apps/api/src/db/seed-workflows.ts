import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { postPaymentInputSchema, type PostPaymentInput } from '@bcis/shared';
import type { Database } from './client.js';
import { BillingService } from '../billing/service.js';
import { CollectionService } from '../collections/service.js';
import { PaymentService } from '../payments/service.js';
import { GcashProofStorage } from '../payments/proof-storage.js';
import { ServiceControlService } from '../service-control/service.js';
import {
  adjustments, applicationSettings, auditLogs, collectionAreas, collectionBatches, collectors,
  invoices, payments as paymentTable, serviceAccounts, subscribers, users,
} from './schema.js';

const demoSeedKey = 'demo_workflow_seed_v2';
const demoPaymentKeys = {
  exact: '00000000-0000-4000-8000-000000000101',
  partial: '00000000-0000-4000-8000-000000000102',
  advance: '00000000-0000-4000-8000-000000000103',
  reversal: '00000000-0000-4000-8000-000000000104',
  gcashPending: '00000000-0000-4000-8000-000000000105',
  gcashVerified: '00000000-0000-4000-8000-000000000106',
} as const;

type OpenInvoice = typeof invoices.$inferSelect;
type ActorIds = { admin: string; cashier: string; collectionSupervisor: string; technician: string };

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Demo seed is missing ${name}`);
  return value;
}

function currentBusinessDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function completeBillingPeriods(): string[] {
  const current = new Date();
  const month = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1));
  const firstSeedMonth = new Date(Date.UTC(2026, 3, 1));
  const periods: string[] = [];
  for (let cursor = firstSeedMonth; cursor < month; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
    periods.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return periods;
}

function currentBillingPeriod(): string {
  return currentBusinessDate().slice(0, 7);
}

async function actors(database: Database): Promise<ActorIds> {
  const rows = await database.db.select({ id: users.id, username: users.normalizedUsername }).from(users)
    .where(inArray(users.normalizedUsername, ['admin.demo', 'cashier.demo', 'collections.demo', 'technician.demo']));
  const byUsername = new Map(rows.map((row) => [row.username, row.id]));
  return {
    admin: required(byUsername.get('admin.demo'), 'admin.demo account'),
    cashier: required(byUsername.get('cashier.demo'), 'cashier.demo account'),
    collectionSupervisor: required(byUsername.get('collections.demo'), 'collections.demo account'),
    technician: required(byUsername.get('technician.demo'), 'technician.demo account'),
  };
}

async function openInvoices(database: Database, subscriberId: string): Promise<OpenInvoice[]> {
  return database.db.select().from(invoices).where(and(
    eq(invoices.subscriberId, subscriberId),
    inArray(invoices.status, ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE']),
    gt(invoices.balanceCentavos, 0n),
  )).orderBy(asc(invoices.dueDate), asc(invoices.invoiceDate), asc(invoices.invoiceNumber), asc(invoices.id));
}

function totalOutstanding(rows: readonly OpenInvoice[]): bigint {
  return rows.reduce((total, invoice) => total + invoice.balanceCentavos, 0n);
}

async function findSubscriber(database: Database, accountNumber: string) {
  const [row] = await database.db.select({ id: subscribers.id }).from(subscribers)
    .where(eq(subscribers.accountNumber, accountNumber)).limit(1);
  return row;
}

async function paymentExists(database: Database, idempotencyKey: string) {
  const [row] = await database.db.select({ id: paymentTable.id, status: paymentTable.status }).from(paymentTable)
    .where(eq(paymentTable.idempotencyKey, idempotencyKey)).limit(1);
  return row;
}

async function postCash(
  paymentService: PaymentService,
  subscriberId: string,
  amount: bigint,
  idempotencyKey: string,
  actorId: string,
  notes: string,
  paymentDate = new Date().toISOString(),
) {
  const input: PostPaymentInput = postPaymentInputSchema.parse({
    subscriberId, amountCentavos: amount.toString(), paymentDate, idempotencyKey,
    method: 'CASH', notes,
  });
  return paymentService.create(input, actorId, `seed:${idempotencyKey}`);
}

async function seedCashScenario(
  database: Database,
  paymentService: PaymentService,
  accountNumber: string,
  amountFor: (rows: readonly OpenInvoice[]) => bigint,
  idempotencyKey: string,
  actorsByRole: ActorIds,
  notes: string,
) {
  if (await paymentExists(database, idempotencyKey)) return;
  const subscriber = await findSubscriber(database, accountNumber);
  if (!subscriber) return;
  const invoicesForSubscriber = await openInvoices(database, subscriber.id);
  if (invoicesForSubscriber.length === 0) return;
  const amount = amountFor(invoicesForSubscriber);
  if (amount <= 0n) return;
  await postCash(paymentService, subscriber.id, amount, idempotencyKey, actorsByRole.cashier, notes);
}

function monthlyCollectionKey(period: string): string {
  return `00000000-0000-4000-8000-${period.replace('-', '')}000000`;
}

async function seedMonthlyCollections(
  database: Database,
  paymentService: PaymentService,
  periods: readonly string[],
  actorsByRole: ActorIds,
) {
  for (const [index, period] of periods.slice(-6).entries()) {
    const key = monthlyCollectionKey(period);
    if (await paymentExists(database, key)) continue;
    const accountNumber = `BCIS-${String(index + 10).padStart(5, '0')}`;
    const subscriber = await findSubscriber(database, accountNumber);
    if (!subscriber) continue;
    const [invoice] = await openInvoices(database, subscriber.id);
    if (!invoice) continue;
    const amount = invoice.balanceCentavos < 5_000n ? invoice.balanceCentavos : 5_000n;
    const result = await postCash(paymentService, subscriber.id, amount, key, actorsByRole.cashier,
      `Synthetic monthly dashboard collection for ${period}.`, `${period}-28T09:00:00.000Z`);
    if (result.status !== 'POSTED') throw new Error(`Synthetic monthly payment failed for ${period}`);
  }
}

async function seedGcashScenario(
  database: Database,
  paymentService: PaymentService,
  accountNumber: string,
  idempotencyKey: string,
  actorsByRole: ActorIds,
  verify: boolean,
) {
  const existing = await paymentExists(database, idempotencyKey);
  if (existing) {
    if (verify && existing.status === 'PENDING_VERIFICATION') {
      await paymentService.verify(existing.id, { decision: 'VERIFIED' }, actorsByRole.admin, `seed:verify:${idempotencyKey}`);
    }
    return;
  }
  const subscriber = await findSubscriber(database, accountNumber);
  if (!subscriber) return;
  const invoicesForSubscriber = await openInvoices(database, subscriber.id);
  if (invoicesForSubscriber.length === 0) return;

  const upload = await paymentService.uploadProof({
    originalFilename: 'synthetic-gcash-proof.png',
    mimeType: 'image/png',
    contentBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nm6kAAAAASUVORK5CYII=',
  }, actorsByRole.cashier);
  const input: PostPaymentInput = postPaymentInputSchema.parse({
    subscriberId: subscriber.id,
    amountCentavos: (invoicesForSubscriber[0]?.balanceCentavos ?? 1n).toString(),
    paymentDate: new Date().toISOString(),
    idempotencyKey,
    method: 'GCASH',
    referenceNumber: verify ? 'DEMO-GCASH-VERIFIED-001' : 'DEMO-GCASH-PENDING-001',
    senderDetails: 'Synthetic demo sender',
    notes: 'Synthetic demonstration GCash transfer.',
    proof: upload,
  });
  const result = await paymentService.create(input, actorsByRole.cashier, `seed:${idempotencyKey}`);
  if (verify && result.status === 'PENDING_VERIFICATION') {
    await paymentService.verify(result.paymentId, { decision: 'VERIFIED' }, actorsByRole.admin, `seed:verify:${idempotencyKey}`);
  }
}

async function seedAdjustment(database: Database, billingService: BillingService, actorsByRole: ActorIds) {
  const subscriber = await findSubscriber(database, 'BCIS-00007');
  if (!subscriber) return;
  const [invoice] = await openInvoices(database, subscriber.id);
  if (!invoice) return;
  const reason = 'Synthetic demo service penalty adjustment';
  const [existing] = await database.db.select({ id: adjustments.id }).from(adjustments).where(and(
    eq(adjustments.invoiceId, invoice.id), eq(adjustments.reason, reason),
  )).limit(1);
  if (existing) return;
  await billingService.adjust(invoice.id, { amountCentavos: '5000', lineType: 'PENALTY', reason }, actorsByRole.admin, 'seed:invoice-adjustment');
}

async function seedReversedPayment(database: Database, paymentService: PaymentService, actorsByRole: ActorIds) {
  const key = demoPaymentKeys.reversal;
  const existing = await paymentExists(database, key);
  if (existing) {
    if (existing.status === 'POSTED') await paymentService.reverse(existing.id, { reason: 'Synthetic demonstration correction' }, actorsByRole.admin, 'seed:payment-reversal');
    return;
  }
  const subscriber = await findSubscriber(database, 'BCIS-00004');
  if (!subscriber) return;
  const [invoice] = await openInvoices(database, subscriber.id);
  if (!invoice) return;
  const payment = await postCash(paymentService, subscriber.id, invoice.balanceCentavos < 10_000n ? invoice.balanceCentavos : 10_000n,
    key, actorsByRole.cashier, 'Synthetic demo payment for reversal history.');
  await paymentService.reverse(payment.paymentId, { reason: 'Synthetic demonstration correction' }, actorsByRole.admin, 'seed:payment-reversal');
}

async function seedOrganizationSettings(database: Database, actorId: string) {
  const value = {
    companyName: 'Bukidnon Cable and Internet Services',
    companyAddress: 'Malaybalay City, Bukidnon',
    contactNumber: '(088) 555-0100',
    reportFooter: 'Synthetic demonstration data for BCIS evaluation.',
    defaultBillingDay: 1,
    defaultDueDay: 15,
  };
  await database.db.insert(applicationSettings).values({
    key: 'organization_settings', value, description: 'Organization name and billing defaults for the synthetic demo', updatedByUserId: actorId,
  }).onConflictDoNothing({ target: applicationSettings.key });
}

async function seedCollectionWorkflow(
  database: Database,
  collectionService: CollectionService,
  paymentService: PaymentService,
  actorsByRole: ActorIds,
) {
  const date = currentBusinessDate();
  const [route] = await database.db.select({ collectorId: collectors.id, areaId: collectionAreas.id })
    .from(serviceAccounts).innerJoin(collectors, eq(serviceAccounts.assignedCollectorId, collectors.id))
    .innerJoin(collectionAreas, eq(serviceAccounts.collectionAreaId, collectionAreas.id))
    .where(eq(serviceAccounts.status, 'ACTIVE')).limit(1);
  if (!route) return;

  let [batchRow] = await database.db.select({ id: collectionBatches.id, status: collectionBatches.status }).from(collectionBatches).where(and(
    eq(collectionBatches.collectorId, route.collectorId), eq(collectionBatches.collectionAreaId, route.areaId), eq(collectionBatches.collectionDate, date),
  )).limit(1);
  if (!batchRow) {
    const batch = await collectionService.create({ collectorId: route.collectorId, collectionAreaId: route.areaId, collectionDate: date }, actorsByRole.collectionSupervisor, 'seed:collection-batch');
    batchRow = { id: batch.id, status: batch.status };
  }
  let batch = await collectionService.detail(batchRow.id);
  if (!batch) return;
  if (['OPEN', 'IN_PROGRESS'].includes(batch.status)) {
    const account = batch.accounts.find((item) => !item.paymentId && BigInt(item.amountDueCentavos) > 0n);
    if (!account) return;
    const amount = BigInt(account.amountDueCentavos) < 50_000n ? BigInt(account.amountDueCentavos) : 50_000n;
    const payment = await postCash(paymentService, account.subscriberId, amount, batch.id, actorsByRole.cashier,
      'Synthetic route collection demonstration.', `${date}T09:00:00.000Z`);
    await collectionService.record(batch.id, { batchAccountId: account.id, paymentId: payment.paymentId, notes: 'Synthetic route collection.' }, actorsByRole.collectionSupervisor, 'seed:collection-record');
    batch = required(await collectionService.detail(batch.id), 'created collection batch');
  }
  if (['OPEN', 'IN_PROGRESS'].includes(batch.status) && batch.accounts.some((item) => item.paymentId)) {
    batch = await collectionService.submit(batch.id, actorsByRole.collectionSupervisor, 'seed:collection-submit');
  }
  if (batch.status === 'SUBMITTED') {
    const result = await database.db.execute<{ amount: string | null }>(sql`SELECT coalesce(sum(p.amount_centavos), 0)::text AS amount
      FROM collection_batch_accounts a JOIN payments p ON p.id = a.payment_id
      WHERE a.batch_id = ${batch.id} AND p.method = 'CASH' AND p.status = 'POSTED'`);
    batch = await collectionService.remit(batch.id, { remittedCashCentavos: result.rows[0]?.amount ?? '0', notes: 'Synthetic balanced demo remittance.' }, actorsByRole.collectionSupervisor, 'seed:collection-remit');
  }
  if (batch.status === 'REMITTED') batch = await collectionService.reconcile(batch.id, 'Synthetic demo remittance reconciled.', actorsByRole.admin, 'seed:collection-reconcile');
  if (batch.status === 'RECONCILED') await collectionService.close(batch.id, 'Synthetic balanced demo batch closed.', actorsByRole.admin, 'seed:collection-close');
}

async function seedServiceControlWorkflow(
  database: Database,
  serviceControl: ServiceControlService,
  paymentService: PaymentService,
  actorsByRole: ActorIds,
  serviceAccountNumber: string,
  settlementKey: string,
) {
  const [policy] = await database.db.select({ key: applicationSettings.key }).from(applicationSettings)
    .where(eq(applicationSettings.key, 'service_control_policy')).limit(1);
  if (!policy) await serviceControl.savePolicy({ gracePeriodDays: 1, suspensionThresholdDays: 30, reconnectionFeeCentavos: '30000' }, actorsByRole.admin, 'seed:service-control-policy');

  const [service] = await database.db.select({ id: serviceAccounts.id, subscriberId: serviceAccounts.subscriberId, status: serviceAccounts.status })
    .from(serviceAccounts).where(eq(serviceAccounts.serviceAccountNumber, serviceAccountNumber)).limit(1);
  if (!service || service.status !== 'ACTIVE') return;
  const existingSuspensions = await serviceControl.suspensions(1, 100);
  const existing = existingSuspensions.items.find((record) => record.serviceAccountId === service.id && record.status === 'ACTIVE');
  if (existingSuspensions.items.some((record) => record.serviceAccountId === service.id && record.status === 'LIFTED')) return;
  if (!existing) {
    try {
      const suspensionId = await serviceControl.createSuspension({
        serviceAccountId: service.id,
        effectiveDate: currentBusinessDate(),
        reason: 'Synthetic demonstration overdue suspension',
        notes: 'Generated only for the isolated BCIS demo dataset.',
      }, actorsByRole.admin, 'seed:suspension-request');
      await serviceControl.approveSuspension(suspensionId, actorsByRole.admin, 'seed:suspension-approve');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('SUSPENSION_THRESHOLD_NOT_MET')) throw error;
      return;
    }
  }

  const currentService = await database.db.select({ id: serviceAccounts.id, status: serviceAccounts.status })
    .from(serviceAccounts).where(eq(serviceAccounts.id, service.id)).limit(1);
  if (currentService[0]?.status !== 'SUSPENDED') return;
  const outstanding = await openInvoices(database, service.subscriberId);
  const amount = totalOutstanding(outstanding);
  if (amount > 0n) {
    await postCash(paymentService, service.subscriberId, amount, settlementKey,
      actorsByRole.cashier, 'Synthetic arrears settlement before demo reconnection.');
  }
  const reconnections = await serviceControl.allReconnections(1, 100);
  const record = reconnections.items.find((item) => item.serviceAccountId === service.id && item.status !== 'COMPLETED' && item.status !== 'CANCELLED');
  if (!record) return;
  if (record.status === 'REQUESTED') {
    await serviceControl.assignReconnection(record.id, {
      technicianUserId: actorsByRole.technician,
      scheduledDate: currentBusinessDate(),
      notes: 'Synthetic demonstration technician assignment.',
    }, actorsByRole.admin, 'seed:reconnection-assign');
  }
  const refreshed = await serviceControl.allReconnections(1, 100);
  const scheduled = refreshed.items.find((item) => item.id === record.id);
  if (scheduled?.status === 'SCHEDULED') await serviceControl.completeReconnection(record.id, actorsByRole.technician, 'seed:reconnection-complete');
}

export async function seedDemoWorkflowData(database: Database, proofDirectory: string): Promise<boolean> {
  const [complete] = await database.db.select({ key: applicationSettings.key }).from(applicationSettings).where(eq(applicationSettings.key, demoSeedKey)).limit(1);
  if (complete) return false;

  const actorIds = await actors(database);
  const billing = new BillingService(database);
  const payment = new PaymentService(database, new GcashProofStorage(proofDirectory));
  const collection = new CollectionService(database);
  const serviceControl = new ServiceControlService(database);
  const periods = completeBillingPeriods();
  const activePeriod = currentBillingPeriod();
  for (const period of periods) await billing.generate(period, actorIds.admin, `seed:billing:${period}`);
  await billing.generate(activePeriod, actorIds.admin, `seed:billing:${activePeriod}`);
  await billing.processOverdue(currentBusinessDate(), actorIds.admin, 'seed:overdue');

  await seedCashScenario(database, payment, 'BCIS-00001', (rows) => rows[0]?.balanceCentavos ?? 0n, demoPaymentKeys.exact, actorIds, 'Synthetic exact payment demonstration.');
  await seedCashScenario(database, payment, 'BCIS-00002', (rows) => totalOutstanding(rows) / 2n, demoPaymentKeys.partial, actorIds, 'Synthetic partial payment demonstration.');
  await seedCashScenario(database, payment, 'BCIS-00003', (rows) => totalOutstanding(rows) + 50_000n, demoPaymentKeys.advance, actorIds, 'Synthetic advance payment with customer credit.');
  await seedMonthlyCollections(database, payment, periods, actorIds);
  await seedReversedPayment(database, payment, actorIds);
  await seedGcashScenario(database, payment, 'BCIS-00005', demoPaymentKeys.gcashPending, actorIds, false);
  await seedGcashScenario(database, payment, 'BCIS-00006', demoPaymentKeys.gcashVerified, actorIds, true);
  await seedAdjustment(database, billing, actorIds);
  await seedOrganizationSettings(database, actorIds.admin);
  await seedCollectionWorkflow(database, collection, payment, actorIds);
  await seedServiceControlWorkflow(database, serviceControl, payment, actorIds, 'SVC-00050-1', '00000000-0000-4000-8000-000000000150');
  await seedServiceControlWorkflow(database, serviceControl, payment, actorIds, 'SVC-00049-1', '00000000-0000-4000-8000-000000000151');

  await database.db.transaction(async (transaction) => {
    await transaction.insert(applicationSettings).values({
      key: demoSeedKey,
      value: { completedAt: new Date().toISOString(), synthetic: true, generatedPeriods: [...periods, activePeriod] },
      description: 'Completion marker for rerunnable synthetic financial and operational demo workflows',
      updatedByUserId: actorIds.admin,
    }).onConflictDoNothing({ target: applicationSettings.key });
    await transaction.insert(auditLogs).values({
      actorUserId: actorIds.admin,
      action: 'demo.workflow_seed.applied',
      entityType: 'synthetic_dataset',
      reason: 'SYNTHETIC_DEMO_DATA',
      newValues: { generatedPeriods: [...periods, activePeriod], accountScenarios: ['exact', 'partial', 'advance', 'reversed', 'gcash-pending', 'gcash-verified'], monthlyCollections: true, collectionBatch: true, serviceControlHistory: true },
      requestId: 'seed:workflow-demo',
    });
  });
  return true;
}
