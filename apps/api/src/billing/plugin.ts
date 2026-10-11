import type { FastifyPluginAsync } from 'fastify';
import {
  billingCycleDetailSchema,
  billingCycleListSchema,
  billingPreviewSchema,
  billingGenerationResultSchema,
  generateBillingCycleInputSchema,
  invoiceDetailSchema,
  invoiceListQuerySchema,
  invoiceListResponseSchema,
  invoiceMutationResultSchema,
  overdueResultSchema,
  postInvoiceAdjustmentSchema,
  processOverdueSchema,
  subscriberLedgerQuerySchema,
  voidInvoiceSchema,
  subscriberLedgerSchema,
} from '@bcis/shared';
import type { AuthService } from '../auth/service.js';
import { authenticateWith, requirePermission } from '../auth/guards.js';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import { BillingService } from './service.js';

interface BillingPluginOptions { database: Database; authService: AuthService }

const errorResponse = {
  type: 'object', required: ['error', 'message', 'requestId'], additionalProperties: false,
  properties: { error: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' } },
} as const;
const itemResponse = { type: 'object', required: ['id', 'type', 'description', 'amountCentavos'], additionalProperties: false, properties: {
  id: { type: 'string', format: 'uuid' }, type: { type: 'string' }, description: { type: 'string' }, amountCentavos: { type: 'string' },
} } as const;
const invoiceResponse = { type: 'object', required: ['id', 'invoiceNumber', 'subscriberId', 'serviceAccountId', 'serviceAccountNumber', 'invoiceDate', 'dueDate', 'status', 'totalCentavos', 'balanceCentavos', 'finalizedAt', 'items'], additionalProperties: false, properties: {
  id: { type: 'string', format: 'uuid' }, invoiceNumber: { type: 'string' }, subscriberId: { type: 'string', format: 'uuid' },
  serviceAccountId: { type: 'string', format: 'uuid' }, serviceAccountNumber: { type: 'string' }, invoiceDate: { type: 'string', format: 'date' }, dueDate: { type: 'string', format: 'date' },
  status: { type: 'string' }, totalCentavos: { type: 'string' }, balanceCentavos: { type: 'string' }, finalizedAt: { type: 'string', format: 'date-time' }, items: { type: 'array', items: itemResponse },
} } as const;
const cycleResponse = { type: 'object', required: ['id', 'period', 'periodStart', 'periodEnd', 'status', 'finalizedAt', 'invoices'], additionalProperties: false, properties: {
  id: { type: 'string', format: 'uuid' }, period: { type: 'string' }, periodStart: { type: 'string', format: 'date' }, periodEnd: { type: 'string', format: 'date' }, status: { type: 'string' },
  finalizedAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }, invoices: { type: 'array', items: invoiceResponse },
} } as const;
const generationResponse = { type: 'object', required: ['cycleId', 'period', 'periodStart', 'periodEnd', 'status', 'invoicesCreated', 'duplicatesSkipped', 'totalInvoicedCentavos'], additionalProperties: false, properties: {
  cycleId: { type: 'string', format: 'uuid' }, period: { type: 'string' }, periodStart: { type: 'string', format: 'date' }, periodEnd: { type: 'string', format: 'date' }, status: { type: 'string' },
  invoicesCreated: { type: 'integer' }, duplicatesSkipped: { type: 'integer' }, totalInvoicedCentavos: { type: 'string' },
} } as const;
const ledgerEntryResponse = { type: 'object', required: ['id', 'occurredAt', 'referenceType', 'referenceId', 'referenceNumber', 'description', 'debitCentavos', 'creditCentavos', 'runningBalanceCentavos'], additionalProperties: false, properties: {
  id: { type: 'string', format: 'uuid' }, occurredAt: { type: 'string', format: 'date-time' }, referenceType: { type: 'string' }, referenceId: { type: 'string', format: 'uuid' }, referenceNumber: { type: 'string' },
  description: { type: 'string' }, debitCentavos: { type: 'string' }, creditCentavos: { type: 'string' }, runningBalanceCentavos: { type: 'string' },
} } as const;
const ledgerResponse = { type: 'object', required: ['subscriberId', 'from', 'to', 'openingBalanceCentavos', 'entries', 'closingBalanceCentavos'], additionalProperties: false, properties: {
  subscriberId: { type: 'string', format: 'uuid' }, from: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] }, to: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] }, openingBalanceCentavos: { type: 'string' }, entries: { type: 'array', items: ledgerEntryResponse }, closingBalanceCentavos: { type: 'string' },
} } as const;
const uuidParams = { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' } } } as const;
const cycleSummaryResponse = { type: 'object', required: ['id', 'period', 'periodStart', 'periodEnd', 'status', 'finalizedAt', 'invoiceCount', 'totalInvoicedCentavos'], additionalProperties: false, properties: {
  id: { type: 'string', format: 'uuid' }, period: { type: 'string' }, periodStart: { type: 'string', format: 'date' }, periodEnd: { type: 'string', format: 'date' }, status: { type: 'string' }, finalizedAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }, invoiceCount: { type: 'integer' }, totalInvoicedCentavos: { type: 'string' },
} } as const;
const invoiceListItemResponse = { type: 'object', required: ['id', 'invoiceNumber', 'period', 'subscriberId', 'subscriberAccountNumber', 'subscriberName', 'serviceAccountId', 'serviceAccountNumber', 'invoiceDate', 'dueDate', 'status', 'totalCentavos', 'balanceCentavos'], additionalProperties: false, properties: {
  id: { type: 'string', format: 'uuid' }, invoiceNumber: { type: 'string' }, period: { type: 'string' }, subscriberId: { type: 'string', format: 'uuid' }, subscriberAccountNumber: { type: 'string' }, subscriberName: { type: 'string' }, serviceAccountId: { type: 'string', format: 'uuid' }, serviceAccountNumber: { type: 'string' }, invoiceDate: { type: 'string', format: 'date' }, dueDate: { type: 'string', format: 'date' }, status: { type: 'string' }, totalCentavos: { type: 'string' }, balanceCentavos: { type: 'string' },
} } as const;
const invoiceListResponse = { type: 'object', required: ['items', 'page', 'pageSize', 'total', 'pageCount'], additionalProperties: false, properties: { items: { type: 'array', items: invoiceListItemResponse }, page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' }, pageCount: { type: 'integer' } } } as const;

export const billingPlugin: FastifyPluginAsync<BillingPluginOptions> = async (app, options) => {
  const service = new BillingService(options.database);
  const authenticate = authenticateWith(options.authService);

  app.post('/billing/cycles/generate', {
    preHandler: [authenticate, requirePermission(options.authService, 'billing.generate')],
    schema: {
      body: { type: 'object', required: ['period'], additionalProperties: false, properties: { period: { type: 'string', pattern: '^[1-9]\\d{3}-(0[1-9]|1[0-2])$' } } },
      response: { 200: generationResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 409: errorResponse },
    },
  }, async (request) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    const input = generateBillingCycleInputSchema.parse(request.body);
    return billingGenerationResultSchema.parse(await service.generate(input.period, context.userId, request.id));
  });

  app.get('/billing/cycles', {
    preHandler: [authenticate, requirePermission(options.authService, 'billing.view')],
    schema: { response: { 200: { type: 'object', required: ['items'], additionalProperties: false, properties: { items: { type: 'array', items: cycleSummaryResponse } } }, 401: errorResponse, 403: errorResponse } },
  }, async () => billingCycleListSchema.parse(await service.cycles()));

  app.get('/billing/cycles/preview', {
    preHandler: [authenticate, requirePermission(options.authService, 'billing.generate')],
    schema: {
      querystring: { type: 'object', required: ['period'], additionalProperties: false, properties: { period: { type: 'string', pattern: '^[1-9]\\d{3}-(0[1-9]|1[0-2])$' } } },
      response: { 200: { type: 'object', required: ['period', 'periodStart', 'periodEnd', 'eligibleServices', 'alreadyInvoicedServices', 'invoicesToCreate', 'projectedTotalCentavos', 'existingCycle'], additionalProperties: false, properties: { period: { type: 'string' }, periodStart: { type: 'string', format: 'date' }, periodEnd: { type: 'string', format: 'date' }, eligibleServices: { type: 'integer' }, alreadyInvoicedServices: { type: 'integer' }, invoicesToCreate: { type: 'integer' }, projectedTotalCentavos: { type: 'string' }, existingCycle: { anyOf: [cycleSummaryResponse, { type: 'null' }] } } }, 400: errorResponse, 401: errorResponse, 403: errorResponse },
    },
  }, async (request) => {
    const input = generateBillingCycleInputSchema.parse(request.query);
    return billingPreviewSchema.parse(await service.preview(input.period));
  });

  app.get('/invoices', {
    preHandler: [authenticate, requirePermission(options.authService, 'billing.view')],
    schema: {
      querystring: { type: 'object', additionalProperties: false, properties: { query: { type: 'string', maxLength: 100 }, period: { type: 'string' }, status: { type: 'string' }, dueFrom: { type: 'string', format: 'date' }, dueTo: { type: 'string', format: 'date' }, minAmountCentavos: { type: 'string', pattern: '^(0|[1-9]\\d*)$' }, maxAmountCentavos: { type: 'string', pattern: '^(0|[1-9]\\d*)$' }, sort: { type: 'string' }, direction: { type: 'string' }, page: { type: 'string', pattern: '^[1-9]\\d*$' }, pageSize: { type: 'string', pattern: '^[1-9]\\d*$' } } },
      response: { 200: invoiceListResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse },
    },
  }, async (request) => invoiceListResponseSchema.parse(await service.invoices(invoiceListQuerySchema.parse(request.query))));

  app.get('/invoices/:id', {
    preHandler: [authenticate, requirePermission(options.authService, 'billing.view')],
    schema: { params: uuidParams, response: { 200: { ...invoiceListItemResponse, required: [...invoiceListItemResponse.required, 'finalizedAt', 'items', 'ledgerEntry', 'adjustments', 'voidedAt', 'voidReason'], properties: { ...invoiceListItemResponse.properties, finalizedAt: { type: 'string', format: 'date-time' }, items: { type: 'array', items: itemResponse }, ledgerEntry: { anyOf: [{ type: 'object', required: ['id', 'referenceNumber'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' }, referenceNumber: { type: 'string' } } }, { type: 'null' }] }, adjustments: { type: 'array', items: { type: 'object', required: ['id', 'amountCentavos', 'reason', 'status', 'createdAt'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' }, amountCentavos: { type: 'string' }, reason: { type: 'string' }, status: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' } } } }, voidedAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }, voidReason: { anyOf: [{ type: 'string' }, { type: 'null' }] } } }, 401: errorResponse, 403: errorResponse, 404: errorResponse } },
  }, async (request) => invoiceDetailSchema.parse(await service.invoice((request.params as { id: string }).id)));

  const mutationResponse = { type: 'object', required: ['invoiceId', 'status', 'balanceCentavos'], additionalProperties: false, properties: { invoiceId: { type: 'string', format: 'uuid' }, status: { type: 'string' }, balanceCentavos: { type: 'string' } } } as const;
  app.post('/invoices/:id/adjustments', {
    preHandler: [authenticate, requirePermission(options.authService, 'billing.adjust')],
    schema: { params: uuidParams, body: { type: 'object' }, response: { 200: mutationResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } },
  }, async (request) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    return invoiceMutationResultSchema.parse(await service.adjust((request.params as { id: string }).id, postInvoiceAdjustmentSchema.parse(request.body), context.userId, request.id));
  });

  app.post('/invoices/:id/void', {
    preHandler: [authenticate, requirePermission(options.authService, 'billing.adjust')],
    schema: { params: uuidParams, body: { type: 'object', required: ['reason'], additionalProperties: false, properties: { reason: { type: 'string', minLength: 8, maxLength: 255 } } }, response: { 200: mutationResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } },
  }, async (request) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    const input = voidInvoiceSchema.parse(request.body);
    return invoiceMutationResultSchema.parse(await service.void((request.params as { id: string }).id, input.reason, context.userId, request.id));
  });

  app.post('/billing/overdue/process', {
    preHandler: [authenticate, requirePermission(options.authService, 'billing.generate')],
    schema: { body: { type: 'object', required: ['asOf'], additionalProperties: false, properties: { asOf: { type: 'string', format: 'date' } } }, response: { 200: { type: 'object', required: ['asOf', 'invoicesMarkedOverdue'], additionalProperties: false, properties: { asOf: { type: 'string', format: 'date' }, invoicesMarkedOverdue: { type: 'integer' } } }, 400: errorResponse, 401: errorResponse, 403: errorResponse } },
  }, async (request) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    const input = processOverdueSchema.parse(request.body);
    return overdueResultSchema.parse(await service.processOverdue(input.asOf, context.userId, request.id));
  });

  app.get('/billing/cycles/:id', {
    preHandler: [authenticate, requirePermission(options.authService, 'billing.view')],
    schema: { params: uuidParams, response: { 200: cycleResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } },
  }, async (request) => {
    const id = (request.params as { id: string }).id;
    return billingCycleDetailSchema.parse(await service.cycle(id));
  });

  app.get('/subscribers/:id/ledger', {
    preHandler: [authenticate, requirePermission(options.authService, 'billing.view')],
    schema: { params: uuidParams, querystring: { type: 'object', additionalProperties: false, properties: { from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' } } }, response: { 200: ledgerResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } },
  }, async (request) => {
    const id = (request.params as { id: string }).id;
    return subscriberLedgerSchema.parse(await service.ledger(id, subscriberLedgerQuerySchema.parse(request.query)));
  });
};
