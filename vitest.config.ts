import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.{ts,tsx}'],
    exclude: ['**/*.integration.test.ts'],
    environment: 'node',
    clearMocks: true,
    testTimeout: 10000,
  },
});
