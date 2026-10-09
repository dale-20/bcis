import { z } from 'zod';
import { centavosSchema, signedCentavosSchema } from './money.js';

export const billingPeriodSchema = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
export const invoiceStatusSchema = z.enum(['DRAFT', 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID', 'CREDITED']);
export const invoiceItemTypeSchema = z.enum(['SUBSCRIPTION', 'INSTALLATION', 'RECONNECTION', 'DISCOUNT', 'PENALTY', 'ADJUSTMENT']);

export const generateBillingCycleInputSchema = z.object({ period: billingPeriodSchema }).strict();
export type GenerateBillingCycleInput = z.infer<typeof generateBillingCycleInputSchema>;

export const billingGenerationResultSchema = z.object({
  cycleId: z.uuid(),
  period: billingPeriodSchema,
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  status: z.literal('FINALIZED'),
  invoicesCreated: z.number().int().nonnegative(),
  duplicatesSkipped: z.number().int().nonnegative(),
  totalInvoicedCentavos: centavosSchema,
});
export type BillingGenerationResult = z.infer<typeof billingGenerationResultSchema>;

export const invoiceItemSchema = z.object({
  id: z.uuid(), type: invoiceItemTypeSchema, description: z.string(), amountCentavos: signedCentavosSchema,
});

export const invoiceSummarySchema = z.object({
  id: z.uuid(), invoiceNumber: z.string(), subscriberId: z.uuid(), serviceAccountId: z.uuid(),
  serviceAccountNumber: z.string(), invoiceDate: z.iso.date(), dueDate: z.iso.date(), status: invoiceStatusSchema,
  totalCentavos: centavosSchema, balanceCentavos: centavosSchema, finalizedAt: z.iso.datetime(),
  items: z.array(invoiceItemSchema),
});

export const billingCycleDetailSchema = z.object({
  id: z.uuid(), period: billingPeriodSchema, periodStart: z.iso.date(), periodEnd: z.iso.date(),
  status: z.enum(['OPEN', 'GENERATING', 'FINALIZED', 'CLOSED']), finalizedAt: z.iso.datetime().nullable(),
  invoices: z.array(invoiceSummarySchema),
});
export type BillingCycleDetail = z.infer<typeof billingCycleDetailSchema>;

export const ledgerEntrySchema = z.object({
  id: z.uuid(), occurredAt: z.iso.datetime(), referenceType: z.string(), referenceId: z.uuid(), referenceNumber: z.string(),
  description: z.string(), debitCentavos: centavosSchema, creditCentavos: centavosSchema,
  runningBalanceCentavos: signedCentavosSchema,
});
export const subscriberLedgerSchema = z.object({ subscriberId: z.uuid(), entries: z.array(ledgerEntrySchema), closingBalanceCentavos: signedCentavosSchema });
export type SubscriberLedger = z.infer<typeof subscriberLedgerSchema>;
