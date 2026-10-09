import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { healthSchema, readinessSchema, type Readiness } from '@bcis/shared';

interface AppOptions {
  probeDatabase: () => Promise<Readiness['database']>;
  closeDatabase?: () => Promise<void>;
  logLevel?: string;
}

export async function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: options.logLevel === 'silent' ? false : {
      level: options.logLevel ?? 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
    bodyLimit: 1_048_576,
    requestTimeout: 5000,
  });
  await app.register(helmet);
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
  app.setErrorHandler((_error, request, reply) => {
    request.log.error({ requestId: request.id }, 'Request failed');
    void reply.code(500).send({ error: 'Internal server error', requestId: request.id });
  });
  if (options.closeDatabase) app.addHook('onClose', options.closeDatabase);
  return app;
}
