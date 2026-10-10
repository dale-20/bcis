import type { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import type { AuthService } from '../auth/service.js';
import { authenticateWith, requirePermission } from '../auth/guards.js';
import type { Database } from '../db/client.js';
import { auditLogs, backupHistory, users } from '../db/schema.js';
import { applicationSettings } from '../db/schema.js';
import { defaultOrganizationSettings, organizationSettingsSchema } from '@bcis/shared';
import { AppError } from '../errors.js';
import type { BackupService } from './backup-service.js';

interface Options { database: Database; authService: AuthService; backupService?: BackupService }
const response = { type: 'object', additionalProperties: true } as const;
const error = { type: 'object', additionalProperties: true } as const;

export const systemPlugin: FastifyPluginAsync<Options> = async (app, options) => {
  app.get('/system/settings', {
    preHandler: [authenticateWith(options.authService), requirePermission(options.authService, 'settings.manage')],
    schema: { response: { 200: response, 401: error, 403: error } },
  }, async () => {
    const [row] = await options.database.db.select({ value: applicationSettings.value }).from(applicationSettings).where(eq(applicationSettings.key, 'organization_settings')).limit(1);
    const parsed = row ? organizationSettingsSchema.safeParse(row.value) : null;
    return parsed?.success ? parsed.data : defaultOrganizationSettings;
  });

  app.put('/system/settings', {
    preHandler: [authenticateWith(options.authService), requirePermission(options.authService, 'settings.manage')],
    schema: { body: { type: 'object', required: ['companyName', 'companyAddress', 'contactNumber', 'reportFooter', 'defaultBillingDay', 'defaultDueDay'], additionalProperties: false,
      properties: { companyName: { type: 'string', minLength: 1, maxLength: 120 }, companyAddress: { type: 'string', maxLength: 240 }, contactNumber: { type: 'string', maxLength: 40 }, reportFooter: { type: 'string', maxLength: 240 }, defaultBillingDay: { type: 'integer', minimum: 1, maximum: 28 }, defaultDueDay: { type: 'integer', minimum: 1, maximum: 31 } } }, response: { 200: response, 400: error, 401: error, 403: error } },
  }, async (request) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    const input = organizationSettingsSchema.parse(request.body);
    const now = new Date();
    await options.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('bcis:organization-settings', 0))`);
      const [previous] = await transaction.select({ value: applicationSettings.value }).from(applicationSettings).where(eq(applicationSettings.key, 'organization_settings')).limit(1).for('update');
      const oldValues = previous ? organizationSettingsSchema.safeParse(previous.value) : null;
      await transaction.insert(applicationSettings).values({ key: 'organization_settings', value: input,
        description: 'Company details and default service billing schedule', updatedByUserId: context.userId, updatedAt: now })
        .onConflictDoUpdate({ target: applicationSettings.key, set: { value: input, updatedByUserId: context.userId, updatedAt: now } });
      await transaction.insert(auditLogs).values({ actorUserId: context.userId, sessionId: context.sessionId,
        action: 'organization.settings_updated', entityType: 'application_setting', entityId: 'organization_settings',
        oldValues: oldValues?.success ? oldValues.data : defaultOrganizationSettings, newValues: input,
        requestId: request.id, ipAddress: request.ip, createdAt: now });
    });
    return input;
  });

  app.get('/system/audit', {
    preHandler: [authenticateWith(options.authService), requirePermission(options.authService, 'audit.view')],
    schema: { querystring: { type: 'object', additionalProperties: false, properties: {
      actor: { type: 'string', maxLength: 64 }, action: { type: 'string', maxLength: 100 }, entity: { type: 'string', maxLength: 80 },
      requestId: { type: 'string', maxLength: 100 }, from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' },
      page: { type: 'integer', minimum: 1, default: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
    } }, response: { 200: response, 401: error, 403: error } },
  }, async (request) => {
    const query = request.query as { actor?: string; action?: string; entity?: string; requestId?: string; from?: string; to?: string; page?: number; pageSize?: number };
    const conditions = [];
    if (query.actor) {
      const actorFilter = or(ilike(users.username, `%${query.actor}%`), ilike(users.displayName, `%${query.actor}%`));
      if (actorFilter) conditions.push(actorFilter);
    }
    if (query.action) conditions.push(ilike(auditLogs.action, `%${query.action}%`));
    if (query.entity) conditions.push(ilike(auditLogs.entityType, `%${query.entity}%`));
    if (query.requestId) conditions.push(eq(auditLogs.requestId, query.requestId));
    if (query.from) conditions.push(gte(auditLogs.createdAt, new Date(`${query.from}T00:00:00.000Z`)));
    if (query.to) conditions.push(lte(auditLogs.createdAt, new Date(`${query.to}T23:59:59.999Z`)));
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = conditions.length ? and(...conditions) : undefined;
    const [items, countRows] = await Promise.all([
      options.database.db.select({ id: auditLogs.id, actorId: auditLogs.actorUserId, actor: users.username, action: auditLogs.action,
        entityType: auditLogs.entityType, entityId: auditLogs.entityId, reason: auditLogs.reason, oldValues: auditLogs.oldValues,
        newValues: auditLogs.newValues, requestId: auditLogs.requestId, createdAt: auditLogs.createdAt })
        .from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorUserId)).where(where)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(pageSize).offset((page - 1) * pageSize),
      options.database.db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorUserId)).where(where),
    ]);
    return { items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })), page, pageSize, total: countRows[0]?.total ?? 0 };
  });

  app.get('/system/backups', {
    preHandler: [authenticateWith(options.authService), requirePermission(options.authService, 'backup.create')],
    schema: { response: { 200: response, 401: error, 403: error } },
  }, async () => {
    const rows = await options.database.db.select().from(backupHistory).orderBy(desc(backupHistory.startedAt)).limit(50);
    return { items: rows.map((row) => ({
      id: row.id, status: row.status, sha256: row.sha256,
      sizeBytes: row.sizeBytes?.toString() ?? null, startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null, verifiedAt: row.verifiedAt?.toISOString() ?? null,
      restoredAt: row.restoredAt?.toISOString() ?? null, errorCode: row.errorCode,
    })) };
  });

  const backupService = options.backupService;
  if (backupService) {
    app.post('/system/backups', {
      preHandler: [authenticateWith(options.authService), requirePermission(options.authService, 'backup.create')],
      schema: { response: { 201: response, 401: error, 403: error, 500: error } },
    }, async (request, reply) => {
      const context = request.authContext;
      if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
      const backup = await backupService.create(context, request.id, request.ip);
      return reply.code(201).send(backup);
    });

    app.get('/system/backups/:id/download', {
      preHandler: [authenticateWith(options.authService), requirePermission(options.authService, 'backup.create')],
      schema: { params: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' } } }, response: { 200: { type: 'string', contentMediaType: 'application/gzip' }, 401: error, 403: error, 404: error, 409: error } },
    }, async (request, reply) => {
      const { id } = request.params as { id: string };
      const artifact = await backupService.readVerified(id);
      return reply.type('application/gzip').header('Content-Disposition', `attachment; filename="${artifact.filename}"`).send(artifact.bytes);
    });
  }
};
