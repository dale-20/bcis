import { test, expect, _electron as electron } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';
import { SCHEMA_VERSION } from '@bcis/shared';

const require = createRequire(import.meta.url);
config({ path: 'apps/api/.env', quiet: true });

function runNode(script: string, environment: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { env: environment, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with code ${code}`)));
  });
}

function pesosFromCentavos(value: string): string {
  const cents = BigInt(value);
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

test('built Electron subscriber workflow uses real API/PostgreSQL and keeps a narrow bridge', async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test') || databaseUrl === process.env.DATABASE_URL) {
    throw new Error('A separate migrated TEST_DATABASE_URL ending in _test is required. Run integration tests first.');
  }
  const endpoint = 'http://127.0.0.1:3101';
  const seedPassword = 'Synthetic-e2e-password-1';
  const proofDirectory = await mkdtemp(path.join(tmpdir(), 'bcis-desktop-gcash-'));
  const proofFile = path.join(proofDirectory, 'synthetic-proof.png');
  await writeFile(proofFile, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nm6kAAAAASUVORK5CYII=', 'base64'));
  const database = new pg.Client({ connectionString: databaseUrl });
  await database.connect();
  await database.query('DROP SCHEMA public CASCADE');
  await database.query('CREATE SCHEMA public');
  await database.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  const testEnvironment = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test', DEMO_ACCOUNT_PASSWORD: seedPassword };
  await runNode('apps/api/dist/db/migrate.js', testEnvironment);
  await runNode('apps/api/dist/db/seed-demo.js', testEnvironment);
  const server = spawn(process.execPath, ['apps/api/dist/server.js'], {
    env: { ...testEnvironment, API_HOST: '127.0.0.1', API_PORT: '3101', LOG_LEVEL: 'silent' },
    stdio: 'ignore', windowsHide: true,
  });
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

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.bcis-mascot')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Mascot preferences' })).toBeVisible();
    await page.getByRole('button', { name: 'Mascot preferences' }).click();
    await expect(page.getByLabel('Buddy enabled')).toBeChecked();
    await expect(page.getByLabel('Animations')).toBeChecked();
    await expect(page.getByLabel('Mascot size')).toHaveValue('small');
    await expect(page.getByLabel('Personality')).toHaveValue('balanced');
    await page.screenshot({ path: 'test-results/mascot-dashboard.png' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', { name: 'Billing', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Payments', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Collections', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Receivables', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Administration', exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/dashboard.png' });
    await page.getByRole('link', { name: 'Subscribers', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Subscribers' })).toBeVisible();
    await expect(page.locator('.bcis-mascot')).toHaveCount(1);
    await expect(page.getByText(/of \d+ subscribers/)).toBeVisible();
    await page.getByRole('textbox', { name: 'Search subscribers' }).fill('BCIS-00001');
    await expect(page.getByRole('row', { name: 'Open Amihan Abad' })).toBeVisible();
    await page.getByRole('row', { name: 'Open Amihan Abad' }).click();
    await expect(page.getByRole('heading', { name: 'Amihan Abad' })).toBeVisible();
    await expect(page.getByText('SVC-00001-2')).toBeVisible();
    await page.getByRole('button', { name: 'Edit subscriber', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit subscriber' })).toBeVisible();
    await page.getByLabel('Notes').fill('Verified through the desktop subscriber workflow.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Verified through the desktop subscriber workflow.')).toBeVisible();
    await page.locator('.service-row').first().getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit service account' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Billing', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();
    await page.getByRole('button', { name: 'Ledger', exact: true }).click();
    await expect(page.getByText('Opening balance', { exact: true })).toBeVisible();
    await expect(page.getByLabel('From', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await page.screenshot({ path: 'test-results/subscriber-profile.png' });
    await page.getByRole('button', { name: 'Back to subscribers' }).click();
    await expect(page.getByRole('button', { name: 'New subscriber' })).toBeVisible();
    await page.getByRole('button', { name: 'New subscriber' }).click();
    await expect(page.getByRole('heading', { name: 'New subscriber' })).toBeVisible();
    await page.screenshot({ path: 'test-results/subscriber-form.png' });
    await page.getByRole('button', { name: 'Back to subscribers' }).click();

    await page.getByRole('link', { name: 'Billing', exact: true }).click();
    await page.getByRole('link', { name: 'Generate Billing', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Generate billing' })).toBeVisible();
    await page.getByLabel('Period').fill('2099-12');
    await expect(page.getByText('Eligible services')).toBeVisible();
    const generateButton = page.getByRole('button', { name: /Generate \d+ invoices/ });
    if (await generateButton.isEnabled().catch(() => false)) {
      await generateButton.click();
      await expect(page.getByText('Billing run completed')).toBeVisible();
    }
    await page.getByRole('link', { name: 'Current Billing', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Current billing' })).toBeVisible();
    await expect(page.getByText('December 2099', { exact: true }).first()).toBeVisible();
    await page.getByRole('link', { name: 'Invoices', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    await page.locator('.invoice-table tbody tr').first().click();
    await expect(page.getByRole('complementary', { name: 'Invoice detail' })).toBeVisible();
    await expect(page.getByText('Line items')).toBeVisible();
    await page.getByLabel('Adjustment type').selectOption('INSTALLATION');
    await page.getByLabel('Amount (PHP)').fill('10.25');
    await page.getByLabel('Reason', { exact: true }).fill('Synthetic E2E setup charge');
    await page.getByRole('button', { name: 'Post adjustment' }).click();
    await expect(page.getByText('Synthetic E2E setup charge')).toBeVisible();
    await page.getByRole('button', { name: 'Close invoice detail' }).click();
    await page.locator('.invoice-table tbody tr').nth(1).click();
    await expect(page.getByRole('button', { name: 'Void untouched invoice' })).toBeVisible();
    await page.getByLabel('Void reason').fill('Synthetic E2E duplicate test invoice');
    await page.getByRole('button', { name: 'Void untouched invoice' }).click();
    await expect(page.locator('.invoice-total').getByText('VOID')).toBeVisible();
    await page.getByRole('button', { name: 'Close invoice detail' }).click();

    await page.getByRole('link', { name: 'Payments', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Receive payment' })).toBeVisible();
    await page.getByLabel('Find subscriber').fill('BCIS-00001');
    await page.locator('.payment-subscriber-results button').first().click();
    await page.getByLabel('Amount received (PHP)').fill('10.00');
    await expect(page.getByRole('heading', { name: 'Allocation preview' })).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Confirm and post' }).click();
    await expect(page.getByRole('heading', { name: /Receipt OR-/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print receipt' })).toBeEnabled();
    await desktop.evaluate(({ dialog }, selectedFile) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedFile] });
    }, proofFile);
    await page.getByRole('link', { name: 'Payments', exact: true }).click();
    await page.getByLabel('Find subscriber').fill('BCIS-00001');
    await page.locator('.payment-subscriber-results button').first().click();
    await page.getByLabel('Payment method').selectOption('GCASH');
    await page.getByLabel('Amount received (PHP)').fill('0.05');
    await page.getByLabel('GCash reference number').fill(`E2E-GCASH-${Date.now()}`);
    await page.getByLabel('Sender details').fill('Synthetic E2E Sender');
    await page.getByRole('button', { name: 'Choose proof file' }).click();
    await expect(page.getByText('synthetic-proof.png')).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Submit for verification' }).click();
    await expect(page.getByText(/GCash submission saved as pending/)).toBeVisible();
    await page.getByRole('link', { name: 'GCash Verification', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'GCash verification' })).toBeVisible();
    await page.locator('.gcash-queue-list button').filter({ hasText: 'BCIS-00001' }).first().click();
    await expect(page.locator('.gcash-proof-preview img')).toBeVisible();
    await page.getByLabel('Review decision').selectOption('VERIFIED');
    await page.getByRole('button', { name: 'Verify and post payment' }).click();
    await expect(page.locator('.gcash-queue-list button').filter({ hasText: 'BCIS-00001' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Payment History' }).click();
    await expect(page.getByRole('heading', { name: 'Payment history' })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    await page.locator('.payment-history-table tbody tr').first().click();
    await expect(page.getByText('Immutable payment record')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print receipt' })).toBeVisible();

    await page.getByRole('link', { name: 'Services', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Services & plans' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New plan' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Edit service plan' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('link', { name: 'Collections', exact: true }).click();
    await page.getByRole('link', { name: 'Collectors', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Collectors' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New collector' })).toBeVisible();
    await page.getByRole('link', { name: 'Areas & Routes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Areas & routes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New area' })).toBeVisible();
    await page.getByRole('link', { name: 'Collection Batches', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Collection batches' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent route batches' })).toBeVisible();
    await expect(page.getByText(/total · showing page 1 of/)).toBeVisible();
    expect(await page.evaluate(() => ({ bridge: Object.keys(window.bcis ?? {}).sort(), node: 'require' in window, process: 'process' in window }))).toEqual({
      bridge: ['approveSuspension', 'assignReconnection', 'changeCollectionAreaStatus', 'changeCollectorStatus', 'changePassword', 'changeServiceAccountStatus', 'changeServicePlanStatus', 'changeSubscriberStatus', 'closeCollectionBatch', 'completeReconnection', 'createCollectionArea', 'createCollectionBatch', 'createCollector', 'createManagedUser', 'createServiceAccount', 'createServicePlan', 'createSubscriber', 'createSuspension', 'exportReport', 'generateBilling', 'getBillingCycle', 'getCollectionBatch', 'getCollectionReferences', 'getConnection', 'getDashboard', 'getEligibleCollectionPayments', 'getGcashProof', 'getInvoice', 'getOrganizationSettings', 'getPayment', 'getReceivableAccounts', 'getReceivableAging', 'getReferenceData', 'getReport', 'getServiceControlPolicy', 'getServiceHistory', 'getServicePlans', 'getSession', 'getSubscriber', 'getSubscriberAudit', 'getSubscriberFinancialProfile', 'getSubscriberLedger', 'listBillingCycles', 'listCollectionBatches', 'listGcashProofs', 'listInvoices', 'listManagedUsers', 'listMyReconnections', 'listPayments', 'listReconnections', 'listSubscribers', 'listSuspensions', 'listTechnicians', 'login', 'logout', 'postInvoiceAdjustment', 'postPayment', 'previewBilling', 'previewPayment', 'processOverdueInvoices', 'reconcileCollectionBatch', 'recordCollection', 'remitCollectionBatch', 'resetManagedUserPassword', 'reversePayment', 'searchAudit', 'selectAndUploadGcashProof', 'submitCollectionBatch', 'updateCollectionArea', 'updateCollector', 'updateManagedUser', 'updateOrganizationSettings', 'updateServiceAccount', 'updateServiceControlPolicy', 'updateServicePlan', 'updateSubscriber', 'verifyGcashPayment', 'voidInvoice'].sort(),
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
      const axeWindow = window as typeof window & { axe: { run: () => Promise<{ violations: { id: string; impact: string; nodes: { target: string[]; html: string }[] }[] }> } };
      return (await axeWindow.axe.run()).violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target, html }) => ({ target, html })) }));
    });
    expect(violations).toEqual([]);
    await page.screenshot({ path: 'test-results/subscriber-directory.png' });
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(960, 640));
    await page.screenshot({ path: 'test-results/subscriber-minimum-size.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole('link', { name: 'Receivables', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Outstanding receivables' })).toBeVisible();
    await expect(page.getByLabel('As of')).toBeVisible();
    await expect(page.locator('.receivable-table, .empty-state')).toBeVisible();
    await page.getByRole('link', { name: 'Aging', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Accounts receivable aging' })).toBeVisible();
    await expect(page.getByText(/Day 90 belongs to 61–90/)).toBeVisible();
    await page.screenshot({ path: 'test-results/receivables-aging.png' });
    await page.getByRole('link', { name: 'Suspension Candidates', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Suspension candidates' })).toBeVisible();
    await expect(page.locator('.service-control-table').first()).toBeVisible();
    await page.getByRole('link', { name: 'Services', exact: true }).click();
    await page.getByRole('link', { name: 'Reconnection requests', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Reconnection requests' })).toBeVisible();
    await expect(page.locator('.service-control-table').first()).toBeVisible();
    await page.getByRole('link', { name: 'Administration', exact: true }).click();
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Service control policy' })).toBeVisible();
    await expect(page.getByLabel('Suspension threshold (days)')).toHaveValue('90');

    await page.getByRole('link', { name: 'Reports', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await page.screenshot({ path: 'test-results/reports.png' });

    await page.getByRole('link', { name: 'Administration', exact: true }).click();
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Grace period (days)').fill('0');
    await page.getByLabel('Suspension threshold (days)').fill('1');
    await page.getByLabel('Reconnection fee (PHP)').fill('500.00');
    await page.getByRole('button', { name: 'Save policy' }).click();

    await page.getByRole('link', { name: 'Billing', exact: true }).click();
    await page.getByRole('link', { name: 'Generate Billing', exact: true }).click();
    await page.getByLabel('Period').fill('2026-07');
    await expect(page.getByText('To create', { exact: true })).toBeVisible();
    const overdueCycleButton = page.getByRole('button', { name: /Generate \d+ invoices/ });
    await expect(overdueCycleButton).toBeEnabled();
    await overdueCycleButton.click();
    await expect(page.getByText('Billing run completed')).toBeVisible();

    const syntheticSubscriber = await database.query<{ id: string; account_number: string }>("select id, account_number from subscribers where account_number='BCIS-00001'");
    const subscriber = syntheticSubscriber.rows[0];
    if (!subscriber) throw new Error('Synthetic E2E subscriber missing');
    const targetService = await database.query<{ id: string }>("select id from service_accounts where service_account_number='SVC-00001-1' and status='ACTIVE'");
    const serviceId = targetService.rows[0]?.id;
    if (!serviceId) throw new Error('Synthetic E2E active service missing');

    await page.getByRole('link', { name: 'Receivables', exact: true }).click();
    await page.getByRole('link', { name: 'Suspension Candidates', exact: true }).click();
    await page.getByLabel('Search subscriber or service').fill('SVC-00001-1');
    const candidateRow = page.getByRole('row').filter({ hasText: 'SVC-00001-1' }).first();
    await expect(candidateRow).toBeVisible();
    await candidateRow.getByRole('button', { name: 'Request', exact: true }).click();
    await page.getByLabel('Effective date').fill(new Date().toISOString().slice(0, 10));
    await page.getByLabel('Reason').fill('Synthetic E2E overdue service');
    await page.getByRole('button', { name: 'Submit request' }).click();
    await expect(page.getByText('PENDING', { exact: true })).toBeVisible();
    const pendingSuspension = page.getByRole('row').filter({ hasText: 'SVC-00001-1' }).last();
    await pendingSuspension.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(pendingSuspension.getByText('ACTIVE', { exact: true })).toBeVisible();

    const subscriberBalance = await database.query<{ amount: string }>(
      "select coalesce(sum(balance_centavos),0)::text amount from invoices where subscriber_id=$1 and balance_centavos>0 and status in ('UNPAID','PARTIALLY_PAID','OVERDUE')",
      [subscriber.id],
    );
    const amountCentavos = subscriberBalance.rows[0]?.amount ?? '0';
    if (BigInt(amountCentavos) <= 0n) throw new Error('Synthetic E2E subscriber has no invoice balance to settle');
    await page.getByRole('link', { name: 'Payments', exact: true }).click();
    await page.getByLabel('Find subscriber').fill(subscriber.account_number);
    await page.locator('.payment-subscriber-results button').first().click();
    await page.getByLabel('Amount received (PHP)').fill(pesosFromCentavos(amountCentavos));
    await expect(page.getByRole('heading', { name: 'Allocation preview' })).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Confirm and post' }).click();
    await expect(page.getByRole('heading', { name: /Receipt OR-/ })).toBeVisible();

    await page.getByRole('link', { name: 'Services', exact: true }).click();
    await page.getByRole('link', { name: 'Reconnection requests', exact: true }).click();
    const reconnectionRow = page.getByRole('row').filter({ hasText: 'SVC-00001-1' });
    await expect(reconnectionRow).toBeVisible();
    await expect(reconnectionRow.getByText('₱500.00')).toBeVisible();
    await reconnectionRow.getByLabel('Assign Technician for SVC-00001-1').selectOption({ label: 'Demo Technician' });
    await reconnectionRow.getByLabel('Scheduled date for SVC-00001-1').fill(new Date().toISOString().slice(0, 10));
    await reconnectionRow.getByRole('button', { name: 'Assign' }).click();

    await page.getByRole('button', { name: 'Lock' }).click();
    await page.getByLabel('Username').fill('technician.demo');
    await page.getByLabel('Password', { exact: true }).fill(seedPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Secure your demo account' })).toBeVisible();
    await page.getByLabel('Current password', { exact: true }).fill(seedPassword);
    await page.getByLabel('New password', { exact: true }).fill('Synthetic-technician-e2e-2');
    await page.getByLabel('Confirm new password', { exact: true }).fill('Synthetic-technician-e2e-2');
    await page.getByRole('button', { name: 'Update password' }).click();
    await page.getByRole('link', { name: 'Services', exact: true }).click();
    await page.getByRole('link', { name: 'My reconnection work', exact: true }).click();
    const assignedWork = page.getByRole('row').filter({ hasText: 'SVC-00001-1' });
    await expect(assignedWork).toBeVisible();
    await expect(page.getByRole('link', { name: 'Payments', exact: true })).toHaveCount(0);
    await assignedWork.getByRole('button', { name: 'Complete' }).click();
    await expect(page.getByRole('heading', { name: 'No open reconnections' })).toBeVisible();
    const completedService = await database.query<{ status: string; reconnection_status: string }>(
      'select service.status, reconnect.status reconnection_status from service_accounts service join reconnection_records reconnect on reconnect.service_account_id=service.id where service.id=$1 order by reconnect.requested_at desc limit 1',
      [serviceId],
    );
    expect(completedService.rows[0]).toEqual({ status: 'ACTIVE', reconnection_status: 'COMPLETED' });

    await page.getByRole('link', { name: 'Connection', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Connected to BCIS' })).toBeVisible();
    await database.query('UPDATE application_metadata SET schema_version = 99');
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByText('Migration required', { exact: true })).toBeVisible();
    await database.query('UPDATE application_metadata SET schema_version = $1', [SCHEMA_VERSION]);
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByRole('heading', { name: 'Connected to BCIS' })).toBeVisible();
    server.kill();
    await expect.poll(async () => { try { await fetch(`${endpoint}/health`); return false; } catch { return true; } }).toBe(true);
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByRole('heading', { name: 'Unable to reach BCIS' })).toBeVisible();
    await page.getByRole('button', { name: 'Lock' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to BCIS' })).toBeVisible();
    await expect(page.getByText('Workstation locked. Sign in to continue.')).toBeVisible();
    expect(pageErrors).toEqual([]);
  } finally {
    await database.query('UPDATE application_metadata SET schema_version = $1', [SCHEMA_VERSION]);
    await database.end();
    await desktop?.close();
    server.kill();
    await rm(proofDirectory, { recursive: true, force: true });
  }
});
