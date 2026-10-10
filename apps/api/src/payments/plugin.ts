import type { FastifyPluginAsync } from 'fastify';
import {
  paymentDetailSchema, paymentListQuerySchema, paymentListSchema, paymentPreviewQuerySchema, paymentPreviewSchema,
  paymentResultSchema, postPaymentInputSchema, reversePaymentInputSchema, verifyGcashInputSchema,
} from '@bcis/shared';
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
  paymentId: { type: 'string', format: 'uuid' }, subscriberId: { type: 'string', format: 'uuid' }, method: { type: 'string', enum: ['CASH', 'GCASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] },
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
  method: { type: 'string', enum: ['CASH', 'GCASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] }, notes: { type: 'string', minLength: 1, maxLength: 500 },
  referenceNumber: { type: 'string', minLength: 6, maxLength: 100 }, senderDetails: { type: 'string', minLength: 1, maxLength: 255 }, proof: proofBody,
} } as const;
const paymentPreviewResponse = { type: 'object', required: ['subscriberId','subscriberAccountNumber','subscriberName','amountCentavos','outstandingCentavos','existingAvailableCreditCentavos','allocatedCentavos','unappliedCreditCentavos','allocations'], additionalProperties: false, properties: {
  subscriberId: { type: 'string', format: 'uuid' }, subscriberAccountNumber: { type: 'string' }, subscriberName: { type: 'string' },
  amountCentavos: { type: 'string' }, outstandingCentavos: { type: 'string' }, existingAvailableCreditCentavos: { type: 'string' },
  allocatedCentavos: { type: 'string' }, unappliedCreditCentavos: { type: 'string' },
  allocations: { type: 'array', items: { type: 'object', required: ['invoiceId','invoiceNumber','period','dueDate','balanceBeforeCentavos','allocationCentavos','balanceAfterCentavos'], additionalProperties: false, properties: {
    invoiceId: { type: 'string', format: 'uuid' }, invoiceNumber: { type: 'string' }, period: { type: 'string' }, dueDate: { type: 'string', format: 'date' },
    balanceBeforeCentavos: { type: 'string' }, allocationCentavos: { type: 'string' }, balanceAfterCentavos: { type: 'string' },
  } } },
} } as const;
const paymentListResponse = { type: 'object', required: ['items','page','pageSize','total','pageCount'], additionalProperties: false, properties: {
  items: { type: 'array', items: { type: 'object', required: ['paymentId','subscriberId','subscriberAccountNumber','subscriberName','paymentDate','createdAt','method','status','amountCentavos','referenceNumber','createdBy','postedBy','postedAt','receiptNumber','receiptStatus','receiptIssuedAt','allocatedCentavos','unappliedCreditCentavos'], additionalProperties: false, properties: {
    paymentId: { type: 'string', format: 'uuid' }, subscriberId: { type: 'string', format: 'uuid' }, subscriberAccountNumber: { type: 'string' }, subscriberName: { type: 'string' },
    paymentDate: { type: 'string', format: 'date-time' }, createdAt: { type: 'string', format: 'date-time' }, method: { type: 'string' }, status: { type: 'string' }, amountCentavos: { type: 'string' },
    referenceNumber: { anyOf: [{ type: 'string' }, { type: 'null' }] }, createdBy: { type: 'string' }, postedBy: { anyOf: [{ type: 'string' }, { type: 'null' }] }, postedAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
    receiptNumber: { anyOf: [{ type: 'string' }, { type: 'null' }] }, receiptStatus: { anyOf: [{ type: 'string' }, { type: 'null' }] }, receiptIssuedAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
    allocatedCentavos: { type: 'string' }, unappliedCreditCentavos: { type: 'string' },
  } } }, page: { type: 'integer' }, pageSize: { type: 'integer' }, total: { type: 'integer' }, pageCount: { type: 'integer' },
} } as const;

export const paymentPlugin: FastifyPluginAsync<PaymentPluginOptions> = async (app, options) => {
  const service = new PaymentService(options.database);
  const authenticate = authenticateWith(options.authService);

  app.get('/payments/preview', {
    preHandler: [authenticate, requirePermission(options.authService, 'payment.create')],
    schema: { querystring: { type: 'object', required: ['subscriberId','amountCentavos'], additionalProperties: false, properties: {
      subscriberId: { type: 'string', format: 'uuid' }, amountCentavos: { type: 'string', pattern: '^[1-9]\\d*$' },
    } }, response: { 200: paymentPreviewResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } },
  }, async (request) => paymentPreviewSchema.parse(await service.preview(paymentPreviewQuerySchema.parse(request.query))));

  app.get('/payments', {
    preHandler: [authenticate, requirePermission(options.authService, 'billing.view')],
    schema: { querystring: { type: 'object', additionalProperties: false, properties: {
      query: { type: 'string', maxLength: 100 }, method: { type: 'string' }, status: { type: 'string' },
      from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' },
      page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 10, maximum: 100 },
    } }, response: { 200: paymentListResponse, 400: errorResponse, 401: errorResponse, 403: errorResponse } },
  }, async (request) => paymentListSchema.parse(await service.list(paymentListQuerySchema.parse(request.query))));

  app.get('/payments/:id', {
    preHandler: [authenticate, requirePermission(options.authService, 'billing.view')],
    schema: { params: uuidParams, response: { 200: { type: 'object', additionalProperties: true }, 401: errorResponse, 403: errorResponse, 404: errorResponse } },
  }, async (request) => paymentDetailSchema.parse(await service.detail((request.params as { id: string }).id)));

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
    preHandler: [authenticate, requirePermission(options.authService, 'payment.reverse'), requirePermission(options.authService, 'receipt.void')],
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
