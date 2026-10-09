import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const apiEnvPath = fileURLToPath(new URL('../.env', import.meta.url));
export const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.url().pipe(z.string().refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol))),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});
export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(): Environment {
  config({ path: apiEnvPath, quiet: true });
  const result = environmentSchema.safeParse(process.env);
  if (!result.success) {
    // Never include supplied values (especially connection passwords) in errors.
    throw new Error(`Invalid environment: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  return result.data;
}
