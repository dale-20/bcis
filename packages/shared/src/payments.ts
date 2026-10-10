import { z } from 'zod';
import { centavosSchema } from './money.js';

const positiveCentavosSchema = centavosSchema.refine((value) => BigInt(value) > 0n, 'Amount must be positive');
const notesSchema = z.string().trim().min(1).max(500).optional();
export const paymentMethodSchema = z.enum(['CASH', 'GCASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export const paymentStatusSchema = z.enum(['PENDING_VERIFICATION', 'POSTED', 'REJECTED', 'REVERSED']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export const receiptStatusSchema = z.enum(['ISSUED', 'VOID']);

export const paymentProofInputSchema = z.object({
  storageKey: z.string().trim().min(1).max(255),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  sizeBytes: positiveCentavosSchema,
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
}).strict();

const paymentBase = {
  subscriberId: z.uuid(),
  amountCentavos: positiveCentavosSchema,
  paymentDate: z.iso.datetime(),
  idempotencyKey: z.uuid(),
  notes: notesSchema,
};

export const postPaymentInputSchema = z.discriminatedUnion('method', [
  z.object({ ...paymentBase, method: z.literal('CASH') }).strict(),
  z.object({
    ...paymentBase,
    method: z.literal('GCASH'),
    referenceNumber: z.string().trim().min(6).max(100),
    senderDetails: z.string().trim().min(1).max(255),
    proof: paymentProofInputSchema,
  }).strict(),
  z.object({
    ...paymentBase,
    method: z.literal('BANK_TRANSFER'),
    referenceNumber: z.string().trim().min(3).max(100),
  }).strict(),
  z.object({
    ...paymentBase,
    method: z.literal('CHEQUE'),
    referenceNumber: z.string().trim().min(3).max(100),
  }).strict(),
  z.object({
    ...paymentBase,
    method: z.literal('OTHER'),
    notes: z.string().trim().min(3).max(500),
    referenceNumber: z.string().trim().min(1).max(100).optional(),
  }).strict(),
]);
export type PostPaymentInput = z.infer<typeof postPaymentInputSchema>;

export const paymentAllocationSchema = z.object({
  invoiceId: z.uuid(), invoiceNumber: z.string(), amountCentavos: positiveCentavosSchema, allocationOrder: z.number().int().positive(),
});
export const paymentResultSchema = z.object({
  paymentId: z.uuid(), subscriberId: z.uuid(), method: paymentMethodSchema,
  status: paymentStatusSchema,
  amountCentavos: positiveCentavosSchema, receiptNumber: z.string().nullable(),
  allocatedCentavos: centavosSchema, unappliedCreditCentavos: centavosSchema,
  allocations: z.array(paymentAllocationSchema),
});
export type PaymentResult = z.infer<typeof paymentResultSchema>;

export const verifyGcashInputSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('VERIFIED') }).strict(),
  z.object({ decision: z.literal('REJECTED'), reason: z.string().trim().min(3).max(255) }).strict(),
]);
export type VerifyGcashInput = z.infer<typeof verifyGcashInputSchema>;

export const reversePaymentInputSchema = z.object({ reason: z.string().trim().min(3).max(255) }).strict();
export type ReversePaymentInput = z.infer<typeof reversePaymentInputSchema>;

export const paymentPreviewQuerySchema = z.object({
  subscriberId: z.uuid(), amountCentavos: positiveCentavosSchema,
});
export type PaymentPreviewQuery = z.infer<typeof paymentPreviewQuerySchema>;

export const paymentPreviewSchema = z.object({
  subscriberId: z.uuid(), subscriberAccountNumber: z.string(), subscriberName: z.string(),
  amountCentavos: centavosSchema, outstandingCentavos: centavosSchema, existingAvailableCreditCentavos: centavosSchema,
  allocatedCentavos: centavosSchema, unappliedCreditCentavos: centavosSchema,
  allocations: z.array(z.object({
    invoiceId: z.uuid(), invoiceNumber: z.string(), period: z.string(), dueDate: z.iso.date(),
    balanceBeforeCentavos: centavosSchema, allocationCentavos: centavosSchema, balanceAfterCentavos: centavosSchema,
  })),
});
export type PaymentPreview = z.infer<typeof paymentPreviewSchema>;

export const paymentListQuerySchema = z.object({
  query: z.string().trim().max(100).default(''),
  method: z.union([paymentMethodSchema, z.literal('ALL')]).default('ALL'),
  status: z.union([paymentStatusSchema, z.literal('ALL')]).default('ALL'),
  from: z.iso.date().optional(), to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(10).max(100).default(20),
}).superRefine((query, context) => {
  if (query.from && query.to && query.from > query.to) context.addIssue({ code: 'custom', path: ['to'], message: 'End date must be on or after start date' });
});
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

export const paymentHistoryItemSchema = z.object({
  paymentId: z.uuid(), subscriberId: z.uuid(), subscriberAccountNumber: z.string(), subscriberName: z.string(),
  paymentDate: z.iso.datetime(), createdAt: z.iso.datetime(), method: paymentMethodSchema, status: paymentStatusSchema,
  amountCentavos: positiveCentavosSchema, referenceNumber: z.string().nullable(),
  createdBy: z.string(), postedBy: z.string().nullable(), postedAt: z.iso.datetime().nullable(),
  receiptNumber: z.string().nullable(), receiptStatus: receiptStatusSchema.nullable(), receiptIssuedAt: z.iso.datetime().nullable(),
  allocatedCentavos: centavosSchema, unappliedCreditCentavos: centavosSchema,
});
export type PaymentHistoryItem = z.infer<typeof paymentHistoryItemSchema>;
export const paymentListSchema = z.object({
  items: z.array(paymentHistoryItemSchema), page: z.number().int().positive(), pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(), pageCount: z.number().int().nonnegative(),
});
export type PaymentList = z.infer<typeof paymentListSchema>;

export const paymentDetailSchema = paymentHistoryItemSchema.extend({
  notes: z.string().nullable(), senderDetails: z.string().nullable(),
  allocations: z.array(z.object({
    invoiceId: z.uuid(), invoiceNumber: z.string(), period: z.string(), dueDate: z.iso.date(),
    amountCentavos: positiveCentavosSchema,
  })),
  reversal: z.object({ reason: z.string(), reversedBy: z.string(), reversedAt: z.iso.datetime() }).nullable(),
});
export type PaymentDetail = z.infer<typeof paymentDetailSchema>;
