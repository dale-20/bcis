import { buildApp } from './app.js';
import { loadEnvironment } from './config.js';
import { createDatabase } from './db/client.js';

async function start() {
  const environment = loadEnvironment();
  const database = createDatabase(environment);
  const app = await buildApp({
    probeDatabase: database.probe, closeDatabase: database.close, logLevel: environment.LOG_LEVEL, database,
  });
  database.pool.on('error', () => app.log.error('Idle database connection failed'));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
  }
  try { await app.listen({ host: environment.API_HOST, port: environment.API_PORT }); }
  catch { await app.close(); throw new Error('API could not bind to the configured host and port'); }
}
start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'API startup failed');
  process.exitCode = 1;
});
