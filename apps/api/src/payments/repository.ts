import { and, asc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { GcashProofUploadInput, PaymentListQuery, PaymentPreviewQuery, PostPaymentInput, VerifyGcashInput } from '@bcis/shared';
import { gcashProofMimeTypeSchema } from '@bcis/shared';
import type { Database } from '../db/client.js';
import {
  applicationSettings, auditLogs, invoices, ledgerEntries, paymentAllocations, paymentProofs,
  paymentReversals, payments, receipts, reconnectionRecords, serviceAccounts, serviceEvents, subscribers, subscriberCredits, suspensionRecords,
} from '../db/schema.js';
import { AppError } from '../errors.js';
import { defaultServiceControlPolicy, serviceControlPolicySchema } from '@bcis/shared';
import { createHash } from 'node:crypto';
import { GcashProofStorage } from './proof-storage.js';

type Transaction = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

interface ActorContext { actorUserId: string; requestId: string }
interface PaymentHistoryRow {
  payment_id: string; subscriber_id: string; subscriber_account_number: string; subscriber_name: string;
  payment_date: Date; created_at: Date; method: string; status: string; amount_centavos: string;
  reference_number: string | null; created_by: string; posted_by: string | null; posted_at: Date | null;
  receipt_number: string | null; receipt_status: string | null; receipt_issued_at: Date | null;
  allocated_centavos: string; unapplied_credit_centavos: string;
}

function mapPaymentHistoryRow(row: PaymentHistoryRow) {
  return {
    paymentId: row.payment_id, subscriberId: row.subscriber_id, subscriberAccountNumber: row.subscriber_account_number,
    subscriberName: row.subscriber_name, paymentDate: row.payment_date.toISOString(), createdAt: row.created_at.toISOString(),
    method: row.method, status: row.status, amountCentavos: row.amount_centavos, referenceNumber: row.reference_number,
    createdBy: row.created_by, postedBy: row.posted_by, postedAt: row.posted_at?.toISOString() ?? null,
    receiptNumber: row.receipt_number, receiptStatus: row.receipt_status, receiptIssuedAt: row.receipt_issued_at?.toISOString() ?? null,
    allocatedCentavos: row.allocated_centavos, unappliedCreditCentavos: row.unapplied_credit_centavos,
  };
}

export class PaymentRepository {
  constructor(private readonly database: Database, private readonly proofStorage: GcashProofStorage) {}

  async uploadProof(input: GcashProofUploadInput, actorUserId: string) {
    await this.cleanupStagedProofs();
    const [stagedCount] = await this.database.db.select({ count: sql<number>`count(*)::int` }).from(paymentProofs)
      .where(and(eq(paymentProofs.uploadedByUserId, actorUserId), isNull(paymentProofs.paymentId)));
    if ((stagedCount?.count ?? 0) >= 5) throw new AppError(429, 'PROOF_UPLOAD_LIMIT', 'Submit or wait for staged proof uploads to expire before adding another');
    const saved = await this.proofStorage.save(input);
    try {
      await this.database.db.insert(paymentProofs).values({
        paymentId: null, uploadedByUserId: actorUserId, storageKey: saved.metadata.storageKey,
        originalFilename: saved.metadata.originalFilename, mimeType: saved.metadata.mimeType,
        sizeBytes: BigInt(saved.metadata.sizeBytes), sha256: saved.metadata.sha256, status: 'PENDING',
      });
      return saved.metadata;
    } catch (error) {
      await this.proofStorage.remove(saved.metadata.storageKey, saved.metadata.mimeType);
      throw error;
    }
  }

  private async cleanupStagedProofs(): Promise<void> {
    const expired = await this.database.db.transaction(async (transaction) => {
      const rows = await transaction.select({ id: paymentProofs.id, storageKey: paymentProofs.storageKey, mimeType: paymentProofs.mimeType })
        .from(paymentProofs).where(and(isNull(paymentProofs.paymentId), lt(paymentProofs.createdAt, sql`now() - interval '24 hours'`)))
        .limit(100).for('update', { skipLocked: true });
      if (rows.length > 0) await transaction.delete(paymentProofs).where(inArray(paymentProofs.id, rows.map((row) => row.id)));
      return rows;
    });
    await Promise.all(expired.map((proof) => this.proofStorage.remove(proof.storageKey, gcashProofMimeTypeSchema.parse(proof.mimeType))));
  }

  async pendingGcash(page: number, pageSize: number) {
    const [count, result] = await Promise.all([
      this.database.pool.query<{ total: number }>(`select count(*)::int total from payment_proofs pp join payments p on p.id=pp.payment_id where pp.status='PENDING' and p.status='PENDING_VERIFICATION'`),
      this.database.pool.query<{
        payment_id: string; subscriber_id: string; account_number: string; subscriber_name: string; payment_date: Date; created_at: Date;
        amount_centavos: string; reference_number: string; sender_details: string; notes: string | null;
        original_filename: string; mime_type: string; size_bytes: string; sha256: string;
      }>(
        `select p.id payment_id,p.subscriber_id,s.account_number,trim(concat_ws(' ',s.first_name,s.middle_name,s.last_name)) subscriber_name,
         p.payment_date,p.created_at,p.amount_centavos::text,p.reference_number,p.sender_details,p.notes,pp.original_filename,pp.mime_type,
         pp.size_bytes::text,pp.sha256 from payment_proofs pp join payments p on p.id=pp.payment_id join subscribers s on s.id=p.subscriber_id
         where pp.status='PENDING' and p.status='PENDING_VERIFICATION' order by p.created_at,p.id limit $1 offset $2`,
        [pageSize, (page - 1) * pageSize],
      ),
    ]);
    return {
      rows: result.rows.map((row) => ({
        paymentId: row.payment_id, subscriberId: row.subscriber_id, subscriberAccountNumber: row.account_number,
        subscriberName: row.subscriber_name, paymentDate: row.payment_date.toISOString(), createdAt: row.created_at.toISOString(),
        amountCentavos: row.amount_centavos, referenceNumber: row.reference_number, senderDetails: row.sender_details,
        notes: row.notes, originalFilename: row.original_filename, mimeType: row.mime_type,
        sizeBytes: row.size_bytes, sha256: row.sha256,
      })),
      total: count.rows[0]?.total ?? 0,
    };
  }

  async readProof(paymentId: string) {
    const result = await this.database.pool.query<{ storage_key: string; mime_type: string; sha256: string; size_bytes: string }>(
      `select pp.storage_key,pp.mime_type,pp.sha256,pp.size_bytes::text from payment_proofs pp join payments p on p.id=pp.payment_id
       where p.id=$1 and p.method='GCASH'`, [paymentId],
    );
    const proof = result.rows[0];
    if (!proof) throw new AppError(404, 'PROOF_NOT_FOUND', 'Proof attachment is unavailable');
    const mimeType = gcashProofMimeTypeSchema.parse(proof.mime_type);
    const bytes = await this.proofStorage.read(proof.storage_key, mimeType);
    if (bytes.length.toString() !== proof.size_bytes || createHash('sha256').update(bytes).digest('hex') !== proof.sha256) {
      throw new AppError(500, 'PROOF_INTEGRITY_FAILED', 'Stored proof failed integrity validation');
    }
    return { mimeType, contentBase64: bytes.toString('base64') };
  }

  async preview(input: PaymentPreviewQuery) {
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock_shared(hashtext(${`subscriber:${input.subscriberId}`}))`);
      const subscriberResult = await this.database.pool.query<{ id: string; account_number: string; display_name: string }>(
        `select id,account_number,trim(concat_ws(' ',first_name,middle_name,last_name)) display_name from subscribers where id=$1`,
        [input.subscriberId],
      );
      const subscriber = subscriberResult.rows[0];
      if (!subscriber) throw new AppError(404, 'SUBSCRIBER_NOT_FOUND', 'Subscriber not found');
      const [invoiceResult, creditResult] = await Promise.all([
        this.database.pool.query<{ id: string; invoice_number: string; period: string; due_date: string; balance: string }>(
          `select i.id,i.invoice_number,to_char(bc.period_start,'YYYY-MM') period,i.due_date::text, i.balance_centavos::text balance
           from invoices i join billing_cycles bc on bc.id=i.billing_cycle_id
           where i.subscriber_id=$1 and i.status in ('UNPAID','PARTIALLY_PAID','OVERDUE') and i.balance_centavos>0
           order by i.due_date,i.invoice_date,i.invoice_number,i.id`, [input.subscriberId],
        ),
        this.database.pool.query<{ available: string }>(
          `select coalesce(sum(remaining_amount_centavos),0)::text available from subscriber_credits where subscriber_id=$1 and status in ('AVAILABLE','PARTIALLY_USED')`,
          [input.subscriberId],
        ),
      ]);
      let remaining = BigInt(input.amountCentavos);
      const allocations = invoiceResult.rows.map((invoice) => {
        const balance = BigInt(invoice.balance);
        const amount = remaining < balance ? remaining : balance;
        remaining -= amount;
        return {
          invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, period: invoice.period, dueDate: invoice.due_date,
          balanceBeforeCentavos: invoice.balance, allocationCentavos: amount.toString(), balanceAfterCentavos: (balance - amount).toString(),
        };
      }).filter((invoice) => invoice.allocationCentavos !== '0');
      const allocated = BigInt(input.amountCentavos) - remaining;
      const outstanding = invoiceResult.rows.reduce((total, invoice) => total + BigInt(invoice.balance), 0n);
      return {
        subscriberId: subscriber.id, subscriberAccountNumber: subscriber.account_number, subscriberName: subscriber.display_name,
        amountCentavos: input.amountCentavos, outstandingCentavos: outstanding.toString(),
        existingAvailableCreditCentavos: creditResult.rows[0]?.available ?? '0',
        allocatedCentavos: allocated.toString(), unappliedCreditCentavos: remaining.toString(), allocations,
      };
    });
  }

  async list(query: PaymentListQuery) {
    const values: unknown[] = [];
    const filters: string[] = [];
    const add = (value: unknown): string => { values.push(value); return `$${values.length}`; };
    if (query.query) {
      const term = add(`%${query.query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
      filters.push(`(s.account_number ilike ${term} escape '\\' or concat_ws(' ',s.first_name,s.middle_name,s.last_name) ilike ${term} escape '\\' or p.reference_number ilike ${term} escape '\\' or r.receipt_number ilike ${term} escape '\\')`);
    }
    if (query.method !== 'ALL') filters.push(`p.method=${add(query.method)}::payment_method`);
    if (query.status !== 'ALL') filters.push(`p.status=${add(query.status)}::payment_status`);
    if (query.from) filters.push(`p.payment_date>=(${add(query.from)}::date::timestamp at time zone 'Asia/Manila')`);
    if (query.to) filters.push(`p.payment_date<((${add(query.to)}::date + interval '1 day')::timestamp at time zone 'Asia/Manila')`);
    const orderColumn = {
      date: 'p.payment_date', subscriber: "concat_ws(' ',s.first_name,s.middle_name,s.last_name)",
      receipt: 'r.receipt_number', status: 'p.status', amount: 'p.amount_centavos',
    }[query.sort];
    const direction = query.direction;
    const where = filters.length ? `where ${filters.join(' and ')}` : '';
    const countValues = [...values];
    const limit = add(query.pageSize);
    const offset = add((query.page - 1) * query.pageSize);
    const from = `from payments p join subscribers s on s.id=p.subscriber_id join users creator on creator.id=p.created_by_user_id
      left join users poster on poster.id=p.posted_by_user_id left join receipts r on r.payment_id=p.id
      left join lateral (select sum(amount_centavos) allocated from payment_allocations where payment_id=p.id) a on true
      left join lateral (select sum(remaining_amount_centavos) remaining from subscriber_credits where source_payment_id=p.id) c on true`;
    const [countResult, rows] = await Promise.all([
      this.database.pool.query<{ total: number }>(`select count(*)::int total ${from} ${where}`, countValues),
      this.database.pool.query<PaymentHistoryRow>(
        `select p.id payment_id,p.subscriber_id,s.account_number subscriber_account_number,trim(concat_ws(' ',s.first_name,s.middle_name,s.last_name)) subscriber_name,
         p.payment_date,p.created_at,p.method::text,p.status::text,p.amount_centavos::text,p.reference_number,creator.display_name created_by,
         poster.display_name posted_by,p.posted_at,r.receipt_number,r.status::text receipt_status,r.issued_at receipt_issued_at,
         coalesce(a.allocated,0)::text allocated_centavos,coalesce(c.remaining,0)::text unapplied_credit_centavos ${from} ${where}
         order by ${orderColumn} ${direction} nulls last,p.payment_date ${direction},p.created_at ${direction},p.id ${direction} limit ${limit} offset ${offset}`,
        values,
      ),
    ]);
    return { rows: rows.rows.map(mapPaymentHistoryRow), total: countResult.rows[0]?.total ?? 0 };
  }

  async detail(paymentId: string) {
    const payment = await this.database.pool.query<PaymentHistoryRow & { notes: string | null; sender_details: string | null }>(
      `select p.id payment_id,p.subscriber_id,s.account_number subscriber_account_number,trim(concat_ws(' ',s.first_name,s.middle_name,s.last_name)) subscriber_name,
       p.payment_date,p.created_at,p.method::text,p.status::text,p.amount_centavos::text,p.reference_number,p.notes,p.sender_details,creator.display_name created_by,
       poster.display_name posted_by,p.posted_at,r.receipt_number,r.status::text receipt_status,r.issued_at receipt_issued_at,
       coalesce(a.allocated,0)::text allocated_centavos,coalesce(c.remaining,0)::text unapplied_credit_centavos
       from payments p join subscribers s on s.id=p.subscriber_id join users creator on creator.id=p.created_by_user_id
       left join users poster on poster.id=p.posted_by_user_id left join receipts r on r.payment_id=p.id
       left join lateral (select sum(amount_centavos) allocated from payment_allocations where payment_id=p.id) a on true
       left join lateral (select sum(remaining_amount_centavos) remaining from subscriber_credits where source_payment_id=p.id) c on true
       where p.id=$1`, [paymentId],
    );
    const row = payment.rows[0];
    if (!row) return null;
    const [allocations, reversals] = await Promise.all([
      this.database.pool.query<{ invoice_id: string; invoice_number: string; period: string; due_date: string; amount: string }>(
        `select i.id invoice_id,i.invoice_number,to_char(bc.period_start,'YYYY-MM') period,i.due_date::text,a.amount_centavos::text amount
         from payment_allocations a join invoices i on i.id=a.invoice_id join billing_cycles bc on bc.id=i.billing_cycle_id
         where a.payment_id=$1 order by a.allocation_order`, [paymentId],
      ),
      this.database.pool.query<{ reason: string; reversed_by: string; reversed_at: Date }>(
        `select pr.reason,u.display_name reversed_by,pr.reversed_at from payment_reversals pr join users u on u.id=pr.reversed_by_user_id where pr.payment_id=$1`, [paymentId],
      ),
    ]);
    return {
      ...mapPaymentHistoryRow(row), notes: row.notes, senderDetails: row.sender_details,
      allocations: allocations.rows.map((allocation) => ({ invoiceId: allocation.invoice_id, invoiceNumber: allocation.invoice_number, period: allocation.period, dueDate: allocation.due_date, amountCentavos: allocation.amount })),
      reversal: reversals.rows[0] ? { reason: reversals.rows[0].reason, reversedBy: reversals.rows[0].reversed_by, reversedAt: reversals.rows[0].reversed_at.toISOString() } : null,
    };
  }

  async create(input: PostPaymentInput, context: ActorContext) {
    const result = await this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`payment:${input.idempotencyKey}`}))`);
      const [existing] = await transaction.select({ id: payments.id }).from(payments)
        .where(eq(payments.idempotencyKey, input.idempotencyKey)).limit(1);
      if (existing) return existing.id;

      await this.lockSubscriber(transaction, input.subscriberId);
      const referenceNumber = 'referenceNumber' in input ? input.referenceNumber : undefined;
      const normalizedReference = input.method === 'GCASH' || input.method === 'BANK_TRANSFER' || input.method === 'CHEQUE'
        ? referenceNumber?.trim().toUpperCase() ?? null
        : referenceNumber?.trim() ?? null;
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
        status: input.method === 'GCASH' ? 'PENDING_VERIFICATION' : 'POSTED',
        referenceNumber: normalizedReference,
        senderDetails: input.method === 'GCASH' ? input.senderDetails : null,
        notes: input.notes ?? null,
        createdByUserId: context.actorUserId,
      }).returning({ id: payments.id });
      if (!payment) throw new Error('PAYMENT_INSERT_FAILED');

      if (input.method === 'GCASH') {
        const [stagedProof] = await transaction.select().from(paymentProofs)
          .where(and(eq(paymentProofs.storageKey, input.proof.storageKey), eq(paymentProofs.uploadedByUserId, context.actorUserId)))
          .limit(1).for('update');
        if (!stagedProof || stagedProof.paymentId !== null || stagedProof.status !== 'PENDING'
          || stagedProof.originalFilename !== input.proof.originalFilename || stagedProof.mimeType !== input.proof.mimeType
          || stagedProof.sizeBytes.toString() !== input.proof.sizeBytes || stagedProof.sha256 !== input.proof.sha256.toLowerCase()) {
          throw new AppError(409, 'PROOF_UPLOAD_INVALID', 'Select a valid proof attachment before submitting GCash');
        }
        await transaction.update(paymentProofs).set({ paymentId: payment.id }).where(eq(paymentProofs.id, stagedProof.id));
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
        const isPastDue = invoice.dueDate < new Date().toISOString().slice(0, 10);
        await transaction.update(invoices).set({
          balanceCentavos: restoredBalance,
          status: restoredBalance === 0n ? 'PAID' : restoredBalance >= invoice.totalCentavos ? (isPastDue ? 'OVERDUE' : 'UNPAID') : 'PARTIALLY_PAID',
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
    const now = new Date();
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
    await this.requestReconnectionsForSettledServices(transaction, paymentId, payment.subscriberId, context, now);
    const sequenceResult = await transaction.execute<{ value: string }>(sql`SELECT nextval('receipt_number_seq')::text AS value`);
    const sequenceValue = sequenceResult.rows[0]?.value;
    if (!sequenceValue) throw new Error('RECEIPT_NUMBER_FAILED');
    const receiptNumber = `OR-${payment.paymentDate.getUTCFullYear()}-${sequenceValue.padStart(8, '0')}`;
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

  private async requestReconnectionsForSettledServices(transaction: Transaction, paymentId: string, subscriberId: string, context: ActorContext, now: Date) {
    const [setting] = await transaction.select({ value: applicationSettings.value }).from(applicationSettings)
      .where(eq(applicationSettings.key, 'service_control_policy')).limit(1);
    const parsedPolicy = setting ? serviceControlPolicySchema.safeParse(setting.value) : null;
    const reconnectionFeeCentavos = parsedPolicy?.success ? BigInt(parsedPolicy.data.reconnectionFeeCentavos) : BigInt(defaultServiceControlPolicy.reconnectionFeeCentavos);
    const suspended = await transaction.select({ id: serviceAccounts.id, status: serviceAccounts.status })
      .from(serviceAccounts).where(and(eq(serviceAccounts.subscriberId, subscriberId), eq(serviceAccounts.status, 'SUSPENDED'))).orderBy(asc(serviceAccounts.id)).for('update');
    for (const account of suspended) {
      const [accountAllocation] = await transaction.select({ paymentId: paymentAllocations.paymentId }).from(paymentAllocations)
        .innerJoin(invoices, eq(paymentAllocations.invoiceId, invoices.id))
        .where(and(eq(paymentAllocations.paymentId, paymentId), eq(invoices.serviceAccountId, account.id))).limit(1);
      if (!accountAllocation) continue;
      const [unpaid] = await transaction.select({ id: invoices.id }).from(invoices)
        .where(and(eq(invoices.serviceAccountId, account.id), inArray(invoices.status, ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE']), gt(invoices.balanceCentavos, 0n))).limit(1);
      if (unpaid) continue;
      const [existing] = await transaction.select({ id: reconnectionRecords.id }).from(reconnectionRecords)
        .where(and(eq(reconnectionRecords.serviceAccountId, account.id), inArray(reconnectionRecords.status, ['REQUESTED', 'SCHEDULED']))).limit(1);
      if (existing) continue;
      const [suspension] = await transaction.select({ id: suspensionRecords.id }).from(suspensionRecords)
        .where(and(eq(suspensionRecords.serviceAccountId, account.id), eq(suspensionRecords.status, 'ACTIVE'))).orderBy(asc(suspensionRecords.createdAt)).limit(1).for('update');
      const [record] = await transaction.insert(reconnectionRecords).values({
        serviceAccountId: account.id, suspensionId: suspension?.id ?? null, feeCentavos: reconnectionFeeCentavos,
        status: 'REQUESTED', requestedAt: now, notes: 'Created after all open invoice balances were paid.',
      }).returning({ id: reconnectionRecords.id });
      if (!record) continue;
      await transaction.insert(serviceEvents).values({ serviceAccountId: account.id, eventType: 'RECONNECTION_REQUESTED', actorUserId: context.actorUserId,
        details: { reconnectionId: record.id, trigger: 'ARREARS_SETTLED', feeCentavos: reconnectionFeeCentavos.toString() } });
      await transaction.insert(auditLogs).values({ actorUserId: context.actorUserId, action: 'service.reconnection.auto_requested', entityType: 'reconnection', entityId: record.id,
        reason: 'ARREARS_SETTLED', newValues: { serviceAccountId: account.id, suspensionId: suspension?.id ?? null, feeCentavos: reconnectionFeeCentavos.toString() }, requestId: context.requestId });
    }
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
