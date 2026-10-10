import { z } from 'zod';
import { centavosSchema } from './money.js';

export const reportKindSchema = z.enum(['MONTHLY_COLLECTIONS', 'PAYMENT_METHODS', 'OUTSTANDING_BALANCES', 'AR_AGING', 'SUBSCRIBER_STATEMENT', 'COLLECTOR_REMITTANCE']);
export const reportFormatSchema = z.enum(['PDF', 'XLSX']);
export const reportRequestSchema = z.object({
  report: reportKindSchema,
  from: z.iso.date(),
  to: z.iso.date(),
  subscriberId: z.uuid().optional(),
  collectorId: z.uuid().optional(),
}).strict().superRefine((value, context) => {
  if (value.from > value.to) context.addIssue({ code: 'custom', path: ['to'], message: 'End date must be on or after start date' });
  if (value.report === 'SUBSCRIBER_STATEMENT' && !value.subscriberId) context.addIssue({ code: 'custom', path: ['subscriberId'], message: 'Subscriber is required' });
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

export const dashboardQuerySchema = z.object({ from: z.iso.date(), to: z.iso.date() }).strict();
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export const dashboardSchema = z.object({
  range: z.object({ from: z.iso.date(), to: z.iso.date() }),
  collectedCentavos: centavosSchema, outstandingCentavos: centavosSchema, overdueCentavos: centavosSchema,
  activeSubscribers: z.number().int().nonnegative(), postedPaymentCount: z.number().int().nonnegative(),
  monthlyCollections: z.array(z.object({ month: z.string(), amountCentavos: centavosSchema, count: z.number().int().nonnegative() })),
  paymentMethods: z.array(z.object({ method: z.string(), amountCentavos: centavosSchema, count: z.number().int().nonnegative() })),
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
