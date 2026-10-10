import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { CreateCollectionBatchInput } from '@bcis/shared';
import type { Database } from '../db/client.js';
import {
  auditLogs, collectionAreas, collectionBatchAccounts, collectionBatches, collectors, collectorRemittances,
  invoices, payments, serviceAccounts, subscriberAddresses, subscribers,
} from '../db/schema.js';
import { AppError } from '../errors.js';

interface ActorContext { actorUserId: string; requestId: string }

export class CollectionRepository {
  constructor(private readonly database: Database) {}

  async references() {
    const [collectorRows, areaRows] = await Promise.all([
      this.database.db.select({ id: collectors.id, code: collectors.collectorNumber, name: collectors.name, status: collectors.status }).from(collectors).orderBy(asc(collectors.collectorNumber)),
      this.database.db.select({ id: collectionAreas.id, code: collectionAreas.code, name: collectionAreas.name, status: collectionAreas.status }).from(collectionAreas).orderBy(asc(collectionAreas.code)),
    ]);
    return { collectors: collectorRows, areas: areaRows };
  }

  async create(input: CreateCollectionBatchInput, context: ActorContext) {
    const id = await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`collection:${input.collectorId}:${input.collectionAreaId}:${input.collectionDate}`}))`);
      const [[collector], [area]] = await Promise.all([
        transaction.select().from(collectors).where(eq(collectors.id, input.collectorId)).limit(1),
        transaction.select().from(collectionAreas).where(eq(collectionAreas.id, input.collectionAreaId)).limit(1),
      ]);
      if (!collector || collector.status !== 'ACTIVE') throw new AppError(404, 'COLLECTOR_NOT_FOUND', 'Active collector not found');
      if (!area || area.status !== 'ACTIVE') throw new AppError(404, 'COLLECTION_AREA_NOT_FOUND', 'Active collection area not found');
      const [existing] = await transaction.select({ id: collectionBatches.id }).from(collectionBatches).where(and(
        eq(collectionBatches.collectorId, input.collectorId), eq(collectionBatches.collectionAreaId, input.collectionAreaId), eq(collectionBatches.collectionDate, input.collectionDate),
      )).limit(1);
      if (existing) throw new AppError(409, 'COLLECTION_BATCH_DUPLICATE', 'A batch already exists for this collector, area, and date');
      const monthStart = `${input.collectionDate.slice(0, 7)}-01`;
      const accounts = await transaction.select({
        subscriberId: serviceAccounts.subscriberId, serviceAccountId: serviceAccounts.id,
        currentBill: sql<bigint>`sum(CASE WHEN ${invoices.dueDate} >= ${monthStart} THEN ${invoices.balanceCentavos} ELSE 0 END)::bigint`.mapWith(invoices.balanceCentavos),
        arrears: sql<bigint>`sum(CASE WHEN ${invoices.dueDate} < ${monthStart} THEN ${invoices.balanceCentavos} ELSE 0 END)::bigint`.mapWith(invoices.balanceCentavos),
        total: sql<bigint>`sum(${invoices.balanceCentavos})::bigint`.mapWith(invoices.balanceCentavos),
      }).from(serviceAccounts).innerJoin(invoices, eq(invoices.serviceAccountId, serviceAccounts.id)).where(and(
        eq(serviceAccounts.assignedCollectorId, input.collectorId), eq(serviceAccounts.collectionAreaId, input.collectionAreaId),
        gt(invoices.balanceCentavos, 0n), inArray(invoices.status, ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE']),
      )).groupBy(serviceAccounts.subscriberId, serviceAccounts.id).orderBy(asc(serviceAccounts.serviceAccountNumber));
      const expected = accounts.reduce((sum, account) => sum + account.total, 0n);
      const sequence = await transaction.execute<{ value: string }>(sql`SELECT nextval('collection_batch_number_seq')::text AS value`);
      const value = sequence.rows[0]?.value;
      if (!value) throw new Error('COLLECTION_BATCH_NUMBER_FAILED');
      const batchNumber = `CB-${input.collectionDate.replaceAll('-', '')}-${value.padStart(7, '0')}`;
      const [batch] = await transaction.insert(collectionBatches).values({
        batchNumber, collectorId: input.collectorId, collectionAreaId: input.collectionAreaId,
        collectionDate: input.collectionDate, status: 'OPEN', expectedReceivableCentavos: expected, createdByUserId: context.actorUserId,
      }).returning({ id: collectionBatches.id });
      if (!batch) throw new Error('COLLECTION_BATCH_INSERT_FAILED');
      if (accounts.length > 0) await transaction.insert(collectionBatchAccounts).values(accounts.map((account) => ({
        batchId: batch.id, subscriberId: account.subscriberId, serviceAccountId: account.serviceAccountId,
        currentBillCentavos: account.currentBill, arrearsCentavos: account.arrears, amountDueCentavos: account.total,
      })));
      await transaction.insert(auditLogs).values({
        actorUserId: context.actorUserId, action: 'collection.batch.created', entityType: 'collection_batch', entityId: batch.id, reason: 'ROUTE_SNAPSHOT',
        newValues: { batchNumber, collectionDate: input.collectionDate, collectorId: input.collectorId, collectionAreaId: input.collectionAreaId, accountCount: accounts.length, expectedReceivableCentavos: expected.toString() }, requestId: context.requestId,
      });
      return batch.id;
    });
    return this.detail(id);
  }

  async record(batchId: string, batchAccountId: string, paymentId: string, notes: string | undefined, context: ActorContext) {
    await this.database.db.transaction(async (transaction) => {
      const [batch] = await transaction.select().from(collectionBatches).where(eq(collectionBatches.id, batchId)).limit(1).for('update');
      if (!batch) throw new AppError(404, 'COLLECTION_BATCH_NOT_FOUND', 'Collection batch not found');
      if (!['OPEN', 'IN_PROGRESS'].includes(batch.status)) throw new AppError(409, 'COLLECTION_BATCH_NOT_RECORDABLE', 'Collections can only be recorded before submission');
      const [account] = await transaction.select().from(collectionBatchAccounts).where(and(eq(collectionBatchAccounts.id, batchAccountId), eq(collectionBatchAccounts.batchId, batchId))).limit(1).for('update');
      if (!account) throw new AppError(404, 'BATCH_ACCOUNT_NOT_FOUND', 'Route-sheet account not found');
      if (account.paymentId) throw new AppError(409, 'COLLECTION_ALREADY_RECORDED', 'This route-sheet account already has a recorded payment');
      const [payment] = await transaction.select().from(payments).where(eq(payments.id, paymentId)).limit(1).for('update');
      if (!payment || payment.status !== 'POSTED') throw new AppError(409, 'PAYMENT_NOT_POSTED', 'Recorded collection must reference a posted payment');
      if (payment.subscriberId !== account.subscriberId) throw new AppError(409, 'PAYMENT_SUBSCRIBER_MISMATCH', 'Payment belongs to a different subscriber');
      if (payment.paymentDate.toISOString().slice(0, 10) !== batch.collectionDate) throw new AppError(409, 'PAYMENT_DATE_MISMATCH', 'Payment date must match the collection batch date');
      const outcome = payment.amountCentavos >= account.amountDueCentavos ? 'COLLECTED' : 'PARTIAL';
      await transaction.update(collectionBatchAccounts).set({ paymentId, outcome, notes: notes ?? null }).where(eq(collectionBatchAccounts.id, account.id));
      if (batch.status === 'OPEN') await transaction.update(collectionBatches).set({ status: 'IN_PROGRESS' }).where(eq(collectionBatches.id, batchId));
      await transaction.insert(auditLogs).values({
        actorUserId: context.actorUserId, action: 'collection.payment.recorded', entityType: 'collection_batch_account', entityId: account.id,
        reason: notes ?? 'ROUTE_COLLECTION', newValues: { batchId, paymentId, outcome, amountCentavos: payment.amountCentavos.toString(), method: payment.method }, requestId: context.requestId,
      });
    });
    return this.detail(batchId);
  }

  async submit(batchId: string, context: ActorContext) {
    await this.database.db.transaction(async (transaction) => {
      const [batch] = await transaction.select().from(collectionBatches).where(eq(collectionBatches.id, batchId)).limit(1).for('update');
      if (!batch) throw new AppError(404, 'COLLECTION_BATCH_NOT_FOUND', 'Collection batch not found');
      if (!['OPEN', 'IN_PROGRESS'].includes(batch.status)) throw new AppError(409, 'COLLECTION_BATCH_NOT_SUBMITTABLE', 'Collection batch cannot be submitted from its current state');
      const [recorded] = await transaction.select({ count: sql<number>`count(*)::int` }).from(collectionBatchAccounts).where(and(eq(collectionBatchAccounts.batchId, batchId), sql`${collectionBatchAccounts.paymentId} IS NOT NULL`));
      if (!recorded || recorded.count === 0) throw new AppError(409, 'COLLECTION_BATCH_EMPTY', 'Record at least one collection before submission');
      const now = new Date();
      await transaction.update(collectionBatches).set({ status: 'SUBMITTED', submittedAt: now }).where(eq(collectionBatches.id, batchId));
      await transaction.insert(auditLogs).values({ actorUserId: context.actorUserId, action: 'collection.batch.submitted', entityType: 'collection_batch', entityId: batchId, reason: 'COLLECTOR_SUBMISSION', newValues: { status: 'SUBMITTED', recordedAccounts: recorded.count }, requestId: context.requestId });
    });
    return this.detail(batchId);
  }

  async remit(batchId: string, remittedCashCentavos: bigint, notes: string | undefined, context: ActorContext) {
    await this.database.db.transaction(async (transaction) => {
      const [batch] = await transaction.select().from(collectionBatches).where(eq(collectionBatches.id, batchId)).limit(1).for('update');
      if (!batch) throw new AppError(404, 'COLLECTION_BATCH_NOT_FOUND', 'Collection batch not found');
      if (batch.status !== 'SUBMITTED') throw new AppError(409, 'COLLECTION_BATCH_NOT_SUBMITTED', 'Submit the collection batch before remittance');
      const [totals] = await transaction.select({
        expectedCash: sql<bigint>`coalesce(sum(CASE WHEN ${payments.method} = 'CASH' AND ${payments.status} = 'POSTED' THEN ${payments.amountCentavos} ELSE 0 END), 0)::bigint`.mapWith(payments.amountCentavos),
        nonCash: sql<bigint>`coalesce(sum(CASE WHEN ${payments.method} <> 'CASH' AND ${payments.status} = 'POSTED' THEN ${payments.amountCentavos} ELSE 0 END), 0)::bigint`.mapWith(payments.amountCentavos),
      }).from(collectionBatchAccounts).innerJoin(payments, eq(collectionBatchAccounts.paymentId, payments.id)).where(eq(collectionBatchAccounts.batchId, batchId));
      const expectedCash = totals?.expectedCash ?? 0n;
      const nonCash = totals?.nonCash ?? 0n;
      const difference = remittedCashCentavos - expectedCash;
      await transaction.insert(collectorRemittances).values({
        batchId, expectedCashCentavos: expectedCash, remittedCashCentavos, differenceCentavos: difference,
        nonCashCentavos: nonCash, receivedByUserId: context.actorUserId, notes: notes ?? null,
      });
      await transaction.update(collectionBatches).set({ status: 'REMITTED' }).where(eq(collectionBatches.id, batchId));
      await transaction.insert(auditLogs).values({
        actorUserId: context.actorUserId, action: 'collection.remittance.recorded', entityType: 'collection_batch', entityId: batchId, reason: notes ?? 'COLLECTOR_REMITTANCE',
        newValues: { status: 'REMITTED', expectedCashCentavos: expectedCash.toString(), remittedCashCentavos: remittedCashCentavos.toString(), differenceCentavos: difference.toString(), nonCashCentavos: nonCash.toString() }, requestId: context.requestId,
      });
    });
    return this.detail(batchId);
  }

  async reconcile(batchId: string, notes: string, context: ActorContext) {
    await this.database.db.transaction(async (transaction) => {
      const [batch] = await transaction.select().from(collectionBatches).where(eq(collectionBatches.id, batchId)).limit(1).for('update');
      if (!batch) throw new AppError(404, 'COLLECTION_BATCH_NOT_FOUND', 'Collection batch not found');
      if (batch.status !== 'REMITTED') throw new AppError(409, 'COLLECTION_BATCH_NOT_REMITTED', 'Record remittance before reconciliation');
      const now = new Date();
      await transaction.update(collectionBatches).set({ status: 'RECONCILED', reconciledAt: now, reconciledByUserId: context.actorUserId, reconciliationNotes: notes }).where(eq(collectionBatches.id, batchId));
      await transaction.insert(auditLogs).values({ actorUserId: context.actorUserId, action: 'collection.batch.reconciled', entityType: 'collection_batch', entityId: batchId, reason: notes, oldValues: { status: 'REMITTED' }, newValues: { status: 'RECONCILED' }, requestId: context.requestId });
    });
    return this.detail(batchId);
  }

  async close(batchId: string, notes: string | undefined, context: ActorContext) {
    await this.database.db.transaction(async (transaction) => {
      const [batch] = await transaction.select().from(collectionBatches).where(eq(collectionBatches.id, batchId)).limit(1).for('update');
      if (!batch) throw new AppError(404, 'COLLECTION_BATCH_NOT_FOUND', 'Collection batch not found');
      if (batch.status !== 'RECONCILED') throw new AppError(409, 'COLLECTION_BATCH_NOT_RECONCILED', 'Reconcile the collection batch before closing');
      const [remittance] = await transaction.select().from(collectorRemittances).where(eq(collectorRemittances.batchId, batchId)).limit(1);
      if (!remittance) throw new Error('COLLECTION_REMITTANCE_MISSING');
      if (remittance.differenceCentavos !== 0n && !notes) throw new AppError(409, 'VARIANCE_ACKNOWLEDGEMENT_REQUIRED', 'A closing note is required for shortage or overage');
      const now = new Date();
      await transaction.update(collectionBatches).set({ status: 'CLOSED', closedAt: now, closedByUserId: context.actorUserId, closeNotes: notes ?? null }).where(eq(collectionBatches.id, batchId));
      await transaction.insert(auditLogs).values({
        actorUserId: context.actorUserId, action: 'collection.batch.closed', entityType: 'collection_batch', entityId: batchId,
        reason: notes ?? 'BALANCED_REMITTANCE', oldValues: { status: 'RECONCILED' }, newValues: { status: 'CLOSED', differenceCentavos: remittance.differenceCentavos.toString() }, requestId: context.requestId,
      });
    });
    return this.detail(batchId);
  }

  async detail(id: string) {
    const [batch] = await this.database.db.select({
      id: collectionBatches.id, batchNumber: collectionBatches.batchNumber, collectorId: collectionBatches.collectorId, collectorName: collectors.name,
      collectionAreaId: collectionBatches.collectionAreaId, collectionAreaName: collectionAreas.name, collectionDate: collectionBatches.collectionDate,
      status: collectionBatches.status, expectedReceivableCentavos: collectionBatches.expectedReceivableCentavos,
      submittedAt: collectionBatches.submittedAt, reconciledAt: collectionBatches.reconciledAt, reconciliationNotes: collectionBatches.reconciliationNotes,
      closedAt: collectionBatches.closedAt, closeNotes: collectionBatches.closeNotes,
    }).from(collectionBatches).innerJoin(collectors, eq(collectionBatches.collectorId, collectors.id))
      .innerJoin(collectionAreas, eq(collectionBatches.collectionAreaId, collectionAreas.id)).where(eq(collectionBatches.id, id)).limit(1);
    if (!batch) return null;
    const accounts = await this.database.db.select({
      id: collectionBatchAccounts.id, subscriberId: collectionBatchAccounts.subscriberId, accountNumber: subscribers.accountNumber,
      firstName: subscribers.firstName, lastName: subscribers.lastName, organizationName: subscribers.organizationName,
      serviceAccountId: collectionBatchAccounts.serviceAccountId, serviceAccountNumber: serviceAccounts.serviceAccountNumber,
      line1: subscriberAddresses.line1, barangay: subscriberAddresses.barangay, municipality: subscriberAddresses.municipality, province: subscriberAddresses.province,
      currentBillCentavos: collectionBatchAccounts.currentBillCentavos, arrearsCentavos: collectionBatchAccounts.arrearsCentavos,
      amountDueCentavos: collectionBatchAccounts.amountDueCentavos, paymentId: collectionBatchAccounts.paymentId,
      paymentMethod: payments.method, paymentAmountCentavos: payments.amountCentavos, outcome: collectionBatchAccounts.outcome, notes: collectionBatchAccounts.notes,
    }).from(collectionBatchAccounts).innerJoin(subscribers, eq(collectionBatchAccounts.subscriberId, subscribers.id))
      .innerJoin(serviceAccounts, eq(collectionBatchAccounts.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscriberAddresses, eq(serviceAccounts.installationAddressId, subscriberAddresses.id))
      .leftJoin(payments, eq(collectionBatchAccounts.paymentId, payments.id)).where(eq(collectionBatchAccounts.batchId, id)).orderBy(asc(subscribers.accountNumber), asc(serviceAccounts.serviceAccountNumber));
    const [remittance] = await this.database.db.select().from(collectorRemittances).where(eq(collectorRemittances.batchId, id)).limit(1);
    return { batch, accounts, remittance: remittance ?? null };
  }
}
