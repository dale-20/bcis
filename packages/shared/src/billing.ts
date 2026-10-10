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

export const billingCycleSummarySchema = z.object({
  id: z.uuid(), period: billingPeriodSchema, periodStart: z.iso.date(), periodEnd: z.iso.date(),
  status: z.enum(['OPEN', 'GENERATING', 'FINALIZED', 'CLOSED']), finalizedAt: z.iso.datetime().nullable(),
  invoiceCount: z.number().int().nonnegative(), totalInvoicedCentavos: centavosSchema,
});
export type BillingCycleSummary = z.infer<typeof billingCycleSummarySchema>;
export const billingCycleListSchema = z.object({ items: z.array(billingCycleSummarySchema) });
export type BillingCycleList = z.infer<typeof billingCycleListSchema>;

export const billingPreviewSchema = z.object({
  period: billingPeriodSchema, periodStart: z.iso.date(), periodEnd: z.iso.date(),
  eligibleServices: z.number().int().nonnegative(), alreadyInvoicedServices: z.number().int().nonnegative(),
  invoicesToCreate: z.number().int().nonnegative(), projectedTotalCentavos: centavosSchema,
  existingCycle: billingCycleSummarySchema.nullable(),
});
export type BillingPreview = z.infer<typeof billingPreviewSchema>;

export const invoiceItemSchema = z.object({
  id: z.uuid(), type: invoiceItemTypeSchema, description: z.string(), amountCentavos: signedCentavosSchema,
});

export const invoiceSummarySchema = z.object({
  id: z.uuid(), invoiceNumber: z.string(), subscriberId: z.uuid(), serviceAccountId: z.uuid(),
  serviceAccountNumber: z.string(), invoiceDate: z.iso.date(), dueDate: z.iso.date(), status: invoiceStatusSchema,
  totalCentavos: centavosSchema, balanceCentavos: centavosSchema, finalizedAt: z.iso.datetime(),
  items: z.array(invoiceItemSchema),
});

export const invoiceListQuerySchema = z.object({
  query: z.string().trim().max(100).default(''),
  period: z.union([billingPeriodSchema, z.literal('ALL')]).default('ALL'),
  status: z.union([invoiceStatusSchema, z.literal('ALL')]).default('ALL'),
  dueFrom: z.iso.date().optional(), dueTo: z.iso.date().optional(),
  minAmountCentavos: centavosSchema.optional(), maxAmountCentavos: centavosSchema.optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(10).max(100).default(20),
}).superRefine((value, context) => {
  if (value.dueFrom && value.dueTo && value.dueFrom > value.dueTo) context.addIssue({ code: 'custom', message: 'Due date range is invalid', path: ['dueTo'] });
  if (value.minAmountCentavos && value.maxAmountCentavos && BigInt(value.minAmountCentavos) > BigInt(value.maxAmountCentavos)) context.addIssue({ code: 'custom', message: 'Amount range is invalid', path: ['maxAmountCentavos'] });
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const invoiceListItemSchema = z.object({
  id: z.uuid(), invoiceNumber: z.string(), period: billingPeriodSchema,
  subscriberId: z.uuid(), subscriberAccountNumber: z.string(), subscriberName: z.string(),
  serviceAccountId: z.uuid(), serviceAccountNumber: z.string(), invoiceDate: z.iso.date(), dueDate: z.iso.date(),
  status: invoiceStatusSchema, totalCentavos: centavosSchema, balanceCentavos: centavosSchema,
});
export type InvoiceListItem = z.infer<typeof invoiceListItemSchema>;
export const invoiceListResponseSchema = z.object({
  items: z.array(invoiceListItemSchema), page: z.number().int().positive(), pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(), pageCount: z.number().int().nonnegative(),
});
export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>;

export const invoiceDetailSchema = invoiceListItemSchema.extend({
  finalizedAt: z.iso.datetime(), items: z.array(invoiceItemSchema),
  ledgerEntry: z.object({ id: z.uuid(), referenceNumber: z.string() }).nullable(),
  adjustments: z.array(z.object({ id: z.uuid(), amountCentavos: signedCentavosSchema, reason: z.string(), status: z.enum(['PENDING', 'APPROVED', 'POSTED', 'REJECTED', 'REVERSED']), createdAt: z.iso.datetime() })),
  voidedAt: z.iso.datetime().nullable(), voidReason: z.string().nullable(),
});
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>;

export const postInvoiceAdjustmentSchema = z.object({
  amountCentavos: signedCentavosSchema.refine((value) => value !== '0', 'Adjustment must be nonzero'),
  lineType: z.enum(['INSTALLATION', 'RECONNECTION', 'DISCOUNT', 'PENALTY', 'ADJUSTMENT']),
  reason: z.string().trim().min(8).max(255),
}).superRefine((value, context) => {
  if (value.lineType === 'DISCOUNT' && !value.amountCentavos.startsWith('-')) context.addIssue({ code: 'custom', message: 'A discount must be a credit', path: ['amountCentavos'] });
  if (['INSTALLATION', 'RECONNECTION', 'PENALTY'].includes(value.lineType) && value.amountCentavos.startsWith('-')) context.addIssue({ code: 'custom', message: 'This charge must be a debit', path: ['amountCentavos'] });
});
export type PostInvoiceAdjustment = z.infer<typeof postInvoiceAdjustmentSchema>;
export const voidInvoiceSchema = z.object({ reason: z.string().trim().min(8).max(255) }).strict();
export type VoidInvoice = z.infer<typeof voidInvoiceSchema>;
export const processOverdueSchema = z.object({ asOf: z.iso.date() }).strict();
export type ProcessOverdue = z.infer<typeof processOverdueSchema>;
export const invoiceMutationResultSchema = z.object({ invoiceId: z.uuid(), status: invoiceStatusSchema, balanceCentavos: centavosSchema });
export type InvoiceMutationResult = z.infer<typeof invoiceMutationResultSchema>;
export const overdueResultSchema = z.object({ asOf: z.iso.date(), invoicesMarkedOverdue: z.number().int().nonnegative() });
export type OverdueResult = z.infer<typeof overdueResultSchema>;

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
export const subscriberLedgerQuerySchema = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }).strict().superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) context.addIssue({ code: 'custom', message: 'Ledger date range is invalid', path: ['to'] });
});
export type SubscriberLedgerQuery = z.infer<typeof subscriberLedgerQuerySchema>;
export const subscriberLedgerSchema = z.object({
  subscriberId: z.uuid(), from: z.iso.date().nullable(), to: z.iso.date().nullable(),
  openingBalanceCentavos: signedCentavosSchema, entries: z.array(ledgerEntrySchema), closingBalanceCentavos: signedCentavosSchema,
});
export type SubscriberLedger = z.infer<typeof subscriberLedgerSchema>;
