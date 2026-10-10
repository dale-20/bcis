import type { FastifyPluginAsync } from 'fastify';
import {
  closeBatchInputSchema, collectionBatchSchema, collectionReferencesSchema, createCollectionBatchInputSchema,
  recordCollectionInputSchema, reconciliationInputSchema, remittanceInputSchema,
} from '@bcis/shared';
import type { AuthService } from '../auth/service.js';
import { authenticateWith, requirePermission } from '../auth/guards.js';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import { CollectionService } from './service.js';

interface CollectionPluginOptions { database: Database; authService: AuthService }
const errorResponse = { type: 'object', required: ['error', 'message', 'requestId'], additionalProperties: false, properties: { error: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' } } } as const;
const uuidParams = { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' } } } as const;
const permissiveResponse = { type: 'object', additionalProperties: true } as const;

export const collectionPlugin: FastifyPluginAsync<CollectionPluginOptions> = async (app, options) => {
  const service = new CollectionService(options.database);
  const authenticate = authenticateWith(options.authService);
  const actor = (request: { authContext: { userId: string } | null }) => {
    if (!request.authContext) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    return request.authContext.userId;
  };

  app.get('/collections/reference-data', { preHandler: [authenticate, requirePermission(options.authService, 'collection.view')], schema: { response: { 200: permissiveResponse, 401: errorResponse, 403: errorResponse } } }, async () => collectionReferencesSchema.parse(await service.references()));
  app.post('/collection-batches', {
    preHandler: [authenticate, requirePermission(options.authService, 'collection.manage')],
    schema: { body: { type: 'object', required: ['collectorId', 'collectionAreaId', 'collectionDate'], additionalProperties: false, properties: { collectorId: { type: 'string', format: 'uuid' }, collectionAreaId: { type: 'string', format: 'uuid' }, collectionDate: { type: 'string', format: 'date' } } }, response: { 201: permissiveResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } },
  }, async (request, reply) => { const result = collectionBatchSchema.parse(await service.create(createCollectionBatchInputSchema.parse(request.body), actor(request), request.id)); reply.code(201); return result; });
  app.get('/collection-batches/:id', { preHandler: [authenticate, requirePermission(options.authService, 'collection.view')], schema: { params: uuidParams, response: { 200: permissiveResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } } }, async (request) => collectionBatchSchema.parse(await service.detail((request.params as { id: string }).id)));
  app.post('/collection-batches/:id/collections', {
    preHandler: [authenticate, requirePermission(options.authService, 'collection.manage')],
    schema: { params: uuidParams, body: { type: 'object', required: ['batchAccountId', 'paymentId'], additionalProperties: false, properties: { batchAccountId: { type: 'string', format: 'uuid' }, paymentId: { type: 'string', format: 'uuid' }, notes: { type: 'string', minLength: 1, maxLength: 255 } } }, response: { 200: permissiveResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } },
  }, async (request) => collectionBatchSchema.parse(await service.record((request.params as { id: string }).id, recordCollectionInputSchema.parse(request.body), actor(request), request.id)));
  app.post('/collection-batches/:id/submit', { preHandler: [authenticate, requirePermission(options.authService, 'collection.manage')], schema: { params: uuidParams, response: { 200: permissiveResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } } }, async (request) => collectionBatchSchema.parse(await service.submit((request.params as { id: string }).id, actor(request), request.id)));
  app.post('/collection-batches/:id/remittance', {
    preHandler: [authenticate, requirePermission(options.authService, 'collection.reconcile')],
    schema: { params: uuidParams, body: { type: 'object', required: ['remittedCashCentavos'], additionalProperties: false, properties: { remittedCashCentavos: { type: 'string', pattern: '^(0|[1-9]\\d*)$' }, notes: { type: 'string', minLength: 1, maxLength: 255 } } }, response: { 200: permissiveResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } },
  }, async (request) => collectionBatchSchema.parse(await service.remit((request.params as { id: string }).id, remittanceInputSchema.parse(request.body), actor(request), request.id)));
  app.post('/collection-batches/:id/reconcile', {
    preHandler: [authenticate, requirePermission(options.authService, 'collection.reconcile')],
    schema: { params: uuidParams, body: { type: 'object', required: ['notes'], additionalProperties: false, properties: { notes: { type: 'string', minLength: 3, maxLength: 255 } } }, response: { 200: permissiveResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } },
  }, async (request) => { const input = reconciliationInputSchema.parse(request.body); return collectionBatchSchema.parse(await service.reconcile((request.params as { id: string }).id, input.notes, actor(request), request.id)); });
  app.post('/collection-batches/:id/close', {
    preHandler: [authenticate, requirePermission(options.authService, 'collection.close')],
    schema: { params: uuidParams, body: { type: 'object', additionalProperties: false, properties: { notes: { type: 'string', minLength: 3, maxLength: 255 } } }, response: { 200: permissiveResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } },
  }, async (request) => { const input = closeBatchInputSchema.parse(request.body); return collectionBatchSchema.parse(await service.close((request.params as { id: string }).id, input.notes, actor(request), request.id)); });
};
