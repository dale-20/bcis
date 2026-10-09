import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnvironment } from '../config.js';
import { createDatabase } from './client.js';

const database = createDatabase(loadEnvironment());
try {
  await migrate(database.db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
  console.log('Database migrations applied.');
} catch {
  console.error('Migration failed. Check DATABASE_URL, database availability, and migration history.');
  process.exitCode = 1;
} finally {
  await database.close();
}
