import { z } from 'zod';

export const usernameSchema = z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/);
export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(256),
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(128),
}).strict().superRefine((value, context) => {
  if (Buffer.byteLength(value.newPassword, 'utf8') > 128) {
    context.addIssue({ code: 'custom', path: ['newPassword'], message: 'Password exceeds 128 UTF-8 bytes' });
  }
});

export const managedUserSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(['OWNER', 'ADMIN', 'CASHIER', 'COLLECTION_SUPERVISOR', 'AUDITOR', 'TECHNICIAN', 'VIEWER']),
  password: z.string().min(8).max(128),
}).strict();

export const managedUserUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['OWNER', 'ADMIN', 'CASHIER', 'COLLECTION_SUPERVISOR', 'AUDITOR', 'TECHNICIAN', 'VIEWER']).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

export const userPasswordResetSchema = z.object({ password: z.string().min(8).max(128) }).strict();

export const demoPasswordSchema = z.string().min(8).max(128).superRefine((value, context) => {
  if (Buffer.byteLength(value, 'utf8') > 128) context.addIssue({ code: 'custom', message: 'Password exceeds 128 UTF-8 bytes' });
});

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
