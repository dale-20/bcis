import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, pgEnum, pgSequence, pgTable, primaryKey, timestamp, uniqueIndex, uuid, varchar, text } from 'drizzle-orm/pg-core';
import { invoices } from './billing.js';
import { subscribers } from './subscribers.js';
import { users } from './security.js';

export const paymentMethod = pgEnum('payment_method', ['CASH', 'GCASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']);
export const paymentStatus = pgEnum('payment_status', ['PENDING_VERIFICATION', 'POSTED', 'REJECTED', 'REVERSED']);
export const proofStatus = pgEnum('proof_status', ['PENDING', 'VERIFIED', 'REJECTED']);
export const receiptStatus = pgEnum('receipt_status', ['ISSUED', 'VOID']);
export const creditStatus = pgEnum('credit_status', ['AVAILABLE', 'PARTIALLY_USED', 'USED', 'REVERSED']);
export const receiptNumberSequence = pgSequence('receipt_number_seq', { startWith: 1, increment: 1, minValue: 1 });

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  idempotencyKey: varchar('idempotency_key', { length: 100 }).notNull(),
  subscriberId: uuid('subscriber_id').notNull().references(() => subscribers.id, { onDelete: 'restrict' }),
  paymentDate: timestamp('payment_date', { withTimezone: true }).notNull(),
  amountCentavos: bigint('amount_centavos', { mode: 'bigint' }).notNull(),
  method: paymentMethod('method').notNull(),
  status: paymentStatus('status').notNull(),
  referenceNumber: varchar('reference_number', { length: 100 }),
  senderDetails: varchar('sender_details', { length: 255 }),
  notes: text('notes'),
  postedByUserId: uuid('posted_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('payments_subscriber_date_idx').on(table.subscriberId, table.paymentDate),
  index('payments_date_method_idx').on(table.paymentDate, table.method),
  index('payments_reference_idx').on(table.referenceNumber),
  uniqueIndex('payments_idempotency_key_uq').on(table.idempotencyKey),
  uniqueIndex('payments_gcash_reference_uq').on(sql`lower(${table.referenceNumber})`).where(sql`${table.method} = 'GCASH' AND ${table.referenceNumber} IS NOT NULL`),
  check('payments_amount_positive', sql`${table.amountCentavos} > 0`),
  check('payments_gcash_reference_required', sql`${table.method} <> 'GCASH' OR ${table.referenceNumber} IS NOT NULL`),
]);

export const paymentAllocations = pgTable('payment_allocations', {
  paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'restrict' }),
  amountCentavos: bigint('amount_centavos', { mode: 'bigint' }).notNull(),
  allocationOrder: integer('allocation_order').notNull(),
  allocatedAt: timestamp('allocated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ name: 'payment_allocations_pk', columns: [table.paymentId, table.invoiceId] }),
  index('payment_allocations_invoice_idx').on(table.invoiceId),
  check('payment_allocations_amount_positive', sql`${table.amountCentavos} > 0`),
  check('payment_allocations_order_positive', sql`${table.allocationOrder} > 0`),
]);

export const paymentProofs = pgTable('payment_proofs', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
  storageKey: varchar('storage_key', { length: 255 }).notNull(),
  originalFilename: varchar('original_filename', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
  sha256: varchar('sha256', { length: 64 }).notNull(),
  status: proofStatus('status').notNull().default('PENDING'),
  verifiedByUserId: uuid('verified_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  rejectionReason: varchar('rejection_reason', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('payment_proofs_storage_key_uq').on(table.storageKey),
  index('payment_proofs_payment_status_idx').on(table.paymentId, table.status),
  check('payment_proofs_size_positive', sql`${table.sizeBytes} > 0`),
]);

export const paymentReversals = pgTable('payment_reversals', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
  reason: varchar('reason', { length: 255 }).notNull(),
  reversedByUserId: uuid('reversed_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reversedAt: timestamp('reversed_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('payment_reversals_payment_uq').on(table.paymentId)]);

export const receipts = pgTable('receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  receiptNumber: varchar('receipt_number', { length: 50 }).notNull(),
  paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
  status: receiptStatus('status').notNull().default('ISSUED'),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  issuedByUserId: uuid('issued_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidedByUserId: uuid('voided_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  voidReason: varchar('void_reason', { length: 255 }),
}, (table) => [
  uniqueIndex('receipts_number_uq').on(table.receiptNumber),
  uniqueIndex('receipts_payment_uq').on(table.paymentId),
]);

export const subscriberCredits = pgTable('subscriber_credits', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriberId: uuid('subscriber_id').notNull().references(() => subscribers.id, { onDelete: 'restrict' }),
  sourcePaymentId: uuid('source_payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
  originalAmountCentavos: bigint('original_amount_centavos', { mode: 'bigint' }).notNull(),
  remainingAmountCentavos: bigint('remaining_amount_centavos', { mode: 'bigint' }).notNull(),
  status: creditStatus('status').notNull().default('AVAILABLE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('subscriber_credits_source_payment_uq').on(table.sourcePaymentId),
  index('subscriber_credits_subscriber_status_idx').on(table.subscriberId, table.status),
  check('subscriber_credits_amounts_valid', sql`${table.originalAmountCentavos} > 0 AND ${table.remainingAmountCentavos} >= 0 AND ${table.remainingAmountCentavos} <= ${table.originalAmountCentavos}`),
]);

export const creditApplications = pgTable('credit_applications', {
  creditId: uuid('credit_id').notNull().references(() => subscriberCredits.id, { onDelete: 'restrict' }),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'restrict' }),
  amountCentavos: bigint('amount_centavos', { mode: 'bigint' }).notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ name: 'credit_applications_pk', columns: [table.creditId, table.invoiceId] }),
  index('credit_applications_invoice_idx').on(table.invoiceId),
  check('credit_applications_amount_positive', sql`${table.amountCentavos} > 0`),
]);
