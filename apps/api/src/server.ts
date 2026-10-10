import { buildApp } from './app.js';
import { dirname, resolve } from 'node:path';
import { apiEnvPath, loadEnvironment } from './config.js';
import { createDatabase } from './db/client.js';
import { GcashProofStorage } from './payments/proof-storage.js';
import { BackupService } from './system/backup-service.js';

async function start() {
  const environment = loadEnvironment();
  const database = createDatabase(environment);
  const proofStorage = new GcashProofStorage(resolve(dirname(apiEnvPath), environment.PAYMENT_PROOF_DIR));
  let shutdown = () => {};
  const app = await buildApp({
    probeDatabase: database.probe, closeDatabase: database.close, logLevel: environment.LOG_LEVEL, database,
    proofStorage,
    backupService: new BackupService({
      database,
      proofStorage,
      databaseUrl: environment.DATABASE_URL,
      directory: resolve(dirname(apiEnvPath), environment.BACKUP_DIR),
      ...(environment.PG_BIN ? { pgBin: environment.PG_BIN } : {}),
      ...(environment.TAR_BIN ? { tarBin: environment.TAR_BIN } : {}),
    }),
    scheduleShutdown: () => shutdown(),
  });
  shutdown = () => { void app.close().catch(() => { process.exitCode = 1; }); };
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
