import type { FastifyPluginAsync } from 'fastify';
import {
  createSuspensionInputSchema, receivableAccountQuerySchema, receivableAccountResponseSchema,
  reconnectionAssignmentSchema, reconnectionListResponseSchema, serviceControlPolicySchema, serviceTechnicianListSchema,
} from '@bcis/shared';
import type { AuthService } from '../auth/service.js';
import { authenticateWith, requirePermission } from '../auth/guards.js';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import { ServiceControlService } from './service.js';

interface Options { database: Database; authService: AuthService }
const errorResponse = { type: 'object', required: ['error', 'message', 'requestId'], additionalProperties: false, properties: { error: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' } } } as const;
const objectResponse = { type: 'object', additionalProperties: true } as const;
const techniciansResponse = { type: 'array', items: { type: 'object', required: ['id', 'displayName'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' }, displayName: { type: 'string' } } } } as const;
const paginationSchema = { type: 'object', required: ['page', 'pageSize'], additionalProperties: false, properties: { page: { type: 'string', pattern: '^[1-9]\\d*$' }, pageSize: { type: 'string', pattern: '^[1-9]\\d*$' } } } as const;
const identifierParams = { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' } } } as const;

export const serviceControlPlugin: FastifyPluginAsync<Options> = async (app, options) => {
  const service = new ServiceControlService(options.database);
  const authenticate = authenticateWith(options.authService);
  app.get('/receivables/accounts', {
    preHandler: [authenticate, requirePermission(options.authService, 'receivables.view')],
    schema: { querystring: { type: 'object', required: ['asOf'], additionalProperties: false, properties: {
      asOf: { type: 'string', format: 'date' }, overdueOnly: { type: 'string', enum: ['true', 'false'] }, suspensionCandidates: { type: 'string', enum: ['true', 'false'] },
      collectorId: { type: 'string', format: 'uuid' }, collectionAreaId: { type: 'string', format: 'uuid' }, planId: { type: 'string', format: 'uuid' }, serviceTypeId: { type: 'string', format: 'uuid' },
      bucket: { type: 'string', enum: ['CURRENT', '1_30', '31_60', '61_90', '90_PLUS'] }, query: { type: 'string', maxLength: 100 }, page: { type: 'string', pattern: '^[1-9]\\d*$' }, pageSize: { type: 'string', pattern: '^[1-9]\\d*$' },
    } }, response: { 200: objectResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse } },
  }, async (request) => {
    const raw = request.query as Record<string, string | undefined>;
    const result = receivableAccountQuerySchema.parse({
      asOf: raw.asOf, overdueOnly: raw.overdueOnly === 'true', suspensionCandidates: raw.suspensionCandidates === 'true',
      page: raw.page ? Number(raw.page) : 1, pageSize: raw.pageSize ? Number(raw.pageSize) : 25,
      ...(raw.query ? { query: raw.query } : {}), ...(raw.collectorId ? { collectorId: raw.collectorId } : {}),
      ...(raw.collectionAreaId ? { collectionAreaId: raw.collectionAreaId } : {}), ...(raw.planId ? { planId: raw.planId } : {}),
      ...(raw.serviceTypeId ? { serviceTypeId: raw.serviceTypeId } : {}), ...(raw.bucket ? { bucket: raw.bucket } : {}),
    });
    return receivableAccountResponseSchema.parse(await service.receivableAccounts(result));
  });

  app.get('/service-control/policy', { preHandler: [authenticate, requirePermission(options.authService, 'settings.manage')], schema: { response: { 200: objectResponse, 401: errorResponse, 403: errorResponse } } },
    async () => serviceControlPolicySchema.parse(await service.policy()));
  app.put('/service-control/policy', { preHandler: [authenticate, requirePermission(options.authService, 'settings.manage')], schema: { body: { type: 'object' }, response: { 200: objectResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse } } }, async (request) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    return serviceControlPolicySchema.parse(await service.savePolicy(serviceControlPolicySchema.parse(request.body), context.userId, request.id));
  });

  app.post('/service-control/suspensions', { preHandler: [authenticate, requirePermission(options.authService, 'service.suspension.manage')], schema: { body: { type: 'object' }, response: { 201: objectResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } } }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    const record = await service.createSuspension(createSuspensionInputSchema.parse(request.body), context.userId, request.id);
    return reply.code(201).send({ id: record });
  });
  app.get('/service-control/suspensions', { preHandler: [authenticate, requirePermission(options.authService, 'service.suspension.manage')], schema: { querystring: paginationSchema, response: { 200: objectResponse, 401: errorResponse, 403: errorResponse } } }, async (request) => {
    const raw = request.query as { page?: string; pageSize?: string };
    return service.suspensions(Number(raw.page ?? 1), Math.min(Number(raw.pageSize ?? 25), 100));
  });
  app.post('/service-control/suspensions/:id/approve', { preHandler: [authenticate, requirePermission(options.authService, 'service.suspension.manage')], schema: { params: identifierParams, response: { 204: { type: 'null' }, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } } }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    await service.approveSuspension((request.params as { id: string }).id, context.userId, request.id);
    return reply.code(204).send();
  });

  app.get('/service-control/reconnections', { preHandler: [authenticate, requirePermission(options.authService, 'service.reconnection.assign')], schema: { querystring: paginationSchema, response: { 200: objectResponse, 401: errorResponse, 403: errorResponse } } }, async (request) => {
    const raw = request.query as { page?: string; pageSize?: string };
    const result = await service.allReconnections(Number(raw.page ?? 1), Math.min(Number(raw.pageSize ?? 25), 100));
    return reconnectionListResponseSchema.parse(result);
  });
  app.get('/service-control/technicians', { preHandler: [authenticate, requirePermission(options.authService, 'service.reconnection.assign')], schema: { response: { 200: techniciansResponse, 401: errorResponse, 403: errorResponse } } },
    async () => serviceTechnicianListSchema.parse(await service.technicians()));
  app.get('/service-control/my-reconnections', { preHandler: [authenticate, requirePermission(options.authService, 'service.reconnection.complete')], schema: { querystring: paginationSchema, response: { 200: objectResponse, 401: errorResponse, 403: errorResponse } } }, async (request) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    const raw = request.query as { page?: string; pageSize?: string };
    return reconnectionListResponseSchema.parse(await service.reconnections(context.userId, Number(raw.page ?? 1), Math.min(Number(raw.pageSize ?? 25), 100)));
  });
  app.patch('/service-control/reconnections/:id/assignment', { preHandler: [authenticate, requirePermission(options.authService, 'service.reconnection.assign')], schema: { params: identifierParams, body: { type: 'object' }, response: { 204: { type: 'null' }, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } } }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    await service.assignReconnection((request.params as { id: string }).id, reconnectionAssignmentSchema.parse(request.body), context.userId, request.id);
    return reply.code(204).send();
  });
  app.post('/service-control/reconnections/:id/complete', { preHandler: [authenticate, requirePermission(options.authService, 'service.reconnection.complete')], schema: { params: identifierParams, response: { 204: { type: 'null' }, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } } }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    await service.completeReconnection((request.params as { id: string }).id, context.userId, request.id);
    return reply.code(204).send();
  });
};
