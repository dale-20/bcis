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

export const demoPasswordSchema = z.string().min(8).max(128).superRefine((value, context) => {
  if (Buffer.byteLength(value, 'utf8') > 128) context.addIssue({ code: 'custom', message: 'Password exceeds 128 UTF-8 bytes' });
});

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
