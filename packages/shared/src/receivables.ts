import { z } from 'zod';
import { centavosSchema } from './money.js';

export const agingBucketSchema = z.enum(['CURRENT', '1_30', '31_60', '61_90', '90_PLUS']);
export type AgingBucket = z.infer<typeof agingBucketSchema>;
const agingBucketLabels: Record<AgingBucket, string> = {
  CURRENT: 'Current',
  '1_30': '1–30',
  '31_60': '31–60',
  '61_90': '61–90',
  '90_PLUS': '90+',
};
export function receivableAgingBucketLabel(bucket: AgingBucket): string {
  return agingBucketLabels[bucket];
}
export const receivableAgingQuerySchema = z.object({
  asOf: z.iso.date(), overdueOnly: z.boolean().default(false), collectorId: z.uuid().optional(), collectionAreaId: z.uuid().optional(),
  page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25),
}).strict();
export type ReceivableAgingQuery = z.infer<typeof receivableAgingQuerySchema>;
export const receivableAgingRowSchema = z.object({
  invoiceId: z.uuid(), invoiceNumber: z.string(), subscriberId: z.uuid(), accountNumber: z.string(), subscriberName: z.string(),
  serviceAccountNumber: z.string(), dueDate: z.iso.date(), daysOverdue: z.number().int().nonnegative(), bucket: agingBucketSchema,
  balanceCentavos: centavosSchema, collectorId: z.uuid().nullable(), collectorName: z.string().nullable(), collectionAreaId: z.uuid().nullable(), collectionAreaName: z.string().nullable(),
});
export const receivableAgingResponseSchema = z.object({
  asOf: z.iso.date(), overdueOnly: z.boolean(), page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(),
  totals: z.object({ CURRENT: centavosSchema, '1_30': centavosSchema, '31_60': centavosSchema, '61_90': centavosSchema, '90_PLUS': centavosSchema, total: centavosSchema }),
  rows: z.array(receivableAgingRowSchema),
});
export type ReceivableAgingResponse = z.infer<typeof receivableAgingResponseSchema>;
