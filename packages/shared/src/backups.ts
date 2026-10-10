import { z } from 'zod';

export const backupRecordSchema = z.object({
  id: z.uuid(), status: z.enum(['STARTED', 'COMPLETED', 'VERIFIED', 'FAILED', 'RESTORED']),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), sizeBytes: z.string().regex(/^\d+$/).nullable(),
  startedAt: z.iso.datetime(), completedAt: z.iso.datetime().nullable(), verifiedAt: z.iso.datetime().nullable(),
  restoredAt: z.iso.datetime().nullable(), errorCode: z.string().nullable(),
});
export const backupListSchema = z.object({ items: z.array(backupRecordSchema) });
export const backupCreatedSchema = z.object({ id: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.string().regex(/^\d+$/), status: z.literal('VERIFIED'), createdAt: z.iso.datetime() });
export type BackupList = z.infer<typeof backupListSchema>;
export type BackupCreated = z.infer<typeof backupCreatedSchema>;
