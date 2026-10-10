import type { FastifyPluginAsync } from 'fastify';
import { receivableAgingQuerySchema, receivableAgingResponseSchema } from '@bcis/shared';
import type { AuthService } from '../auth/service.js';
import { authenticateWith, requirePermission } from '../auth/guards.js';
import type { Database } from '../db/client.js';
import { ReceivableService } from './service.js';

interface ReceivablePluginOptions { database: Database; authService: AuthService }
const errorResponse = { type: 'object', required: ['error', 'message', 'requestId'], additionalProperties: false, properties: { error: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' } } } as const;
const response = { type: 'object', additionalProperties: true } as const;

export const receivablePlugin: FastifyPluginAsync<ReceivablePluginOptions> = async (app, options) => {
  const service = new ReceivableService(options.database);
  app.get('/receivables/aging', {
    preHandler: [authenticateWith(options.authService), requirePermission(options.authService, 'receivables.view')],
    schema: {
      querystring: { type: 'object', required: ['asOf'], additionalProperties: false, properties: {
        asOf: { type: 'string', format: 'date' }, overdueOnly: { type: 'string', enum: ['true', 'false'] }, collectorId: { type: 'string', format: 'uuid' },
        collectionAreaId: { type: 'string', format: 'uuid' }, page: { type: 'string', pattern: '^[1-9]\\d*$' }, pageSize: { type: 'string', pattern: '^[1-9]\\d*$' },
      } }, response: { 200: response, 400: errorResponse, 401: errorResponse, 403: errorResponse },
    },
  }, async (request) => {
    const raw = request.query as { asOf: string; overdueOnly?: string; collectorId?: string; collectionAreaId?: string; page?: string; pageSize?: string };
    const query = receivableAgingQuerySchema.parse({
      asOf: raw.asOf, overdueOnly: raw.overdueOnly === 'true', page: raw.page ? Number(raw.page) : 1, pageSize: raw.pageSize ? Number(raw.pageSize) : 25,
      ...(raw.collectorId ? { collectorId: raw.collectorId } : {}), ...(raw.collectionAreaId ? { collectionAreaId: raw.collectionAreaId } : {}),
    });
    return receivableAgingResponseSchema.parse(await service.aging(query));
  });
};
