import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, timestamp } from 'drizzle-orm/pg-core';

// A migration-owned singleton proves that readiness includes schema availability.
// Financial tables are introduced alongside their domain services in later milestones.
export const applicationMetadata = pgTable('application_metadata', {
  singleton: boolean('singleton').primaryKey().default(true),
  schemaVersion: integer('schema_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('application_metadata_singleton', sql`${table.singleton} = true`),
  check('application_metadata_version_positive', sql`${table.schemaVersion} > 0`),
]);
