import { sql } from 'drizzle-orm';
import { boolean, check, index, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar, text, smallint } from 'drizzle-orm/pg-core';

export const subscriberStatus = pgEnum('subscriber_status', ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED', 'ARCHIVED']);
export const contactType = pgEnum('contact_type', ['MOBILE', 'PHONE', 'EMAIL', 'OTHER']);
export const addressType = pgEnum('address_type', ['BILLING', 'SERVICE', 'MAILING', 'OTHER']);

export const subscribers = pgTable('subscribers', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountNumber: varchar('account_number', { length: 40 }).notNull(),
  firstName: varchar('first_name', { length: 80 }).notNull(),
  middleName: varchar('middle_name', { length: 80 }),
  lastName: varchar('last_name', { length: 80 }).notNull(),
  organizationName: varchar('organization_name', { length: 160 }),
  billingDay: smallint('billing_day').notNull(),
  dueDay: smallint('due_day').notNull(),
  status: subscriberStatus('status').notNull().default('ACTIVE'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('subscribers_account_number_uq').on(table.accountNumber),
  index('subscribers_name_idx').on(table.lastName, table.firstName),
  index('subscribers_status_idx').on(table.status),
  check('subscribers_billing_day_range', sql`${table.billingDay} BETWEEN 1 AND 28`),
  check('subscribers_due_day_range', sql`${table.dueDay} BETWEEN 1 AND 31`),
]);

export const subscriberContacts = pgTable('subscriber_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriberId: uuid('subscriber_id').notNull().references(() => subscribers.id, { onDelete: 'restrict' }),
  type: contactType('type').notNull(),
  value: varchar('value', { length: 160 }).notNull(),
  normalizedValue: varchar('normalized_value', { length: 160 }).notNull(),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('subscriber_contacts_owner_value_uq').on(table.subscriberId, table.type, table.normalizedValue),
  index('subscriber_contacts_lookup_idx').on(table.normalizedValue),
]);

export const subscriberAddresses = pgTable('subscriber_addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriberId: uuid('subscriber_id').notNull().references(() => subscribers.id, { onDelete: 'restrict' }),
  type: addressType('type').notNull(),
  line1: varchar('line1', { length: 160 }).notNull(),
  line2: varchar('line2', { length: 160 }),
  barangay: varchar('barangay', { length: 100 }).notNull(),
  municipality: varchar('municipality', { length: 100 }).notNull(),
  province: varchar('province', { length: 100 }).notNull(),
  postalCode: varchar('postal_code', { length: 12 }),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('subscriber_addresses_subscriber_idx').on(table.subscriberId),
  index('subscriber_addresses_location_idx').on(table.municipality, table.barangay),
]);
