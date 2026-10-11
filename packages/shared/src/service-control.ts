import { z } from 'zod';
import { centavosSchema } from './money.js';
import { agingBucketSchema } from './receivables.js';

export const receivableAccountQuerySchema = z.object({
  asOf: z.iso.date(), overdueOnly: z.boolean().default(false), suspensionCandidates: z.boolean().default(false),
  collectorId: z.uuid().optional(), collectionAreaId: z.uuid().optional(), planId: z.uuid().optional(), serviceTypeId: z.uuid().optional(),
  bucket: agingBucketSchema.optional(), query: z.string().trim().max(100).default(''),
  sort: z.enum(['priority', 'subscriber', 'account', 'oldestDueDate', 'daysOverdue', 'monthsUnpaid', 'arrears']).default('priority'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25),
}).strict();
export type ReceivableAccountQuery = z.infer<typeof receivableAccountQuerySchema>;

export const receivableAccountRowSchema = z.object({
  serviceAccountId: z.uuid(), subscriberId: z.uuid(), subscriberName: z.string(), subscriberAccountNumber: z.string(),
  serviceAccountNumber: z.string(), serviceTypeId: z.uuid(), serviceTypeName: z.string(), planId: z.uuid(), planName: z.string(),
  serviceStatus: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'DISCONNECTED', 'TERMINATED']),
  collectionAreaId: z.uuid().nullable(), collectionAreaName: z.string().nullable(), collectorId: z.uuid().nullable(), collectorName: z.string().nullable(),
  monthsUnpaid: z.number().int().nonnegative(), oldestDueDate: z.iso.date(), lastPaymentDate: z.iso.datetime().nullable(),
  daysOverdue: z.number().int().nonnegative(), bucket: agingBucketSchema, arrearsCentavos: centavosSchema,
});
export const receivableAccountResponseSchema = z.object({
  asOf: z.iso.date(), page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(),
  overdueSubscriberCount: z.number().int().nonnegative(), arrearsCentavos: centavosSchema,
  rows: z.array(receivableAccountRowSchema),
});
export type ReceivableAccountResponse = z.infer<typeof receivableAccountResponseSchema>;

export const serviceControlPolicySchema = z.object({
  gracePeriodDays: z.number().int().min(0).max(365),
  suspensionThresholdDays: z.number().int().min(1).max(730),
  reconnectionFeeCentavos: centavosSchema,
}).strict().refine((value) => value.suspensionThresholdDays >= value.gracePeriodDays, {
  message: 'Suspension threshold must be at least the grace period', path: ['suspensionThresholdDays'],
});
export type ServiceControlPolicy = z.infer<typeof serviceControlPolicySchema>;
export const defaultServiceControlPolicy: ServiceControlPolicy = { gracePeriodDays: 30, suspensionThresholdDays: 90, reconnectionFeeCentavos: '0' };

export const organizationSettingsSchema = z.object({
  companyName: z.string().trim().min(1).max(120),
  companyAddress: z.string().trim().max(240),
  contactNumber: z.string().trim().max(40),
  reportFooter: z.string().trim().max(240),
  defaultBillingDay: z.number().int().min(1).max(28),
  defaultDueDay: z.number().int().min(1).max(31),
}).strict();
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;
export const defaultOrganizationSettings: OrganizationSettings = {
  companyName: 'BCIS', companyAddress: '', contactNumber: '', reportFooter: '', defaultBillingDay: 1, defaultDueDay: 15,
};

export const createSuspensionInputSchema = z.object({
  serviceAccountId: z.uuid(), effectiveDate: z.iso.date(), reason: z.string().trim().min(3).max(255), notes: z.string().trim().max(1000).optional(),
}).strict();
export type CreateSuspensionInput = z.infer<typeof createSuspensionInputSchema>;
export const suspensionRecordSchema = z.object({
  id: z.uuid(), serviceAccountId: z.uuid(), serviceAccountNumber: z.string(), subscriberName: z.string(),
  status: z.enum(['PENDING', 'ACTIVE', 'LIFTED', 'CANCELLED']), reason: z.string(), effectiveDate: z.iso.date(),
  requestedByUserId: z.uuid(), approvedByUserId: z.uuid().nullable(), approvedAt: z.iso.datetime().nullable(), notes: z.string().nullable(),
});
export type SuspensionRecord = z.infer<typeof suspensionRecordSchema>;
export const suspensionListResponseSchema = z.object({ items: z.array(suspensionRecordSchema), page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative() });

export const reconnectionAssignmentSchema = z.object({
  technicianUserId: z.uuid(), scheduledDate: z.iso.date(), notes: z.string().trim().max(1000).optional(),
}).strict();
export type ReconnectionAssignment = z.infer<typeof reconnectionAssignmentSchema>;
export const reconnectionRecordSchema = z.object({
  id: z.uuid(), serviceAccountId: z.uuid(), serviceAccountNumber: z.string(), subscriberId: z.uuid(), subscriberName: z.string(),
  suspensionId: z.uuid().nullable(), status: z.enum(['REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED']),
  feeCentavos: centavosSchema, technicianUserId: z.uuid().nullable(), technicianName: z.string().nullable(),
  requestedAt: z.iso.datetime(), scheduledDate: z.iso.date().nullable(), completedAt: z.iso.datetime().nullable(), notes: z.string().nullable(),
});
export const reconnectionListResponseSchema = z.object({ items: z.array(reconnectionRecordSchema), page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative() });
export type ReconnectionListResponse = z.infer<typeof reconnectionListResponseSchema>;
export const serviceTechnicianSchema = z.object({ id: z.uuid(), displayName: z.string() });
export const serviceTechnicianListSchema = z.array(serviceTechnicianSchema);
