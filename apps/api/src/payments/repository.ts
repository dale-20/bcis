import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { PostPaymentInput, VerifyGcashInput } from '@bcis/shared';
import type { Database } from '../db/client.js';
import {
  auditLogs, invoices, ledgerEntries, paymentAllocations, paymentProofs,
  paymentReversals, payments, receipts, subscriberCredits, subscribers,
} from '../db/schema.js';
import { AppError } from '../errors.js';

type Transaction = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

interface ActorContext { actorUserId: string; requestId: string }

export class PaymentRepository {
  constructor(private readonly database: Database) {}

  async create(input: PostPaymentInput, context: ActorContext) {
    const result = await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`payment:${input.idempotencyKey}`}))`);
      const [existing] = await transaction.select({ id: payments.id }).from(payments)
        .where(eq(payments.idempotencyKey, input.idempotencyKey)).limit(1);
      if (existing) return existing.id;

      await this.lockSubscriber(transaction, input.subscriberId);
      const normalizedReference = input.method === 'GCASH' ? input.referenceNumber.trim().toUpperCase() : null;
      if (normalizedReference) {
        const [duplicate] = await transaction.select({ id: payments.id }).from(payments)
          .where(and(eq(payments.method, 'GCASH'), sql`lower(${payments.referenceNumber}) = lower(${normalizedReference})`)).limit(1);
        if (duplicate) throw new AppError(409, 'GCASH_REFERENCE_DUPLICATE', 'GCash reference number already exists');
      }

      const [payment] = await transaction.insert(payments).values({
        idempotencyKey: input.idempotencyKey,
        subscriberId: input.subscriberId,
        paymentDate: new Date(input.paymentDate),
        amountCentavos: BigInt(input.amountCentavos),
        method: input.method,
        status: input.method === 'CASH' ? 'POSTED' : 'PENDING_VERIFICATION',
        referenceNumber: normalizedReference,
        senderDetails: input.method === 'GCASH' ? input.senderDetails : null,
        notes: input.notes ?? null,
        createdByUserId: context.actorUserId,
      }).returning({ id: payments.id });
      if (!payment) throw new Error('PAYMENT_INSERT_FAILED');

      if (input.method === 'GCASH') {
        await transaction.insert(paymentProofs).values({
          paymentId: payment.id,
          storageKey: input.proof.storageKey,
          originalFilename: input.proof.originalFilename,
          mimeType: input.proof.mimeType,
          sizeBytes: BigInt(input.proof.sizeBytes),
          sha256: input.proof.sha256.toLowerCase(),
          status: 'PENDING',
        });
        await transaction.insert(auditLogs).values({
          actorUserId: context.actorUserId, action: 'payment.gcash.submitted', entityType: 'payment', entityId: payment.id,
          reason: 'GCASH_PROOF_PENDING', newValues: { amountCentavos: input.amountCentavos, referenceNumber: normalizedReference, proofStatus: 'PENDING' },
          requestId: context.requestId,
        });
      } else {
        await this.post(transaction, payment.id, context);
      }
      return payment.id;
    });
    return this.summary(result);
  }

  async verify(paymentId: string, input: VerifyGcashInput, context: ActorContext) {
    const result = await this.database.db.transaction(async (transaction) => {
      const [initial] = await transaction.select({ subscriberId: payments.subscriberId }).from(payments)
        .where(eq(payments.id, paymentId)).limit(1);
      if (!initial) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
      await this.lockSubscriber(transaction, initial.subscriberId);
      const [payment] = await transaction.select().from(payments).where(eq(payments.id, paymentId)).limit(1).for('update');
      if (!payment || payment.method !== 'GCASH') throw new AppError(409, 'PAYMENT_NOT_GCASH', 'Payment is not a GCash payment');
      if (payment.status !== 'PENDING_VERIFICATION') throw new AppError(409, 'PAYMENT_NOT_PENDING', 'GCash payment is no longer pending verification');
      const [proof] = await transaction.select().from(paymentProofs).where(eq(paymentProofs.paymentId, paymentId)).limit(1).for('update');
      if (!proof || proof.status !== 'PENDING') throw new AppError(409, 'PROOF_NOT_PENDING', 'GCash proof is no longer pending');
      const now = new Date();
      if (input.decision === 'REJECTED') {
        await transaction.update(paymentProofs).set({ status: 'REJECTED', verifiedByUserId: context.actorUserId, verifiedAt: now, rejectionReason: input.reason }).where(eq(paymentProofs.id, proof.id));
        await transaction.update(payments).set({ status: 'REJECTED' }).where(eq(payments.id, paymentId));
        await transaction.insert(auditLogs).values({
          actorUserId: context.actorUserId, action: 'payment.gcash.rejected', entityType: 'payment', entityId: paymentId,
          reason: input.reason, oldValues: { status: 'PENDING_VERIFICATION', proofStatus: 'PENDING' }, newValues: { status: 'REJECTED', proofStatus: 'REJECTED' }, requestId: context.requestId,
        });
      } else {
        await transaction.update(paymentProofs).set({ status: 'VERIFIED', verifiedByUserId: context.actorUserId, verifiedAt: now, rejectionReason: null }).where(eq(paymentProofs.id, proof.id));
        await this.post(transaction, paymentId, context);
      }
      return paymentId;
    });
    return this.summary(result);
  }

  async reverse(paymentId: string, reason: string, context: ActorContext) {
    const result = await this.database.db.transaction(async (transaction) => {
      const [initial] = await transaction.select({ subscriberId: payments.subscriberId }).from(payments)
        .where(eq(payments.id, paymentId)).limit(1);
      if (!initial) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
      await this.lockSubscriber(transaction, initial.subscriberId);
      const [payment] = await transaction.select().from(payments).where(eq(payments.id, paymentId)).limit(1).for('update');
      if (!payment || payment.status !== 'POSTED') throw new AppError(409, 'PAYMENT_NOT_POSTED', 'Only a posted payment can be reversed');

      const creditRows = await transaction.select().from(subscriberCredits).where(eq(subscriberCredits.sourcePaymentId, paymentId)).for('update');
      for (const credit of creditRows) {
        if (credit.remainingAmountCentavos !== credit.originalAmountCentavos) {
          throw new AppError(409, 'PAYMENT_CREDIT_ALREADY_USED', 'Payment credit has already been applied and cannot be reversed directly');
        }
        await transaction.update(subscriberCredits).set({ remainingAmountCentavos: 0n, status: 'REVERSED' }).where(eq(subscriberCredits.id, credit.id));
      }

      const allocations = await transaction.select({
        invoiceId: paymentAllocations.invoiceId, amountCentavos: paymentAllocations.amountCentavos,
      }).from(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId)).orderBy(asc(paymentAllocations.allocationOrder));
      for (const allocation of allocations) {
        const [invoice] = await transaction.select().from(invoices).where(eq(invoices.id, allocation.invoiceId)).limit(1).for('update');
        if (!invoice) throw new Error('ALLOCATED_INVOICE_NOT_FOUND');
        const restoredBalance = invoice.balanceCentavos + allocation.amountCentavos;
        if (restoredBalance > invoice.totalCentavos) throw new Error('PAYMENT_REVERSAL_BALANCE_OVERFLOW');
        await transaction.update(invoices).set({
          balanceCentavos: restoredBalance,
          status: restoredBalance === invoice.totalCentavos ? 'UNPAID' : 'PARTIALLY_PAID',
        }).where(eq(invoices.id, invoice.id));
      }

      const now = new Date();
      await transaction.insert(paymentReversals).values({ paymentId, reason, reversedByUserId: context.actorUserId, reversedAt: now });
      await transaction.update(receipts).set({ status: 'VOID', voidedAt: now, voidedByUserId: context.actorUserId, voidReason: reason }).where(eq(receipts.paymentId, paymentId));
      await transaction.update(payments).set({ status: 'REVERSED' }).where(eq(payments.id, paymentId));
      const [receipt] = await transaction.select({ receiptNumber: receipts.receiptNumber }).from(receipts).where(eq(receipts.paymentId, paymentId)).limit(1);
      if (!receipt) throw new Error('PAYMENT_RECEIPT_NOT_FOUND');
      const [reversal] = await transaction.select({ id: paymentReversals.id }).from(paymentReversals).where(eq(paymentReversals.paymentId, paymentId)).limit(1);
      if (!reversal) throw new Error('PAYMENT_REVERSAL_NOT_FOUND');
      await transaction.insert(ledgerEntries).values({
        subscriberId: payment.subscriberId, occurredAt: now, referenceType: 'PAYMENT_REVERSAL', referenceId: reversal.id,
        referenceNumber: receipt.receiptNumber, description: `Payment reversal - ${receipt.receiptNumber}`,
        debitCentavos: payment.amountCentavos, creditCentavos: 0n, metadata: { paymentId, reason },
      });
      await transaction.insert(auditLogs).values({
        actorUserId: context.actorUserId, action: 'payment.reversed', entityType: 'payment', entityId: paymentId, reason,
        oldValues: { status: 'POSTED', receiptStatus: 'ISSUED' }, newValues: { status: 'REVERSED', receiptStatus: 'VOID', restoredCentavos: payment.amountCentavos.toString() },
        requestId: context.requestId,
      });
      return paymentId;
    });
    return this.summary(result);
  }

  private async lockSubscriber(transaction: Transaction, subscriberId: string) {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`subscriber:${subscriberId}`}))`);
    const [subscriber] = await transaction.select({ id: subscribers.id }).from(subscribers).where(eq(subscribers.id, subscriberId)).limit(1);
    if (!subscriber) throw new AppError(404, 'SUBSCRIBER_NOT_FOUND', 'Subscriber not found');
  }

  private async post(transaction: Transaction, paymentId: string, context: ActorContext) {
    const [payment] = await transaction.select().from(payments).where(eq(payments.id, paymentId)).limit(1).for('update');
    if (!payment || !['POSTED', 'PENDING_VERIFICATION'].includes(payment.status)) throw new Error('PAYMENT_NOT_POSTABLE');
    let remaining = payment.amountCentavos;
    let allocationOrder = 1;
    const outstanding = await transaction.select().from(invoices)
      .where(and(eq(invoices.subscriberId, payment.subscriberId), inArray(invoices.status, ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'])))
      .orderBy(asc(invoices.dueDate), asc(invoices.invoiceDate), asc(invoices.invoiceNumber), asc(invoices.id)).for('update');
    for (const invoice of outstanding) {
      if (remaining === 0n) break;
      const amount = remaining < invoice.balanceCentavos ? remaining : invoice.balanceCentavos;
      if (amount === 0n) continue;
      const balance = invoice.balanceCentavos - amount;
      await transaction.insert(paymentAllocations).values({ paymentId, invoiceId: invoice.id, amountCentavos: amount, allocationOrder });
      await transaction.update(invoices).set({ balanceCentavos: balance, status: balance === 0n ? 'PAID' : 'PARTIALLY_PAID' }).where(eq(invoices.id, invoice.id));
      remaining -= amount;
      allocationOrder += 1;
    }
    if (remaining > 0n) {
      await transaction.insert(subscriberCredits).values({
        subscriberId: payment.subscriberId, sourcePaymentId: paymentId,
        originalAmountCentavos: remaining, remainingAmountCentavos: remaining, status: 'AVAILABLE',
      });
    }
    const sequenceResult = await transaction.execute<{ value: string }>(sql`SELECT nextval('receipt_number_seq')::text AS value`);
    const sequenceValue = sequenceResult.rows[0]?.value;
    if (!sequenceValue) throw new Error('RECEIPT_NUMBER_FAILED');
    const receiptNumber = `OR-${payment.paymentDate.getUTCFullYear()}-${sequenceValue.padStart(8, '0')}`;
    const now = new Date();
    await transaction.update(payments).set({ status: 'POSTED', postedByUserId: context.actorUserId, postedAt: now }).where(eq(payments.id, paymentId));
    await transaction.insert(receipts).values({ receiptNumber, paymentId, issuedAt: now, issuedByUserId: context.actorUserId });
    await transaction.insert(ledgerEntries).values({
      subscriberId: payment.subscriberId, occurredAt: payment.paymentDate, referenceType: 'PAYMENT', referenceId: paymentId,
      referenceNumber: receiptNumber, description: `${payment.method} payment - ${receiptNumber}`,
      debitCentavos: 0n, creditCentavos: payment.amountCentavos,
      metadata: { method: payment.method, allocatedCentavos: (payment.amountCentavos - remaining).toString(), unappliedCreditCentavos: remaining.toString() },
    });
    await transaction.insert(auditLogs).values({
      actorUserId: context.actorUserId, action: 'payment.posted', entityType: 'payment', entityId: paymentId, reason: payment.method,
      oldValues: payment.method === 'GCASH' ? { status: 'PENDING_VERIFICATION', proofStatus: 'PENDING' } : null,
      newValues: { status: 'POSTED', amountCentavos: payment.amountCentavos.toString(), receiptNumber, allocatedCentavos: (payment.amountCentavos - remaining).toString(), unappliedCreditCentavos: remaining.toString() },
      requestId: context.requestId,
    });
  }

  private async summary(paymentId: string) {
    const [payment] = await this.database.db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!payment) throw new Error('PAYMENT_SUMMARY_NOT_FOUND');
    const allocations = await this.database.db.select({
      invoiceId: paymentAllocations.invoiceId, invoiceNumber: invoices.invoiceNumber,
      amountCentavos: paymentAllocations.amountCentavos, allocationOrder: paymentAllocations.allocationOrder,
    }).from(paymentAllocations).innerJoin(invoices, eq(paymentAllocations.invoiceId, invoices.id))
      .where(eq(paymentAllocations.paymentId, paymentId)).orderBy(asc(paymentAllocations.allocationOrder));
    const [receipt] = await this.database.db.select({ receiptNumber: receipts.receiptNumber }).from(receipts).where(eq(receipts.paymentId, paymentId)).limit(1);
    const [credit] = await this.database.db.select({ original: subscriberCredits.originalAmountCentavos }).from(subscriberCredits).where(eq(subscriberCredits.sourcePaymentId, paymentId)).limit(1);
    const allocated = allocations.reduce((sum, allocation) => sum + allocation.amountCentavos, 0n);
    return { payment, allocations, receiptNumber: receipt?.receiptNumber ?? null, allocated, unapplied: credit?.original ?? 0n };
  }
}
