import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar, smallint } from 'drizzle-orm/pg-core';
import { collectionAreas, collectors } from './collection-base.js';
import { subscriberAddresses, subscribers } from './subscribers.js';
import { users } from './security.js';

export const serviceCategory = pgEnum('service_category', ['INTERNET', 'CABLE', 'COMBO']);
export const serviceAccountStatus = pgEnum('service_account_status', ['PENDING', 'ACTIVE', 'SUSPENDED', 'DISCONNECTED', 'TERMINATED']);

export const serviceTypes = pgTable('service_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 40 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  category: serviceCategory('category').notNull(),
  isActive: boolean('is_active').notNull().default(true),
}, (table) => [uniqueIndex('service_types_code_uq').on(table.code)]);

export const servicePlans = pgTable('service_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceTypeId: uuid('service_type_id').notNull().references(() => serviceTypes.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 40 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  priceCentavos: bigint('price_centavos', { mode: 'bigint' }).notNull(),
  installationFeeCentavos: bigint('installation_fee_centavos', { mode: 'bigint' }).notNull().default(sql`0`),
  reconnectionFeeCentavos: bigint('reconnection_fee_centavos', { mode: 'bigint' }).notNull().default(sql`0`),
  speedMbps: integer('speed_mbps'),
  channelCount: integer('channel_count'),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('service_plans_code_uq').on(table.code),
  index('service_plans_type_active_idx').on(table.serviceTypeId, table.isActive),
  check('service_plans_amounts_nonnegative', sql`${table.priceCentavos} >= 0 AND ${table.installationFeeCentavos} >= 0 AND ${table.reconnectionFeeCentavos} >= 0`),
  check('service_plans_speed_positive', sql`${table.speedMbps} IS NULL OR ${table.speedMbps} > 0`),
  check('service_plans_channels_positive', sql`${table.channelCount} IS NULL OR ${table.channelCount} > 0`),
]);

export const serviceAccounts = pgTable('service_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceAccountNumber: varchar('service_account_number', { length: 40 }).notNull(),
  subscriberId: uuid('subscriber_id').notNull().references(() => subscribers.id, { onDelete: 'restrict' }),
  planId: uuid('plan_id').notNull().references(() => servicePlans.id, { onDelete: 'restrict' }),
  installationAddressId: uuid('installation_address_id').notNull().references(() => subscriberAddresses.id, { onDelete: 'restrict' }),
  collectionAreaId: uuid('collection_area_id').references(() => collectionAreas.id, { onDelete: 'set null' }),
  assignedCollectorId: uuid('assigned_collector_id').references(() => collectors.id, { onDelete: 'set null' }),
  activationDate: date('activation_date', { mode: 'string' }),
  billingStartDate: date('billing_start_date', { mode: 'string' }).notNull(),
  billingDay: smallint('billing_day').notNull(),
  dueDay: smallint('due_day').notNull(),
  currentRateCentavos: bigint('current_rate_centavos', { mode: 'bigint' }).notNull(),
  status: serviceAccountStatus('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('service_accounts_number_uq').on(table.serviceAccountNumber),
  index('service_accounts_subscriber_idx').on(table.subscriberId),
  index('service_accounts_status_area_idx').on(table.status, table.collectionAreaId),
  index('service_accounts_collector_idx').on(table.assignedCollectorId),
  check('service_accounts_rate_nonnegative', sql`${table.currentRateCentavos} >= 0`),
  check('service_accounts_billing_day_range', sql`${table.billingDay} BETWEEN 1 AND 28`),
  check('service_accounts_due_day_range', sql`${table.dueDay} BETWEEN 1 AND 31`),
]);

export const serviceEvents = pgTable('service_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceAccountId: uuid('service_account_id').notNull().references(() => serviceAccounts.id, { onDelete: 'restrict' }),
  eventType: varchar('event_type', { length: 60 }).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  reason: varchar('reason', { length: 255 }),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [index('service_events_account_date_idx').on(table.serviceAccountId, table.occurredAt)]);
