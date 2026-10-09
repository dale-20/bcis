import { test, expect, _electron as electron } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

const require = createRequire(import.meta.url);
config({ path: 'apps/api/.env', quiet: true });

test('built Electron shell connects to real API/PostgreSQL, reports failures, and keeps a narrow bridge', async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test') || databaseUrl === process.env.DATABASE_URL) {
    throw new Error('A separate migrated TEST_DATABASE_URL ending in _test is required. Run integration tests first.');
  }
  const endpoint = 'http://127.0.0.1:3101';
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
    await expect(page.getByRole('heading', { name: 'Connected to BCIS' })).toBeVisible();
    expect(await page.evaluate(() => ({ bridge: Object.keys(window.bcis ?? {}), node: 'require' in window, process: 'process' in window }))).toEqual({ bridge: ['getConnection'], node: false, process: false });
    const preferences = await desktop.evaluate(({ BrowserWindow }) => {
      // Electron exposes this diagnostic at runtime but not in its public type declarations.
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
    await page.screenshot({ path: 'test-results/desktop-connected.png' });
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 640));
    await page.screenshot({ path: 'test-results/desktop-minimum-size.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await database.query('UPDATE application_metadata SET schema_version = 2');
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByText('Migration required', { exact: true })).toBeVisible();
    await database.query('UPDATE application_metadata SET schema_version = 1');
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByRole('heading', { name: 'Connected to BCIS' })).toBeVisible();
    server.kill();
    await expect.poll(async () => { try { await fetch(`${endpoint}/health`); return false; } catch { return true; } }).toBe(true);
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByRole('heading', { name: 'Unable to reach BCIS' })).toBeVisible();
    await page.screenshot({ path: 'test-results/desktop-disconnected.png' });
    expect(pageErrors).toEqual([]);
  } finally {
    await database.query('UPDATE application_metadata SET schema_version = 1');
    await database.end();
    await desktop?.close();
    server.kill();
  }
});
