import { test, expect, _electron as electron } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

const require = createRequire(import.meta.url);
config({ path: 'apps/api/.env', quiet: true });

function runNode(script: string, environment: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { env: environment, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with code ${code}`)));
  });
}

test('built Electron subscriber workflow uses real API/PostgreSQL and keeps a narrow bridge', async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test') || databaseUrl === process.env.DATABASE_URL) {
    throw new Error('A separate migrated TEST_DATABASE_URL ending in _test is required. Run integration tests first.');
  }
  const endpoint = 'http://127.0.0.1:3101';
  const seedPassword = 'Synthetic-e2e-password-1';
  await runNode('apps/api/dist/db/seed-demo.js', { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test', DEMO_ACCOUNT_PASSWORD: seedPassword });
  const server = spawn(process.execPath, ['apps/api/dist/server.js'], {
    env: { ...process.env, DATABASE_URL: databaseUrl, API_HOST: '127.0.0.1', API_PORT: '3101', LOG_LEVEL: 'silent' },
    stdio: 'ignore', windowsHide: true,
  });
  const database = new pg.Client({ connectionString: databaseUrl });
  await database.connect();
  let desktop: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    await expect.poll(async () => { try { return (await fetch(`${endpoint}/health/ready`)).status; } catch { return 0; } }).toBe(200);
    const environment: Record<string, string> = { BCIS_API_URL: endpoint };
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE' && key !== 'BCIS_API_URL') environment[key] = value;
    }
    desktop = await electron.launch({ executablePath: require('electron') as string, args: [path.resolve('apps/desktop')], env: environment });
    const page = await desktop.firstWindow();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await expect(page.getByRole('heading', { name: 'Sign in to BCIS' })).toBeVisible();
    await page.getByLabel('Username').fill('admin.demo');
    await page.getByLabel('Password', { exact: true }).fill(seedPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Secure your demo account' })).toBeVisible();
    await page.getByLabel('Current password', { exact: true }).fill(seedPassword);
    await page.getByLabel('New password', { exact: true }).fill('Synthetic-e2e-password-2');
    await page.getByLabel('Confirm new password', { exact: true }).fill('Synthetic-e2e-password-2');
    await page.getByRole('button', { name: 'Update password' }).click();

    await expect(page.getByRole('heading', { name: 'Subscribers' })).toBeVisible();
    await expect(page.getByText('50 subscribers', { exact: false })).toBeVisible();
    await page.getByRole('textbox', { name: 'Search subscribers' }).fill('BCIS-00001');
    await expect(page.getByRole('row', { name: 'Open Amihan Abad' })).toBeVisible();
    await page.getByRole('row', { name: 'Open Amihan Abad' }).click();
    await expect(page.getByRole('heading', { name: 'Amihan Abad' })).toBeVisible();
    await expect(page.getByText('SVC-00001-2')).toBeVisible();
    await page.screenshot({ path: 'test-results/subscriber-profile.png' });
    await page.getByRole('button', { name: 'Back to subscribers' }).click();
    await expect(page.getByRole('button', { name: 'New subscriber' })).toBeVisible();
    await page.getByRole('button', { name: 'New subscriber' }).click();
    await expect(page.getByRole('heading', { name: 'New subscriber' })).toBeVisible();
    await page.screenshot({ path: 'test-results/subscriber-form.png' });
    await page.getByRole('button', { name: 'Back to subscribers' }).click();

    expect(await page.evaluate(() => ({ bridge: Object.keys(window.bcis ?? {}).sort(), node: 'require' in window, process: 'process' in window }))).toEqual({
      bridge: ['changePassword', 'createSubscriber', 'getConnection', 'getReferenceData', 'getSession', 'getSubscriber', 'listSubscribers', 'login', 'logout'].sort(),
      node: false,
      process: false,
    });
    const preferences = await desktop.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents as unknown as { getLastWebPreferences: () => Record<string, unknown> };
      return contents.getLastWebPreferences();
    });
    expect(preferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true });

    await page.evaluate(await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'));
    const violations = await page.evaluate(async () => {
      const axeWindow = window as typeof window & { axe: { run: () => Promise<{ violations: { id: string; impact: string }[] }> } };
      return (await axeWindow.axe.run()).violations.map(({ id, impact }) => ({ id, impact }));
    });
    expect(violations).toEqual([]);
    await page.screenshot({ path: 'test-results/subscriber-directory.png' });
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 640));
    await page.screenshot({ path: 'test-results/subscriber-minimum-size.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole('button', { name: 'System connection' }).click();
    await expect(page.getByRole('heading', { name: 'Connected to BCIS' })).toBeVisible();
    await database.query('UPDATE application_metadata SET schema_version = 99');
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByText('Migration required', { exact: true })).toBeVisible();
    await database.query('UPDATE application_metadata SET schema_version = 3');
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByRole('heading', { name: 'Connected to BCIS' })).toBeVisible();
    server.kill();
    await expect.poll(async () => { try { await fetch(`${endpoint}/health`); return false; } catch { return true; } }).toBe(true);
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByRole('heading', { name: 'Unable to reach BCIS' })).toBeVisible();
    expect(pageErrors).toEqual([]);
  } finally {
    await database.query('UPDATE application_metadata SET schema_version = 3');
    await database.end();
    await desktop?.close();
    server.kill();
  }
});
