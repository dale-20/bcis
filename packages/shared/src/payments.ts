import { z } from 'zod';
import { centavosSchema } from './money.js';

const positiveCentavosSchema = centavosSchema.refine((value) => BigInt(value) > 0n, 'Amount must be positive');
const notesSchema = z.string().trim().min(1).max(500).optional();

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
]);
export type PostPaymentInput = z.infer<typeof postPaymentInputSchema>;

export const paymentAllocationSchema = z.object({
  invoiceId: z.uuid(), invoiceNumber: z.string(), amountCentavos: positiveCentavosSchema, allocationOrder: z.number().int().positive(),
});
export const paymentResultSchema = z.object({
  paymentId: z.uuid(), subscriberId: z.uuid(), method: z.enum(['CASH', 'GCASH']),
  status: z.enum(['PENDING_VERIFICATION', 'POSTED', 'REJECTED', 'REVERSED']),
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
