import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

const root = fileURLToPath(new URL('../', import.meta.url));
config({ path: path.join(root, 'apps/api/.env'), quiet: true });
const sourceUrl = process.env.TEST_DATABASE_URL;
const approvedBy = process.argv[process.argv.indexOf('--approved-by') + 1];
if (!sourceUrl || !new URL(sourceUrl).pathname.endsWith('_test') || sourceUrl === process.env.DATABASE_URL) throw new Error('AT-12 requires the isolated TEST_DATABASE_URL ending in _test.');
if (!approvedBy) throw new Error('Restore approval is required: --approved-by OWNER_USERNAME');

const source = new URL(sourceUrl);
const sourceDatabase = source.pathname.slice(1);
const restoreDatabase = `${sourceDatabase}_restore_at12`;
if (!/^[a-z0-9_]+$/.test(restoreDatabase)) throw new Error('Unsafe restore database name');
const pgBin = process.env.PG_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '');
const executable = (name) => pgBin ? path.join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`) : name;
const environment = { ...process.env, PGPASSWORD: decodeURIComponent(source.password) };
const hostArgs = ['--host', source.hostname, '--port', source.port || '5432', '--username', decodeURIComponent(source.username), '--no-password'];
const evidenceDirectory = path.join(root, 'tests', 'evidence');
const backupDirectory = path.join(root, 'output', 'backups');
const backupPath = path.join(backupDirectory, 'at12-verified.backup');
const evidencePath = path.join(evidenceDirectory, 'at12-backup-restore.json');

function run(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable(name), args, { env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${name} failed (${code}): ${stderr.trim()}`)));
  });
}
async function connect(database) {
  const url = new URL(sourceUrl); url.pathname = `/${database}`;
  const client = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  await client.connect(); return client;
}

await mkdir(backupDirectory, { recursive: true }); await mkdir(evidenceDirectory, { recursive: true });
const sourceClient = await connect(sourceDatabase); let restoreClient; let adminClient;
try {
  const owner = await sourceClient.query(`select u.id from users u join user_roles ur on ur.user_id=u.id join roles r on r.id=ur.role_id where lower(u.username)=lower($1) and r.code='OWNER' and u.is_active=true`, [approvedBy]);
  const ownerId = owner.rows[0]?.id;
  if (!ownerId) throw new Error('Restore approver must be an active OWNER account');
  await sourceClient.query("delete from application_settings where key='at12_mutation_marker'");
  const baseline = await sourceClient.query(`select (select count(*)::int from subscribers) subscribers,(select count(*)::int from invoices) invoices,(select count(*)::int from payments) payments,(select count(*)::int from ledger_entries) ledger_entries`);
  const backup = await sourceClient.query(`insert into backup_history(status,storage_path,initiated_by_user_id) values('STARTED',$1,$2) returning id`, [backupPath, ownerId]);
  const backupId = backup.rows[0]?.id;
  await run('pg_dump', [...hostArgs, '--format=custom', '--compress=9', '--file', backupPath, sourceDatabase]);
  const bytes = await readFile(backupPath); const sha256 = createHash('sha256').update(bytes).digest('hex'); const sizeBytes = (await stat(backupPath)).size;
  await sourceClient.query(`update backup_history set status='VERIFIED',sha256=$1,size_bytes=$2,completed_at=now(),verified_at=now() where id=$3`, [sha256, sizeBytes, backupId]);
  await sourceClient.query(`insert into application_settings(key,value,description,updated_by_user_id) values('at12_mutation_marker','true'::jsonb,'Synthetic post-backup mutation',$1)`, [ownerId]);

  adminClient = await connect('postgres');
  await adminClient.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()', [restoreDatabase]);
  await adminClient.query(`drop database if exists "${restoreDatabase}"`);
  await adminClient.query(`create database "${restoreDatabase}"`);
  await run('pg_restore', [...hostArgs, '--exit-on-error', '--no-owner', '--dbname', restoreDatabase, backupPath]);
  if (existsSync(executable('pg_amcheck'))) await run('pg_amcheck', [...hostArgs, '--database', restoreDatabase, '--install-missing']);
  restoreClient = await connect(restoreDatabase);
  const restored = await restoreClient.query(`select (select count(*)::int from subscribers) subscribers,(select count(*)::int from invoices) invoices,(select count(*)::int from payments) payments,(select count(*)::int from ledger_entries) ledger_entries,(select count(*)::int from application_settings where key='at12_mutation_marker') mutation_markers,(select count(*)::int from pg_constraint where contype='f') foreign_keys`);
  const restoredRow = restored.rows[0]; const baselineRow = baseline.rows[0];
  const countsMatch = ['subscribers','invoices','payments','ledger_entries'].every((key) => restoredRow[key] === baselineRow[key]);
  if (!countsMatch || restoredRow.mutation_markers !== 0 || restoredRow.foreign_keys < 1) throw new Error('Restored database integrity or expected-record verification failed');
  await restoreClient.query(`update backup_history set status='RESTORED',sha256=$1,size_bytes=$2,restored_at=now() where id=$3`, [sha256, sizeBytes, backupId]);
  const result = { test: 'AT-12', status: 'PASSED', approvedBy, backupId, sha256, sizeBytes, baseline: baselineRow, restored: restoredRow, mutationAbsentAfterRestore: true, pgAmcheck: existsSync(executable('pg_amcheck')), verifiedAt: new Date().toISOString() };
  await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`); console.log(JSON.stringify(result));
} finally {
  await restoreClient?.end(); await sourceClient.end();
  if (!adminClient) adminClient = await connect('postgres');
  await adminClient.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()', [restoreDatabase]).catch(() => undefined);
  await adminClient.query(`drop database if exists "${restoreDatabase}"`).catch(() => undefined);
  await adminClient.end();
  if (process.argv.includes('--remove-backup')) await rm(backupPath, { force: true });
}
