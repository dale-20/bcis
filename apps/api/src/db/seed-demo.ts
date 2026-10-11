import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { seedAuthorization } from '../auth/seed.js';
import { apiEnvPath, loadEnvironment } from '../config.js';
import { createDatabase } from './client.js';
import { seedOperationalDemoData } from './seed-operational.js';
import { seedDemoWorkflowData } from './seed-workflows.js';

config({ path: apiEnvPath, quiet: true });
const seedEnvironment = z.object({
  NODE_ENV: z.enum(['development', 'test']).default('development'),
  DEMO_ACCOUNT_PASSWORD: z.string().min(8).max(128),
}).parse(process.env);
const environment = loadEnvironment();
const database = createDatabase(environment);

try {
  await seedAuthorization(database, seedEnvironment.DEMO_ACCOUNT_PASSWORD);
  await seedOperationalDemoData(database);
  const workflowSeeded = await seedDemoWorkflowData(database, resolve(dirname(apiEnvPath), environment.PAYMENT_PROOF_DIR));
  console.log(workflowSeeded
    ? 'Seeded seven demo accounts and synthetic subscriber, billing, payment, collection, and service-control workflows.'
    : 'Demo accounts and operational records refreshed; synthetic workflow data was already seeded.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Demo authorization seed failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
