import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/api/test/**/*.integration.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
