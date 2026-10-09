import { sql } from 'drizzle-orm';
import { bigint, check, date, index, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { collectionAreas, collectors } from './collection-base.js';
import { payments } from './payments.js';
import { serviceAccounts } from './services.js';
import { subscribers } from './subscribers.js';
import { users } from './security.js';

export const collectionBatchStatus = pgEnum('collection_batch_status', ['OPEN', 'IN_PROGRESS', 'SUBMITTED', 'REMITTED', 'RECONCILED', 'CLOSED']);

export const collectorAssignments = pgTable('collector_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  collectorId: uuid('collector_id').notNull().references(() => collectors.id, { onDelete: 'restrict' }),
  serviceAccountId: uuid('service_account_id').notNull().references(() => serviceAccounts.id, { onDelete: 'restrict' }),
  effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
  effectiveTo: date('effective_to', { mode: 'string' }),
  assignedByUserId: uuid('assigned_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('collector_assignments_start_uq').on(table.serviceAccountId, table.effectiveFrom),
  index('collector_assignments_collector_dates_idx').on(table.collectorId, table.effectiveFrom, table.effectiveTo),
  check('collector_assignments_date_order', sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} >= ${table.effectiveFrom}`),
]);

export const collectionBatches = pgTable('collection_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchNumber: varchar('batch_number', { length: 50 }).notNull(),
  collectorId: uuid('collector_id').notNull().references(() => collectors.id, { onDelete: 'restrict' }),
  collectionAreaId: uuid('collection_area_id').notNull().references(() => collectionAreas.id, { onDelete: 'restrict' }),
  collectionDate: date('collection_date', { mode: 'string' }).notNull(),
  status: collectionBatchStatus('status').notNull().default('OPEN'),
  expectedReceivableCentavos: bigint('expected_receivable_centavos', { mode: 'bigint' }).notNull().default(sql`0`),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
  reconciledByUserId: uuid('reconciled_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedByUserId: uuid('closed_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('collection_batches_number_uq').on(table.batchNumber),
  index('collection_batches_collector_date_idx').on(table.collectorId, table.collectionDate),
  index('collection_batches_area_status_idx').on(table.collectionAreaId, table.status),
  check('collection_batches_expected_nonnegative', sql`${table.expectedReceivableCentavos} >= 0`),
]);

export const collectionBatchAccounts = pgTable('collection_batch_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').notNull().references(() => collectionBatches.id, { onDelete: 'restrict' }),
  subscriberId: uuid('subscriber_id').notNull().references(() => subscribers.id, { onDelete: 'restrict' }),
  serviceAccountId: uuid('service_account_id').notNull().references(() => serviceAccounts.id, { onDelete: 'restrict' }),
  amountDueCentavos: bigint('amount_due_centavos', { mode: 'bigint' }).notNull(),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'restrict' }),
  outcome: varchar('outcome', { length: 40 }),
  notes: varchar('notes', { length: 255 }),
}, (table) => [
  uniqueIndex('collection_batch_accounts_service_uq').on(table.batchId, table.serviceAccountId),
  uniqueIndex('collection_batch_accounts_payment_uq').on(table.paymentId),
  index('collection_batch_accounts_subscriber_idx').on(table.subscriberId),
  check('collection_batch_accounts_due_nonnegative', sql`${table.amountDueCentavos} >= 0`),
]);

export const collectorRemittances = pgTable('collector_remittances', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').notNull().references(() => collectionBatches.id, { onDelete: 'restrict' }),
  expectedCashCentavos: bigint('expected_cash_centavos', { mode: 'bigint' }).notNull(),
  remittedCashCentavos: bigint('remitted_cash_centavos', { mode: 'bigint' }).notNull(),
  differenceCentavos: bigint('difference_centavos', { mode: 'bigint' }).notNull(),
  nonCashCentavos: bigint('non_cash_centavos', { mode: 'bigint' }).notNull().default(sql`0`),
  remittedAt: timestamp('remitted_at', { withTimezone: true }).notNull().defaultNow(),
  receivedByUserId: uuid('received_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  notes: varchar('notes', { length: 255 }),
}, (table) => [
  uniqueIndex('collector_remittances_batch_uq').on(table.batchId),
  check('collector_remittances_amounts_nonnegative', sql`${table.expectedCashCentavos} >= 0 AND ${table.remittedCashCentavos} >= 0 AND ${table.nonCashCentavos} >= 0`),
  check('collector_remittances_difference_exact', sql`${table.differenceCentavos} = ${table.remittedCashCentavos} - ${table.expectedCashCentavos}`),
]);
