import { z } from 'zod';

export const backupRecordSchema = z.object({
  id: z.uuid(), status: z.enum(['STARTED', 'COMPLETED', 'VERIFIED', 'FAILED', 'RESTORED']),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), sizeBytes: z.string().regex(/^\d+$/).nullable(),
  startedAt: z.iso.datetime(), completedAt: z.iso.datetime().nullable(), verifiedAt: z.iso.datetime().nullable(),
  restoredAt: z.iso.datetime().nullable(), errorCode: z.string().nullable(),
});
export const backupListSchema = z.object({ items: z.array(backupRecordSchema) });
export const backupCreatedSchema = z.object({ id: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.string().regex(/^\d+$/), status: z.literal('VERIFIED'), createdAt: z.iso.datetime() });
export const restoreApprovalInputSchema = z.object({ backupId: z.uuid(), reason: z.string().trim().min(10).max(255), confirmation: z.literal('RESTORE') }).strict();
export const restoreApprovalSchema = z.object({ status: z.literal('MAINTENANCE_REQUIRED'), backupId: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/), approvedBy: z.string(), approvedAt: z.iso.datetime(), instructions: z.string() }).strict();
export type BackupList = z.infer<typeof backupListSchema>;
export type BackupCreated = z.infer<typeof backupCreatedSchema>;
export type RestoreApprovalInput = z.infer<typeof restoreApprovalInputSchema>;
export type RestoreApproval = z.infer<typeof restoreApprovalSchema>;
