import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PasswordHasher, type ScryptParameters } from '../src/auth/password.js';
import { AuthService } from '../src/auth/service.js';
import { seedAuthorization, type DemoAccount } from '../src/auth/seed.js';
import { createDatabase } from '../src/db/client.js';
import { seedOperationalDemoData } from '../src/db/seed-operational.js';
import { resolve } from 'node:path';
import { GcashProofStorage } from '../src/payments/proof-storage.js';
import { BackupService } from '../src/system/backup-service.js';
import { applicationSettings, paymentProofs, users } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import pg from 'pg';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || url === process.env.DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a separate disposable database ending in _test.');
let database = createDatabase({ DATABASE_URL: url, DATABASE_POOL_MAX: 3 });
let databaseOpen = true;
const hasher = new PasswordHasher({ cost: 16_384, blockSize: 8, parallelization: 1, keyLength: 32, saltLength: 16, maxMemory: 64 * 1024 * 1024 } satisfies ScryptParameters);
const execute = promisify(execFile);
const accounts: readonly DemoAccount[] = [{ username: 'owner.demo', displayName: 'Demo Owner', role: 'OWNER' }];
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

beforeAll(async () => {
  await database.pool.query('DROP SCHEMA IF EXISTS public CASCADE'); await database.pool.query('CREATE SCHEMA public'); await database.pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await migrate(database.db, { migrationsFolder }); await seedAuthorization(database, 'password', hasher, accounts); await seedOperationalDemoData(database);
  const owner = await database.db.select({ id: users.id }).from(users).where(eq(users.username, 'owner.demo')).limit(1);
  const ownerId = owner[0]?.id;
  if (!ownerId) throw new Error('Seeded backup owner missing');
  const storage = new GcashProofStorage(resolve(fileURLToPath(new URL('../', import.meta.url)), process.env.PAYMENT_PROOF_DIR ?? '.local/payment-proofs'));
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const saved = await storage.save({ originalFilename: 'synthetic-proof.jpg', mimeType: 'image/jpeg', contentBase64: bytes.toString('base64') });
  await database.db.insert(paymentProofs).values({ uploadedByUserId: ownerId, ...saved.metadata, sizeBytes: BigInt(saved.metadata.sizeBytes) });
});
afterAll(async () => { if (databaseOpen) await database.close(); });

