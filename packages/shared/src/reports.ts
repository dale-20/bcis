import { z } from 'zod';
import { centavosSchema, signedCentavosSchema } from './money.js';

export const reportKindSchema = z.enum(['DAILY_COLLECTIONS', 'WEEKLY_COLLECTIONS', 'MONTHLY_COLLECTIONS', 'ANNUAL_COLLECTIONS', 'BILLING_VS_COLLECTION', 'REVENUE_BY_PLAN', 'REVENUE_BY_SERVICE', 'REVENUE_BY_AREA', 'SUBSCRIBER_MASTER_LIST', 'PAYMENT_METHODS', 'OUTSTANDING_BALANCES', 'AR_AGING', 'SUBSCRIBER_STATEMENT', 'COLLECTOR_REMITTANCE', 'COLLECTOR_ASSIGNMENTS', 'USER_ACTIVITY', 'BILLING_ADJUSTMENTS', 'PAYMENT_REVERSALS', 'VOIDED_RECEIPTS', 'COLLECTION_BATCH_LIST', 'INVOICE_LIST', 'PAYMENT_LIST', 'SERVICE_CONTROL_ACCOUNTS', 'RECEIVABLE_AGING_LIST']);
export const reportFormatSchema = z.enum(['PDF', 'XLSX']);
export const reportRequestSchema = z.object({
  report: reportKindSchema,
  from: z.iso.date(),
  to: z.iso.date(),
  subscriberId: z.uuid().optional(),
  collectorId: z.uuid().optional(),
  batchQuery: z.string().trim().max(100).optional(),
  batchStatus: z.enum(['OPEN', 'IN_PROGRESS', 'SUBMITTED', 'REMITTED', 'RECONCILED', 'CLOSED']).optional(),
  collectionAreaId: z.uuid().optional(),
  batchSort: z.enum(['date', 'batch', 'collector', 'area', 'status', 'amount']).optional(),
  batchDirection: z.enum(['asc', 'desc']).optional(),
  invoiceQuery: z.string().trim().max(100).optional(),
  invoicePeriod: z.union([z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/), z.literal('ALL')]).optional(),
  invoiceStatus: z.enum(['ALL', 'DRAFT', 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID', 'CREDITED']).optional(),
  invoiceDueFrom: z.iso.date().optional(),
  invoiceDueTo: z.iso.date().optional(),
  invoiceMinAmountCentavos: centavosSchema.optional(),
  invoiceMaxAmountCentavos: centavosSchema.optional(),
  invoiceSort: z.enum(['invoiceDate', 'invoice', 'subscriber', 'service', 'dueDate', 'status', 'total', 'balance']).optional(),
  invoiceDirection: z.enum(['asc', 'desc']).optional(),
  paymentQuery: z.string().trim().max(100).optional(),
  paymentMethod: z.enum(['ALL', 'CASH', 'GCASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']).optional(),
  paymentStatus: z.enum(['ALL', 'PENDING_VERIFICATION', 'POSTED', 'REJECTED', 'REVERSED']).optional(),
  paymentSort: z.enum(['date', 'subscriber', 'receipt', 'status', 'amount']).optional(),
  paymentDirection: z.enum(['asc', 'desc']).optional(),
  serviceControlAsOf: z.iso.date().optional(),
  serviceControlOverdueOnly: z.enum(['true', 'false']).optional(),
  serviceControlQuery: z.string().trim().max(100).optional(),
  serviceControlCollectorId: z.uuid().optional(),
  serviceControlAreaId: z.uuid().optional(),
  serviceControlPlanId: z.uuid().optional(),
  serviceControlTypeId: z.uuid().optional(),
  serviceControlBucket: z.enum(['CURRENT', '1_30', '31_60', '61_90', '90_PLUS']).optional(),
  serviceControlSort: z.enum(['priority', 'subscriber', 'account', 'oldestDueDate', 'daysOverdue', 'monthsUnpaid', 'arrears']).optional(),
  serviceControlDirection: z.enum(['asc', 'desc']).optional(),
  agingAsOf: z.iso.date().optional(),
  agingOverdueOnly: z.enum(['true', 'false']).optional(),
  agingQuery: z.string().trim().max(100).optional(),
  agingCollectorId: z.uuid().optional(),
  agingAreaId: z.uuid().optional(),
  agingSort: z.enum(['dueDate', 'subscriber', 'account', 'service', 'daysOverdue', 'balance']).optional(),
  agingDirection: z.enum(['asc', 'desc']).optional(),
}).strict().superRefine((value, context) => {
  if (value.from > value.to) context.addIssue({ code: 'custom', path: ['to'], message: 'End date must be on or after start date' });
  if (value.report === 'SUBSCRIBER_STATEMENT' && !value.subscriberId) context.addIssue({ code: 'custom', path: ['subscriberId'], message: 'Subscriber is required' });
  if (value.report !== 'COLLECTION_BATCH_LIST' && (value.batchQuery !== undefined || value.batchStatus !== undefined || value.collectionAreaId !== undefined || value.batchSort !== undefined || value.batchDirection !== undefined)) context.addIssue({ code: 'custom', path: ['report'], message: 'Batch filters only apply to collection batch exports' });
  if (value.report !== 'INVOICE_LIST' && Object.keys(value).some((key) => key.startsWith('invoice'))) context.addIssue({ code: 'custom', path: ['report'], message: 'Invoice filters only apply to invoice list exports' });
  if (value.invoiceDueFrom && value.invoiceDueTo && value.invoiceDueFrom > value.invoiceDueTo) context.addIssue({ code: 'custom', path: ['invoiceDueTo'], message: 'Invoice due date range is invalid' });
  if (value.invoiceMinAmountCentavos && value.invoiceMaxAmountCentavos && BigInt(value.invoiceMinAmountCentavos) > BigInt(value.invoiceMaxAmountCentavos)) context.addIssue({ code: 'custom', path: ['invoiceMaxAmountCentavos'], message: 'Invoice amount range is invalid' });
  if (value.report !== 'PAYMENT_LIST' && Object.keys(value).some((key) => key.startsWith('payment'))) context.addIssue({ code: 'custom', path: ['report'], message: 'Payment filters only apply to payment list exports' });
  if (value.report === 'SERVICE_CONTROL_ACCOUNTS' && !value.serviceControlAsOf) context.addIssue({ code: 'custom', path: ['serviceControlAsOf'], message: 'An as-of date is required for service-control exports' });
  if (value.report !== 'SERVICE_CONTROL_ACCOUNTS' && Object.keys(value).some((key) => key.startsWith('serviceControl'))) context.addIssue({ code: 'custom', path: ['report'], message: 'Service-control filters only apply to service-control exports' });
  if (value.report === 'RECEIVABLE_AGING_LIST' && !value.agingAsOf) context.addIssue({ code: 'custom', path: ['agingAsOf'], message: 'An as-of date is required for receivable-aging exports' });
  if (value.report !== 'RECEIVABLE_AGING_LIST' && Object.keys(value).some((key) => key.startsWith('aging'))) context.addIssue({ code: 'custom', path: ['report'], message: 'Aging filters only apply to receivable-aging exports' });
});
export type ReportRequest = z.infer<typeof reportRequestSchema>;
export type ReportKind = z.infer<typeof reportKindSchema>;

export const reportColumnSchema = z.object({ key: z.string(), label: z.string(), align: z.enum(['left', 'right']).default('left') });
export const reportDataSchema = z.object({
  report: reportKindSchema,
  title: z.string(), subtitle: z.string(), generatedAt: z.iso.datetime(),
  columns: z.array(reportColumnSchema),
  rows: z.array(z.record(z.string(), z.string())),
  totals: z.array(z.object({ label: z.string(), value: z.string() })),
});
export type ReportData = z.infer<typeof reportDataSchema>;

const calendarDayNumber = (value: string) => Date.parse(`${value}T00:00:00.000Z`);

export const dashboardQuerySchema = z.object({ from: z.iso.date(), to: z.iso.date() }).strict().superRefine((value, context) => {
  if (value.from > value.to) context.addIssue({ code: 'custom', path: ['to'], message: 'End date must be on or after start date' });
  else if ((calendarDayNumber(value.to) - calendarDayNumber(value.from)) / 86_400_000 > 366) context.addIssue({ code: 'custom', path: ['to'], message: 'Dashboard date range cannot exceed 367 calendar days' });
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export const dashboardSchema = z.object({
  range: z.object({ from: z.iso.date(), to: z.iso.date() }),
  billedCentavos: centavosSchema, collectedCentavos: centavosSchema, outstandingCentavos: centavosSchema, overdueCentavos: centavosSchema,
  overdueInvoiceCount: z.number().int().nonnegative(), overdueSubscriberCount: z.number().int().nonnegative(),
  activeSubscribers: z.number().int().nonnegative(), postedPaymentCount: z.number().int().nonnegative(),
  monthlyCollections: z.array(z.object({ month: z.string(), amountCentavos: centavosSchema, billedCentavos: centavosSchema, count: z.number().int().nonnegative() })),
  paymentMethods: z.array(z.object({ method: z.string(), amountCentavos: centavosSchema, count: z.number().int().nonnegative() })),
  collectorPerformance: z.array(z.object({ collectorId: z.uuid(), collectorName: z.string(), assignedAccounts: z.number().int().nonnegative(), collectedAccounts: z.number().int().nonnegative(), amountCentavos: centavosSchema, varianceCentavos: signedCentavosSchema })),
  aging: z.object({ CURRENT: centavosSchema, '1_30': centavosSchema, '31_60': centavosSchema, '61_90': centavosSchema, '90_PLUS': centavosSchema }),
  recentPayments: z.array(z.object({ id: z.uuid(), receiptNumber: z.string(), subscriberName: z.string(), method: z.string(), amountCentavos: centavosSchema, paymentDate: z.iso.datetime() })),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export const serviceHistorySchema = z.object({
  subscriberId: z.uuid(),
  events: z.array(z.object({
    id: z.uuid(), serviceAccountNumber: z.string(), type: z.enum(['SUSPENSION', 'RECONNECTION']),
    status: z.string(), occurredOn: z.string(), reason: z.string().nullable(), notes: z.string().nullable(), feeCentavos: centavosSchema.nullable(),
  })),
});
export type ServiceHistory = z.infer<typeof serviceHistorySchema>;

export const exportResultSchema = z.object({ saved: z.boolean(), filename: z.string().optional() });
export type ExportResult = z.infer<typeof exportResultSchema>;
