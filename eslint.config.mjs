import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/out/**', '**/drizzle/meta/**', '.local/**', 'tmp/**', 'test-results/**', 'playwright-report/**', '.impeccable/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'], plugins: { 'react-hooks': reactHooks }, rules: reactHooks.configs.recommended.rules },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}', 'packages/shared/src/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['node:*', 'pg', 'drizzle-orm*', 'electron', '**/api/**'] }] },
  },
);
