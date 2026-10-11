import { test, expect, _electron as electron, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';
import type { MascotEvent } from '../../apps/desktop/src/renderer/src/features/mascot/mascot-events';

config({ path: 'apps/api/.env', quiet: true });
const require = createRequire(import.meta.url);

function runNode(script: string, environment: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { env: environment, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`)));
  });
}

async function availableLocalPort(): Promise<number> {
  const socket = createNetServer();
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local API port');
  await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

// These are renderer feedback checks, not evidence of a financial posting.
// The existing desktop workflow and PostgreSQL suites verify real posting.
async function announce(page: Page, type: MascotEvent) {
  await page.evaluate((eventType) => window.dispatchEvent(new CustomEvent('bcis:mascot-event', {
    detail: { type: eventType, eventId: crypto.randomUUID() },
  })), type);
}

test('Buddy displays messages, replays motion, and respects reduced motion in built Electron', async () => {
  test.setTimeout(90_000);
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test') || databaseUrl === process.env.DATABASE_URL) {
    throw new Error('A separate migrated TEST_DATABASE_URL ending in _test is required. Run integration tests first.');
  }
  const profile = await mkdtemp(path.join(tmpdir(), 'bcis-buddy-e2e-'));
  // Own a fresh database so this test never reseeds another test's staff passwords.
  const databaseName = `bcis_buddy_${process.pid}_${Date.now()}_test`;
  const testUrl = new URL(databaseUrl);
  testUrl.pathname = `/${databaseName}`;
  const manager = new pg.Client({ connectionString: databaseUrl });
  const port = await availableLocalPort();
  const endpoint = `http://127.0.0.1:${port}`;
  const password = 'Synthetic-buddy-test-1';
  const environment = { ...process.env, DATABASE_URL: testUrl.href, NODE_ENV: 'test', DEMO_ACCOUNT_PASSWORD: password, PAYMENT_PROOF_DIR: path.join(profile, 'proofs') };
  let server: ReturnType<typeof spawn> | undefined;
  let databaseCreated = false;
  let desktop: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    await manager.connect();
    // PostgreSQL identifiers cannot be query parameters; this name uses only fixed text and numeric process/time values.
    await manager.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    await runNode('apps/api/dist/db/migrate.js', environment);
    await runNode('apps/api/dist/db/seed-demo.js', environment);
    server = spawn(process.execPath, ['apps/api/dist/server.js'], {
      env: { ...environment, API_HOST: '127.0.0.1', API_PORT: String(port), LOG_LEVEL: 'silent' },
      stdio: 'ignore', windowsHide: true,
    });
    await expect.poll(async () => { try { return (await fetch(`${endpoint}/health/ready`)).status; } catch { return 0; } }, { timeout: 20_000, intervals: [250, 500, 1_000] }).toBe(200);
    const seededLogin = await fetch(`${endpoint}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin.demo', password }),
    });
    expect(seededLogin.status).toBe(200);
    const desktopEnvironment: Record<string, string> = { BCIS_API_URL: endpoint };
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'BCIS_API_URL'].includes(key)) desktopEnvironment[key] = value;
    }
    desktop = await electron.launch({ executablePath: require('electron') as string, args: [path.resolve('apps/desktop'), `--user-data-dir=${profile}`], env: desktopEnvironment });
    const page = await desktop.firstWindow();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByLabel('Username').fill('admin.demo');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Welcome back!', { exact: true })).toBeVisible();
    await expect(page.locator('.mascot-art.anim-idle')).toBeVisible();

    const talk = page.getByRole('button', { name: 'Talk to BCIS Buddy' });
    await talk.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('I react to confirmed actions and stay quiet while you work.')).toBeVisible();

    await announce(page, 'payment-error');
    await expect(page.locator('.mascot-art.anim-error')).toBeVisible();
    await expect(page.locator('.mascot-art.anim-idle')).toBeVisible();
    await expect(page.getByText(/Payment could not be confirmed/)).toBeVisible();

    await announce(page, 'connection-lost');
    await expect(page.getByText('Connection to the office server was lost.')).toBeVisible();
    await announce(page, 'connection-restored');
    await expect(page.getByText('Connection restored.')).toBeVisible();

    await announce(page, 'payment-posted');
    const body = page.locator('.mascot-art .buddy-body');
    await expect(body).toHaveCSS('animation-name', 'buddy-finish');
    await expect.poll(() => body.evaluate((element) => Number(element.getAnimations()[0]?.currentTime ?? 0)), { intervals: [50], timeout: 2_000 }).toBeGreaterThan(300);
    await announce(page, 'payment-posted');
    await expect.poll(() => body.evaluate((element) => Number(element.getAnimations()[0]?.currentTime ?? 0)), { intervals: [20, 50, 100], timeout: 1_000 }).toBeLessThan(300);
    await expect(page.getByText('Payment recorded successfully!')).toBeVisible();
    await page.screenshot({ path: 'test-results/buddy-message.png' });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(body).toHaveCSS('animation-name', 'none');
    await expect(page.getByText('Payment recorded successfully!')).toBeVisible();

    await page.getByRole('button', { name: 'Minimize BCIS Buddy' }).click();
    await page.getByRole('button', { name: 'Show BCIS Buddy' }).click();
    await announce(page, 'report-start');
    await announce(page, 'report-canceled');
    await expect(page.getByText('Export canceled. No file was saved.')).toBeVisible();
    await expect(page.locator('.mascot-art.anim-processing')).toHaveCount(0);

    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 640));
    const buddy = page.getByRole('region', { name: 'BCIS Buddy companion' });
    await expect.poll(async () => {
      const bounds = await buddy.boundingBox();
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      return Boolean(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
    }).toBe(true);
    await page.screenshot({ path: 'test-results/buddy-small-window.png' });
  } finally {
    await desktop?.close();
    server?.kill();
    if (databaseCreated) await manager.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await manager.end();
    await rm(profile, { recursive: true, force: true });
  }
});
