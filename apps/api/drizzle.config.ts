import { defineConfig } from 'drizzle-kit';

// Generate is offline. Applying migrations uses the validated API environment.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});
