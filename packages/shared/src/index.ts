import { z } from 'zod';

export const SCHEMA_VERSION = 1;
export const HEALTH_CHANNEL = 'bcis:connection:get';

// Integer centavos travel as strings so JSON never rounds authoritative amounts.
export const centavosSchema = z.string().max(19).regex(/^(0|[1-9]\d*)$/)
  .pipe(z.string().refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n, 'Amount exceeds PostgreSQL bigint range'));

export const apiUrlSchema = z.url().pipe(z.string().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
    && url.pathname === '/' && !url.search && !url.hash;
}, 'Use an HTTP(S) origin without credentials, path, query, or fragment'));

export const healthSchema = z.object({
  service: z.literal('bcis-api'),
  status: z.literal('ok'),
  timestamp: z.iso.datetime(),
});

export const readinessSchema = z.object({
  service: z.literal('bcis-api'),
  status: z.enum(['ready', 'degraded']),
  database: z.enum(['connected', 'unavailable', 'migration_required']),
  timestamp: z.iso.datetime(),
}).superRefine((value, context) => {
  if ((value.status === 'ready') !== (value.database === 'connected')) {
    context.addIssue({ code: 'custom', message: 'Readiness must match database state' });
  }
});
export type Readiness = z.infer<typeof readinessSchema>;

export const connectionResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), endpoint: apiUrlSchema, health: readinessSchema }),
  z.object({ ok: z.literal(false), endpoint: apiUrlSchema, reason: z.enum(['unreachable', 'invalid_response']) }),
]);
export type ConnectionResult = z.infer<typeof connectionResultSchema>;
export interface DesktopBridge {
  getConnection: () => Promise<ConnectionResult>;
}
