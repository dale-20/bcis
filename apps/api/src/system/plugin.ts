import type { FastifyPluginAsync } from 'fastify';
import { desc } from 'drizzle-orm';
import type { AuthService } from '../auth/service.js';
import { authenticateWith, requirePermission } from '../auth/guards.js';
import type { Database } from '../db/client.js';
import { backupHistory } from '../db/schema.js';

interface Options { database: Database; authService: AuthService }
const response = { type: 'object', additionalProperties: true } as const;
const error = { type: 'object', additionalProperties: true } as const;

export const systemPlugin: FastifyPluginAsync<Options> = async (app, options) => {
  app.get('/system/backups', {
    preHandler: [authenticateWith(options.authService), requirePermission(options.authService, 'backup.create')],
    schema: { response: { 200: response, 401: error, 403: error } },
  }, async () => {
    const rows = await options.database.db.select().from(backupHistory).orderBy(desc(backupHistory.startedAt)).limit(50);
    return { items: rows.map((row) => ({
      id: row.id, status: row.status, storagePath: row.storagePath, sha256: row.sha256,
      sizeBytes: row.sizeBytes?.toString() ?? null, startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null, verifiedAt: row.verifiedAt?.toISOString() ?? null,
      restoredAt: row.restoredAt?.toISOString() ?? null, errorCode: row.errorCode,
    })) };
  });
};
