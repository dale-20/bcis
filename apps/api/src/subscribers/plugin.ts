import type { FastifyPluginAsync } from 'fastify';
import {
  collectionAreaCreateSchema,
  collectorCreateSchema,
  servicePlanCreateSchema,
  subscriberCreateSchema,
  subscriberDetailSchema,
  subscriberListQuerySchema,
  subscriberListResponseSchema,
} from '@bcis/shared';
import type { AuthService } from '../auth/service.js';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import { authenticateWith, requirePermission } from '../auth/guards.js';
import { SubscriberService } from './service.js';

interface SubscriberPluginOptions { database: Database; authService: AuthService }

const errorResponse = {
  type: 'object', required: ['error', 'message', 'requestId'], additionalProperties: false,
  properties: { error: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' } },
} as const;
const subscriberListResponse = {
  type: 'object', required: ['items', 'page', 'pageSize', 'total', 'pageCount'], additionalProperties: false,
  properties: {
    items: { type: 'array', items: { type: 'object', required: ['id', 'accountNumber', 'displayName', 'primaryContact', 'primaryAddress', 'status', 'serviceCount', 'activeServiceCount', 'updatedAt'], additionalProperties: false, properties: {
      id: { type: 'string', format: 'uuid' }, accountNumber: { type: 'string' }, displayName: { type: 'string' },
      primaryContact: { anyOf: [{ type: 'string' }, { type: 'null' }] }, primaryAddress: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      status: { type: 'string' }, serviceCount: { type: 'integer' }, activeServiceCount: { type: 'integer' }, updatedAt: { type: 'string', format: 'date-time' },
    } } },
    page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' }, pageCount: { type: 'integer' },
  },
} as const;
const contactResponse = { type: 'object', required: ['id', 'type', 'value', 'isPrimary'], additionalProperties: false, properties: {
  id: { type: 'string', format: 'uuid' }, type: { type: 'string' }, value: { type: 'string' }, isPrimary: { type: 'boolean' },
} } as const;
const addressResponse = { type: 'object', required: ['id', 'type', 'line1', 'line2', 'barangay', 'municipality', 'province', 'postalCode', 'isPrimary'], additionalProperties: false, properties: {
  id: { type: 'string', format: 'uuid' }, type: { type: 'string' }, line1: { type: 'string' }, line2: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  barangay: { type: 'string' }, municipality: { type: 'string' }, province: { type: 'string' }, postalCode: { anyOf: [{ type: 'string' }, { type: 'null' }] }, isPrimary: { type: 'boolean' },
} } as const;
const serviceResponse = { type: 'object', required: ['id', 'serviceAccountNumber', 'status', 'planId', 'planCode', 'planName', 'category', 'currentRateCentavos', 'activationDate', 'billingStartDate', 'billingDay', 'dueDay', 'installationAddressId', 'installationAddress', 'collectionAreaId', 'collectionAreaName', 'assignedCollectorId', 'assignedCollectorName'], additionalProperties: false, properties: {
  id: { type: 'string', format: 'uuid' }, serviceAccountNumber: { type: 'string' }, status: { type: 'string' },
  planId: { type: 'string', format: 'uuid' }, planCode: { type: 'string' }, planName: { type: 'string' }, category: { type: 'string' }, currentRateCentavos: { type: 'string' },
  activationDate: { anyOf: [{ type: 'string' }, { type: 'null' }] }, billingStartDate: { type: 'string' }, billingDay: { type: 'integer' }, dueDay: { type: 'integer' },
  installationAddressId: { type: 'string', format: 'uuid' }, installationAddress: { type: 'string' },
  collectionAreaId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] }, collectionAreaName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  assignedCollectorId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] }, assignedCollectorName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
} } as const;
const subscriberDetailResponse = { type: 'object', required: ['id', 'accountNumber', 'firstName', 'middleName', 'lastName', 'organizationName', 'displayName', 'billingDay', 'dueDay', 'status', 'notes', 'createdAt', 'updatedAt', 'contacts', 'addresses', 'services'], additionalProperties: false, properties: {
  id: { type: 'string', format: 'uuid' }, accountNumber: { type: 'string' }, firstName: { type: 'string' }, middleName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  lastName: { type: 'string' }, organizationName: { anyOf: [{ type: 'string' }, { type: 'null' }] }, displayName: { type: 'string' },
  billingDay: { type: 'integer' }, dueDay: { type: 'integer' }, status: { type: 'string' }, notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
  contacts: { type: 'array', items: contactResponse }, addresses: { type: 'array', items: addressResponse }, services: { type: 'array', items: serviceResponse },
} } as const;
const referenceDataResponse = { type: 'object', required: ['servicePlans', 'collectionAreas', 'collectors'], additionalProperties: false, properties: {
  servicePlans: { type: 'array', items: { type: 'object', required: ['id', 'serviceTypeId', 'serviceTypeName', 'category', 'code', 'name', 'priceCentavos', 'installationFeeCentavos', 'reconnectionFeeCentavos', 'speedMbps', 'channelCount', 'description', 'isActive'], additionalProperties: false, properties: {
    id: { type: 'string', format: 'uuid' }, serviceTypeId: { type: 'string', format: 'uuid' }, serviceTypeName: { type: 'string' }, category: { type: 'string' }, code: { type: 'string' }, name: { type: 'string' },
    priceCentavos: { type: 'string' }, installationFeeCentavos: { type: 'string' }, reconnectionFeeCentavos: { type: 'string' }, speedMbps: { anyOf: [{ type: 'integer' }, { type: 'null' }] }, channelCount: { anyOf: [{ type: 'integer' }, { type: 'null' }] }, description: { anyOf: [{ type: 'string' }, { type: 'null' }] }, isActive: { type: 'boolean' },
  } } },
  collectionAreas: { type: 'array', items: { type: 'object', required: ['id', 'code', 'name', 'description'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' }, code: { type: 'string' }, name: { type: 'string' }, description: { anyOf: [{ type: 'string' }, { type: 'null' }] } } } },
  collectors: { type: 'array', items: { type: 'object', required: ['id', 'collectorNumber', 'name'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' }, collectorNumber: { type: 'string' }, name: { type: 'string' } } } },
} } as const;

export const subscriberPlugin: FastifyPluginAsync<SubscriberPluginOptions> = async (app, options) => {
  const service = new SubscriberService(options.database);
  const authenticate = authenticateWith(options.authService);
  const canView = requirePermission(options.authService, 'subscriber.view');
  const canManage = requirePermission(options.authService, 'subscriber.manage');

  app.get('/subscribers', {
    preHandler: [authenticate, canView],
    schema: { querystring: { type: 'object', additionalProperties: false, properties: {
      query: { type: 'string', maxLength: 100 }, status: { type: 'string' }, page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 10, maximum: 100 }, sort: { type: 'string' }, direction: { type: 'string' },
    } }, response: { 200: subscriberListResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse } },
  }, async (request) => subscriberListResponseSchema.parse(await service.list(subscriberListQuerySchema.parse(request.query))));

  app.get('/subscribers/:id', {
    preHandler: [authenticate, canView],
    schema: { params: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' } } }, response: { 200: subscriberDetailResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } },
  }, async (request) => {
    const id = (request.params as { id?: unknown }).id;
    if (typeof id !== 'string') throw new AppError(400, 'VALIDATION_ERROR', 'Subscriber identifier is required');
    return subscriberDetailSchema.parse(await service.get(id));
  });

  app.post('/subscribers', {
    preHandler: [authenticate, canManage],
    schema: { body: { type: 'object' }, response: { 201: subscriberDetailResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 409: errorResponse } },
  }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    const result = await service.create(subscriberCreateSchema.parse(request.body), context.userId, request.id);
    return reply.code(201).send(subscriberDetailSchema.parse(result));
  });

  app.get('/reference-data', {
    preHandler: [authenticate, canView],
    schema: { response: { 200: referenceDataResponse, 401: errorResponse, 403: errorResponse } },
  }, async () => service.references());

  app.post('/service-plans', {
    preHandler: [authenticate, requirePermission(options.authService, 'plan.manage')],
    schema: { body: { type: 'object' }, response: { 201: { type: 'object', required: ['id', 'code', 'name'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' }, code: { type: 'string' }, name: { type: 'string' } } }, 400: errorResponse, 401: errorResponse, 403: errorResponse, 409: errorResponse } },
  }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    return reply.code(201).send(await service.createServicePlan(servicePlanCreateSchema.parse(request.body), context.userId, request.id));
  });

  app.post('/collection-areas', {
    preHandler: [authenticate, requirePermission(options.authService, 'collection.manage')],
    schema: { body: { type: 'object' }, response: { 201: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' } } }, 400: errorResponse, 401: errorResponse, 403: errorResponse, 409: errorResponse } },
  }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    return reply.code(201).send(await service.createCollectionArea(collectionAreaCreateSchema.parse(request.body), context.userId, request.id));
  });

  app.post('/collectors', {
    preHandler: [authenticate, requirePermission(options.authService, 'collection.manage')],
    schema: { body: { type: 'object' }, response: { 201: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' } } }, 400: errorResponse, 401: errorResponse, 403: errorResponse, 409: errorResponse } },
  }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    return reply.code(201).send(await service.createCollector(collectorCreateSchema.parse(request.body), context.userId, request.id));
  });
};

