import { config } from 'dotenv';
import { z } from 'zod';
import { seedAuthorization } from '../auth/seed.js';
import { apiEnvPath, loadEnvironment } from '../config.js';
import { createDatabase } from './client.js';
import { seedOperationalDemoData } from './seed-operational.js';

config({ path: apiEnvPath, quiet: true });
const seedEnvironment = z.object({
  NODE_ENV: z.enum(['development', 'test']).default('development'),
  DEMO_ACCOUNT_PASSWORD: z.string().min(12).max(128),
}).parse(process.env);
const database = createDatabase(loadEnvironment());

try {
  await seedAuthorization(database, seedEnvironment.DEMO_ACCOUNT_PASSWORD);
  await seedOperationalDemoData(database);
  console.log('Seeded seven demo accounts and synthetic plans, routes, collectors, subscribers, addresses, and services.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Demo authorization seed failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