describe('AT-12 backup and approved restore', () => {
  it('creates, hashes, restores, integrity-checks, and verifies expected records', async () => {
    const { stdout } = await execute(process.execPath, ['scripts/verify-backup-restore.mjs', '--approved-by', 'owner.demo'], { cwd: fileURLToPath(new URL('../../..', import.meta.url)), env: { ...process.env, TEST_DATABASE_URL: url }, windowsHide: true, timeout: 60_000 });
    const result = JSON.parse(stdout.trim()) as { status: string; mutationAbsentAfterRestore: boolean; proofHashesVerified: boolean; proofCount: number; sha256: string; sizeBytes: number; baseline: Record<string, number>; restored: Record<string, number> };
    expect(result).toMatchObject({ status: 'PASSED', mutationAbsentAfterRestore: true, proofHashesVerified: true, proofCount: 1 });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/); expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.restored).toMatchObject(result.baseline);
  }, 70_000);

  it('stages a separately approved archive, cuts over only the isolated _test database, and retains a rollback copy', async () => {
    const root = fileURLToPath(new URL('../../..', import.meta.url));
    const apiRoot = fileURLToPath(new URL('../', import.meta.url));
    const backupDirectory = resolve(apiRoot, '.local/test-restore-command');
    const proofDirectory = resolve(apiRoot, '.local/test-restore-command-proofs');
    const owner = await database.db.select({ id: users.id }).from(users).where(eq(users.username, 'owner.demo')).limit(1);
    const ownerId = owner[0]?.id;
    if (!ownerId) throw new Error('Restore test owner missing');
    const auth = new AuthService(database, hasher);
    const loggedIn = await auth.login('owner.demo', 'password', { requestId: 'restore-workflow-login', ipAddress: '127.0.0.1' });
    const actor = await auth.authenticate(loggedIn.token);
    const proofStorage = new GcashProofStorage(resolve(apiRoot, process.env.PAYMENT_PROOF_DIR ?? '.local/payment-proofs'));
    const backupService = new BackupService({ database, proofStorage, databaseUrl: url, directory: backupDirectory, pgBin: process.env.PG_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '') });
    const backup = await backupService.create(actor, 'restore-workflow-backup', '127.0.0.1');
    const maintenance = { active: true, backupId: backup.id, sha256: backup.sha256, actorId: ownerId, actorUsername: 'owner.demo', reason: 'Automated isolated recovery workflow test', approvedAt: new Date().toISOString(), requestId: 'restore-workflow-approval' };
    await database.db.insert(applicationSettings).values({ key: 'maintenance_mode', value: maintenance, description: 'Isolated test restore gate', updatedByUserId: ownerId });
    const before = await database.pool.query(`select (select count(*)::int from subscribers) subscribers,(select count(*)::int from invoices) invoices,(select count(*)::int from payments) payments,(select count(*)::int from ledger_entries) ledger_entries`);
    await database.close(); databaseOpen = false;
    const targetUrl = new URL(url); const targetName = decodeURIComponent(targetUrl.pathname.slice(1));
    const { stdout } = await execute(process.execPath, ['scripts/restore-approved.mjs', '--backup-id', backup.id, '--confirm-database', targetName], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url, RESTORE_DATABASE_URL: new URL('/postgres', url).toString(), BACKUP_DIR: '.local/test-restore-command', PAYMENT_PROOF_DIR: '.local/test-restore-command-proofs', PG_BIN: process.env.PG_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '') },
      windowsHide: true, timeout: 120_000,
    });
    const result = JSON.parse(stdout.trim()) as { status: string; backupId: string; approvedBy: string; rollbackDatabase: string; rollbackProofDirectory: string; proofCount: number };
    expect(result).toMatchObject({ status: 'RESTORED', backupId: backup.id, approvedBy: 'owner.demo', proofCount: 1 });
    database = createDatabase({ DATABASE_URL: url, DATABASE_POOL_MAX: 3 }); databaseOpen = true;
    expect(await database.probe()).toBe('connected');
    const after = await database.pool.query(`select (select count(*)::int from subscribers) subscribers,(select count(*)::int from invoices) invoices,(select count(*)::int from payments) payments,(select count(*)::int from ledger_entries) ledger_entries,(select count(*)::int from backup_history where id=$1::uuid and status='RESTORED') restored_backups,(select count(*)::int from application_settings where key='maintenance_mode') maintenance_gates,(select count(*)::int from audit_logs where action='backup.restored' and entity_id=$1::text) restore_audits`, [backup.id]);
    expect(after.rows[0]).toMatchObject({ ...before.rows[0], restored_backups: 1, maintenance_gates: 0, restore_audits: 1 });
    const restoredProof = await database.db.select().from(paymentProofs);
    expect(restoredProof).toHaveLength(1);
    const proofPath = resolve(proofDirectory, `${restoredProof[0]?.storageKey}.jpg`);
    expect(await readFile(proofPath)).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0x00]));
    const admin = new pg.Client({ connectionString: new URL('/postgres', url).toString() });
    await admin.connect();
    await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()', [result.rollbackDatabase]);
    await admin.query(`drop database ${`"${result.rollbackDatabase.replaceAll('"', '""')}"`}`);
    await admin.end();
    const evidenceDirectory = resolve(root, 'tests/evidence');
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(resolve(evidenceDirectory, 'at12-offline-cutover.json'), `${JSON.stringify({ test: 'AT-12-offline-cutover', status: 'PASSED_ISOLATED_TEST', targetDatabase: targetName, backupId: backup.id, sha256: backup.sha256, approvedBy: result.approvedBy, proofCount: result.proofCount, proofHashesVerified: true, maintenanceGateCleared: after.rows[0]?.maintenance_gates === 0, restoreAuditWritten: after.rows[0]?.restore_audits === 1, rollbackDatabasePreservedUntilAssertions: true, rollbackDatabaseRemovedAfterTest: true, before: before.rows[0], restored: { subscribers: after.rows[0]?.subscribers, invoices: after.rows[0]?.invoices, payments: after.rows[0]?.payments, ledger_entries: after.rows[0]?.ledger_entries }, productionRecoveryTested: false, verifiedAt: new Date().toISOString() }, null, 2)}\n`);
    await rm(backupDirectory, { recursive: true, force: true });
    await rm(proofDirectory, { recursive: true, force: true });
    await rm(resolve(apiRoot, '.local', result.rollbackProofDirectory), { recursive: true, force: true });
  }, 150_000);
});
