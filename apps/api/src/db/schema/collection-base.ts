import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './security.js';

export const collectors = pgTable('collectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  collectorNumber: varchar('collector_number', { length: 40 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('collectors_number_uq').on(table.collectorNumber),
  uniqueIndex('collectors_user_uq').on(table.userId),
  index('collectors_status_idx').on(table.status),
]);

export const collectionAreas = pgTable('collection_areas', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 40 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  description: varchar('description', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('collection_areas_code_uq').on(table.code),
  index('collection_areas_status_idx').on(table.status),
]);
