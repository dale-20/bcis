import { sql } from 'drizzle-orm';
import { bigint, check, date, index, jsonb, pgEnum, pgSequence, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { serviceAccounts } from './services.js';
import { subscribers } from './subscribers.js';
import { users } from './security.js';

export const billingCycleStatus = pgEnum('billing_cycle_status', ['OPEN', 'GENERATING', 'FINALIZED', 'CLOSED']);
export const invoiceStatus = pgEnum('invoice_status', ['DRAFT', 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID', 'CREDITED']);
export const invoiceItemType = pgEnum('invoice_item_type', ['SUBSCRIPTION', 'INSTALLATION', 'RECONNECTION', 'DISCOUNT', 'PENALTY', 'ADJUSTMENT']);
export const adjustmentStatus = pgEnum('adjustment_status', ['PENDING', 'APPROVED', 'POSTED', 'REJECTED', 'REVERSED']);
export const invoiceNumberSequence = pgSequence('invoice_number_seq', { startWith: 1, increment: 1, minValue: 1 });

export const billingCycles = pgTable('billing_cycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  periodStart: date('period_start', { mode: 'string' }).notNull(),
  periodEnd: date('period_end', { mode: 'string' }).notNull(),
  status: billingCycleStatus('status').notNull().default('OPEN'),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  finalizedByUserId: uuid('finalized_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('billing_cycles_period_uq').on(table.periodStart, table.periodEnd),
  check('billing_cycles_date_order', sql`${table.periodStart} <= ${table.periodEnd}`),
  check('billing_cycles_calendar_month', sql`${table.periodStart} = date_trunc('month', ${table.periodStart}::timestamp)::date AND ${table.periodEnd} = (date_trunc('month', ${table.periodStart}::timestamp) + interval '1 month - 1 day')::date`),
]);

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceNumber: varchar('invoice_number', { length: 50 }).notNull(),
  subscriberId: uuid('subscriber_id').notNull().references(() => subscribers.id, { onDelete: 'restrict' }),
  serviceAccountId: uuid('service_account_id').notNull().references(() => serviceAccounts.id, { onDelete: 'restrict' }),
  billingCycleId: uuid('billing_cycle_id').notNull().references(() => billingCycles.id, { onDelete: 'restrict' }),
  invoiceDate: date('invoice_date', { mode: 'string' }).notNull(),
  dueDate: date('due_date', { mode: 'string' }).notNull(),
  status: invoiceStatus('status').notNull().default('DRAFT'),
  totalCentavos: bigint('total_centavos', { mode: 'bigint' }).notNull(),
  balanceCentavos: bigint('balance_centavos', { mode: 'bigint' }).notNull(),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  finalizedByUserId: uuid('finalized_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidedByUserId: uuid('voided_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  voidReason: varchar('void_reason', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('invoices_number_uq').on(table.invoiceNumber),
  uniqueIndex('invoices_service_cycle_uq').on(table.serviceAccountId, table.billingCycleId),
  index('invoices_subscriber_status_idx').on(table.subscriberId, table.status),
  index('invoices_due_status_idx').on(table.dueDate, table.status),
  check('invoices_amounts_valid', sql`${table.totalCentavos} >= 0 AND ${table.balanceCentavos} >= 0 AND ${table.balanceCentavos} <= ${table.totalCentavos}`),
  check('invoices_finalization_consistent', sql`(${table.status} = 'DRAFT' AND ${table.finalizedAt} IS NULL AND ${table.finalizedByUserId} IS NULL) OR (${table.status} <> 'DRAFT' AND ${table.finalizedAt} IS NOT NULL AND ${table.finalizedByUserId} IS NOT NULL)`),
]);

export const invoiceItems = pgTable('invoice_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'restrict' }),
  type: invoiceItemType('type').notNull(),
  description: varchar('description', { length: 255 }).notNull(),
  amountCentavos: bigint('amount_centavos', { mode: 'bigint' }).notNull(),
  sourceType: varchar('source_type', { length: 50 }),
  sourceId: uuid('source_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('invoice_items_invoice_idx').on(table.invoiceId)]);

export const adjustments = pgTable('adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'restrict' }),
  amountCentavos: bigint('amount_centavos', { mode: 'bigint' }).notNull(),
  reason: varchar('reason', { length: 255 }).notNull(),
  status: adjustmentStatus('status').notNull().default('PENDING'),
  requestedByUserId: uuid('requested_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('adjustments_invoice_status_idx').on(table.invoiceId, table.status),
  check('adjustments_nonzero', sql`${table.amountCentavos} <> 0`),
]);

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriberId: uuid('subscriber_id').notNull().references(() => subscribers.id, { onDelete: 'restrict' }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  referenceType: varchar('reference_type', { length: 40 }).notNull(),
  referenceId: uuid('reference_id').notNull(),
  referenceNumber: varchar('reference_number', { length: 50 }).notNull(),
  description: text('description').notNull(),
  debitCentavos: bigint('debit_centavos', { mode: 'bigint' }).notNull().default(sql`0`),
  creditCentavos: bigint('credit_centavos', { mode: 'bigint' }).notNull().default(sql`0`),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [
  uniqueIndex('ledger_entries_reference_uq').on(table.referenceType, table.referenceId),
  index('ledger_entries_subscriber_date_idx').on(table.subscriberId, table.occurredAt),
  check('ledger_entries_one_side', sql`(${table.debitCentavos} > 0 AND ${table.creditCentavos} = 0) OR (${table.creditCentavos} > 0 AND ${table.debitCentavos} = 0)`),
]);
