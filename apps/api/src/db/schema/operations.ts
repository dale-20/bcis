import { sql } from 'drizzle-orm';
import { bigint, date, index, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { serviceAccounts } from './services.js';
import { users } from './security.js';

export const suspensionStatus = pgEnum('suspension_status', ['PENDING', 'ACTIVE', 'LIFTED', 'CANCELLED']);
export const reconnectionStatus = pgEnum('reconnection_status', ['REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED']);

export const suspensionRecords = pgTable('suspension_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceAccountId: uuid('service_account_id').notNull().references(() => serviceAccounts.id, { onDelete: 'restrict' }),
  status: suspensionStatus('status').notNull().default('PENDING'),
  reason: varchar('reason', { length: 255 }).notNull(),
  effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
  approvedByUserId: uuid('approved_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  notes: text('notes'),
  liftedAt: timestamp('lifted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('suspension_records_account_status_idx').on(table.serviceAccountId, table.status)]);

export const reconnectionRecords = pgTable('reconnection_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceAccountId: uuid('service_account_id').notNull().references(() => serviceAccounts.id, { onDelete: 'restrict' }),
  suspensionId: uuid('suspension_id').references(() => suspensionRecords.id, { onDelete: 'restrict' }),
  status: reconnectionStatus('status').notNull().default('REQUESTED'),
  feeCentavos: bigint('fee_centavos', { mode: 'bigint' }).notNull().default(sql`0`),
  technicianUserId: uuid('technician_user_id').references(() => users.id, { onDelete: 'restrict' }),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  scheduledDate: date('scheduled_date', { mode: 'string' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedByUserId: uuid('completed_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  notes: text('notes'),
}, (table) => [index('reconnection_records_account_status_idx').on(table.serviceAccountId, table.status)]);
