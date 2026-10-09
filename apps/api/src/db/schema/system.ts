import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { userSessions, users } from './security.js';

export const backupStatus = pgEnum('backup_status', ['STARTED', 'COMPLETED', 'VERIFIED', 'FAILED', 'RESTORED']);

export const applicationMetadata = pgTable('application_metadata', {
  singleton: boolean('singleton').primaryKey().default(true),
  schemaVersion: integer('schema_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check('application_metadata_singleton', sql`${table.singleton} = true`),
  check('application_metadata_version_positive', sql`${table.schemaVersion} > 0`),
]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'restrict' }),
  sessionId: uuid('session_id').references(() => userSessions.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 80 }).notNull(),
  entityId: varchar('entity_id', { length: 100 }),
  reason: varchar('reason', { length: 255 }),
  oldValues: jsonb('old_values').$type<Record<string, unknown>>(),
  newValues: jsonb('new_values').$type<Record<string, unknown>>(),
  requestId: varchar('request_id', { length: 100 }).notNull(),
  ipAddress: varchar('ip_address', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('audit_logs_actor_date_idx').on(table.actorUserId, table.createdAt),
  index('audit_logs_entity_idx').on(table.entityType, table.entityId, table.createdAt),
  index('audit_logs_action_date_idx').on(table.action, table.createdAt),
]);

export const applicationSettings = pgTable('application_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  description: varchar('description', { length: 255 }).notNull(),
  updatedByUserId: uuid('updated_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const backupHistory = pgTable('backup_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: backupStatus('status').notNull().default('STARTED'),
  storagePath: varchar('storage_path', { length: 255 }).notNull(),
  sha256: varchar('sha256', { length: 64 }),
  sizeBytes: bigint('size_bytes', { mode: 'bigint' }),
  initiatedByUserId: uuid('initiated_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  restoredAt: timestamp('restored_at', { withTimezone: true }),
  errorCode: varchar('error_code', { length: 80 }),
}, (table) => [
  uniqueIndex('backup_history_storage_path_uq').on(table.storagePath),
  index('backup_history_status_started_idx').on(table.status, table.startedAt),
]);
