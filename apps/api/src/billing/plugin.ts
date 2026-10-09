import type { FastifyPluginAsync } from 'fastify';
import {
  billingCycleDetailSchema,
  billingGenerationResultSchema,
  generateBillingCycleInputSchema,
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
const ledgerResponse = { type: 'object', required: ['subscriberId', 'entries', 'closingBalanceCentavos'], additionalProperties: false, properties: {
  subscriberId: { type: 'string', format: 'uuid' }, entries: { type: 'array', items: ledgerEntryResponse }, closingBalanceCentavos: { type: 'string' },
} } as const;
const uuidParams = { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' } } } as const;

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

  app.get('/billing/cycles/:id', {
    preHandler: [authenticate, requirePermission(options.authService, 'billing.view')],
    schema: { params: uuidParams, response: { 200: cycleResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } },
  }, async (request) => {
    const id = (request.params as { id: string }).id;
    return billingCycleDetailSchema.parse(await service.cycle(id));
  });

  app.get('/subscribers/:id/ledger', {
    preHandler: [authenticate, requirePermission(options.authService, 'billing.view')],
    schema: { params: uuidParams, response: { 200: ledgerResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } },
  }, async (request) => {
    const id = (request.params as { id: string }).id;
    return subscriberLedgerSchema.parse(await service.ledger(id));
  });
};
