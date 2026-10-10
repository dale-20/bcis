import { z } from 'zod';
import { centavosSchema, signedCentavosSchema } from './money.js';

export const collectionBatchStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'SUBMITTED', 'REMITTED', 'RECONCILED', 'CLOSED']);
export const createCollectionBatchInputSchema = z.object({ collectorId: z.uuid(), collectionAreaId: z.uuid(), collectionDate: z.iso.date() }).strict();
export type CreateCollectionBatchInput = z.infer<typeof createCollectionBatchInputSchema>;
export const recordCollectionInputSchema = z.object({ batchAccountId: z.uuid(), paymentId: z.uuid(), notes: z.string().trim().min(1).max(255).optional() }).strict();
export const remittanceInputSchema = z.object({ remittedCashCentavos: centavosSchema, notes: z.string().trim().min(1).max(255).optional() }).strict();
export const reconciliationInputSchema = z.object({ notes: z.string().trim().min(3).max(255) }).strict();
export const closeBatchInputSchema = z.object({ notes: z.string().trim().min(3).max(255).optional() }).strict();

export const collectionReferenceSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string(), status: z.string() });
export const collectionReferencesSchema = z.object({ collectors: z.array(collectionReferenceSchema), areas: z.array(collectionReferenceSchema) });

export const routeSheetAccountSchema = z.object({
  id: z.uuid(), subscriberId: z.uuid(), accountNumber: z.string(), subscriberName: z.string(), serviceAccountId: z.uuid(), serviceAccountNumber: z.string(),
  address: z.string(), currentBillCentavos: centavosSchema, arrearsCentavos: centavosSchema, amountDueCentavos: centavosSchema,
  paymentId: z.uuid().nullable(), paymentMethod: z.string().nullable(), paymentAmountCentavos: centavosSchema.nullable(), outcome: z.string().nullable(), notes: z.string().nullable(),
});
export const remittanceSchema = z.object({
  id: z.uuid(), expectedCashCentavos: centavosSchema, remittedCashCentavos: centavosSchema,
  differenceCentavos: signedCentavosSchema, nonCashCentavos: centavosSchema, remittedAt: z.iso.datetime(), notes: z.string().nullable(),
});
export const collectionBatchSchema = z.object({
  id: z.uuid(), batchNumber: z.string(), collectorId: z.uuid(), collectorName: z.string(), collectionAreaId: z.uuid(), collectionAreaName: z.string(),
  collectionDate: z.iso.date(), status: collectionBatchStatusSchema, expectedReceivableCentavos: centavosSchema,
  submittedAt: z.iso.datetime().nullable(), reconciledAt: z.iso.datetime().nullable(), reconciliationNotes: z.string().nullable(),
  closedAt: z.iso.datetime().nullable(), closeNotes: z.string().nullable(), accounts: z.array(routeSheetAccountSchema), remittance: remittanceSchema.nullable(),
});
export type CollectionBatch = z.infer<typeof collectionBatchSchema>;
