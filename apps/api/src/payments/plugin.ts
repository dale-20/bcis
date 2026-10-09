import type { FastifyPluginAsync } from 'fastify';
import { paymentResultSchema, postPaymentInputSchema, reversePaymentInputSchema, verifyGcashInputSchema } from '@bcis/shared';
import type { AuthService } from '../auth/service.js';
import { authenticateWith, requirePermission } from '../auth/guards.js';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import { PaymentService } from './service.js';

interface PaymentPluginOptions { database: Database; authService: AuthService }

const errorResponse = {
  type: 'object', required: ['error', 'message', 'requestId'], additionalProperties: false,
  properties: { error: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' } },
} as const;
const allocationResponse = { type: 'object', required: ['invoiceId', 'invoiceNumber', 'amountCentavos', 'allocationOrder'], additionalProperties: false, properties: {
  invoiceId: { type: 'string', format: 'uuid' }, invoiceNumber: { type: 'string' }, amountCentavos: { type: 'string' }, allocationOrder: { type: 'integer' },
} } as const;
const paymentResponse = { type: 'object', required: ['paymentId', 'subscriberId', 'method', 'status', 'amountCentavos', 'receiptNumber', 'allocatedCentavos', 'unappliedCreditCentavos', 'allocations'], additionalProperties: false, properties: {
  paymentId: { type: 'string', format: 'uuid' }, subscriberId: { type: 'string', format: 'uuid' }, method: { type: 'string', enum: ['CASH', 'GCASH'] },
  status: { type: 'string' }, amountCentavos: { type: 'string' }, receiptNumber: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  allocatedCentavos: { type: 'string' }, unappliedCreditCentavos: { type: 'string' }, allocations: { type: 'array', items: allocationResponse },
} } as const;
const uuidParams = { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' } } } as const;
const proofBody = { type: 'object', required: ['storageKey', 'originalFilename', 'mimeType', 'sizeBytes', 'sha256'], additionalProperties: false, properties: {
  storageKey: { type: 'string', minLength: 1, maxLength: 255 }, originalFilename: { type: 'string', minLength: 1, maxLength: 255 },
  mimeType: { type: 'string', enum: ['image/jpeg', 'image/png', 'application/pdf'] }, sizeBytes: { type: 'string', pattern: '^[1-9]\\d*$' }, sha256: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
} } as const;
const postBody = { type: 'object', required: ['subscriberId', 'amountCentavos', 'paymentDate', 'idempotencyKey', 'method'], additionalProperties: false, properties: {
  subscriberId: { type: 'string', format: 'uuid' }, amountCentavos: { type: 'string', pattern: '^[1-9]\\d*$' }, paymentDate: { type: 'string', format: 'date-time' }, idempotencyKey: { type: 'string', format: 'uuid' },
  method: { type: 'string', enum: ['CASH', 'GCASH'] }, notes: { type: 'string', minLength: 1, maxLength: 500 },
  referenceNumber: { type: 'string', minLength: 6, maxLength: 100 }, senderDetails: { type: 'string', minLength: 1, maxLength: 255 }, proof: proofBody,
} } as const;

export const paymentPlugin: FastifyPluginAsync<PaymentPluginOptions> = async (app, options) => {
  const service = new PaymentService(options.database);
  const authenticate = authenticateWith(options.authService);

  app.post('/payments', {
    preHandler: [authenticate, requirePermission(options.authService, 'payment.create')],
    schema: { body: postBody, response: { 200: paymentResponse, 201: paymentResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } },
  }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    const result = paymentResultSchema.parse(await service.create(postPaymentInputSchema.parse(request.body), context.userId, request.id));
    reply.code(result.status === 'PENDING_VERIFICATION' ? 201 : 200);
    return result;
  });

  app.post('/payments/:id/gcash-verification', {
    preHandler: [authenticate, requirePermission(options.authService, 'payment.verify_gcash')],
    schema: {
      params: uuidParams,
      body: { type: 'object', required: ['decision'], additionalProperties: false, properties: { decision: { type: 'string', enum: ['VERIFIED', 'REJECTED'] }, reason: { type: 'string', minLength: 3, maxLength: 255 } } },
      response: { 200: paymentResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse },
    },
  }, async (request) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    const id = (request.params as { id: string }).id;
    return paymentResultSchema.parse(await service.verify(id, verifyGcashInputSchema.parse(request.body), context.userId, request.id));
  });

  app.post('/payments/:id/reverse', {
    preHandler: [authenticate, requirePermission(options.authService, 'payment.reverse')],
    schema: {
      params: uuidParams,
      body: { type: 'object', required: ['reason'], additionalProperties: false, properties: { reason: { type: 'string', minLength: 3, maxLength: 255 } } },
      response: { 200: paymentResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse },
    },
  }, async (request) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    const id = (request.params as { id: string }).id;
    return paymentResultSchema.parse(await service.reverse(id, reversePaymentInputSchema.parse(request.body), context.userId, request.id));
  });
};
