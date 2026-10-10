import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { healthSchema, readinessSchema, type Readiness } from '@bcis/shared';
import { ZodError } from 'zod';
import type { Database } from './db/client.js';
import { AuthService } from './auth/service.js';
import { authPlugin } from './auth/plugin.js';
import { AppError } from './errors.js';
import { subscriberPlugin } from './subscribers/plugin.js';
import { billingPlugin } from './billing/plugin.js';
import { paymentPlugin } from './payments/plugin.js';
import { collectionPlugin } from './collections/plugin.js';
import { receivablePlugin } from './receivables/plugin.js';

interface AppOptions {
  probeDatabase: () => Promise<Readiness['database']>;
  closeDatabase?: () => Promise<void>;
  logLevel?: string;
  database?: Database;
  authService?: AuthService;
}

export async function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: options.logLevel === 'silent' ? false : {
      level: options.logLevel ?? 'info',
      redact: [
        'req.headers.authorization', 'req.headers.cookie', 'req.body.password',
        'req.body.currentPassword', 'req.body.newPassword', 'res.headers["set-cookie"]',
      ],
    },
    bodyLimit: 1_048_576,
    requestTimeout: 5000,
  });
  await app.register(helmet);
  app.decorateRequest('authContext', null);
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/health', async () => healthSchema.parse({
    service: 'bcis-api', status: 'ok', timestamp: new Date().toISOString(),
  }));
  app.get('/health/ready', async (_request, reply) => {
    let database: Readiness['database'];
    try { database = await options.probeDatabase(); }
    catch { database = 'unavailable'; }
    const status = database === 'connected' ? 'ready' : 'degraded';
    reply.code(status === 'ready' ? 200 : 503);
    return readinessSchema.parse({ service: 'bcis-api', status, database, timestamp: new Date().toISOString() });
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      void reply.code(error.statusCode).send({ error: error.code, message: error.message, requestId: request.id });
      return;
    }
    if (error instanceof ZodError || (typeof error === 'object' && error !== null && 'validation' in error)) {
      void reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'Request validation failed', requestId: request.id });
      return;
    }
    request.log.error({ err: error instanceof Error ? error : new Error('Unknown request failure'), requestId: request.id }, 'Request failed');
    void reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error', requestId: request.id });
  });
  const authService = options.authService ?? (options.database ? new AuthService(options.database) : undefined);
  if (authService) {
    await app.register(authPlugin, { authService });
    if (options.database) {
      await app.register(subscriberPlugin, { authService, database: options.database });
      await app.register(billingPlugin, { authService, database: options.database });
      await app.register(paymentPlugin, { authService, database: options.database });
      await app.register(collectionPlugin, { authService, database: options.database });
      await app.register(receivablePlugin, { authService, database: options.database });
    }
  }
  if (options.closeDatabase) app.addHook('onClose', options.closeDatabase);
  return app;
}
