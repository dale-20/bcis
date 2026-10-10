import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

const root = fileURLToPath(new URL('../', import.meta.url));
config({ path: path.join(root, 'apps/api/.env'), quiet: true });

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const databaseUrl = process.env.DATABASE_URL;
const restoreDatabaseUrl = process.env.RESTORE_DATABASE_URL;
const backupId = argument('--backup-id');
const confirmedDatabase = argument('--confirm-database');
if (!databaseUrl || !restoreDatabaseUrl || !backupId || !confirmedDatabase) throw new Error('Set DATABASE_URL and the offline-only RESTORE_DATABASE_URL, then supply --backup-id UUID --confirm-database EXACT_DATABASE_NAME.');
const url = new URL(databaseUrl);
const restoreUrl = new URL(restoreDatabaseUrl);
const databaseName = decodeURIComponent(url.pathname.slice(1));
if (!/^[a-zA-Z0-9_]{1,50}$/.test(databaseName) || confirmedDatabase !== databaseName) throw new Error('The explicit database confirmation must exactly match DATABASE_URL.');
if (!/^[0-9a-f-]{36}$/i.test(backupId)) throw new Error('Backup ID must be a UUID.');
if (restoreUrl.hostname !== url.hostname || (restoreUrl.port || '5432') !== (url.port || '5432') || decodeURIComponent(restoreUrl.pathname.slice(1)) === databaseName) throw new Error('RESTORE_DATABASE_URL must connect to a maintenance database on the same PostgreSQL server, not the target database.');

const sourceClient = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
const adminClient = new pg.Client({ connectionString: restoreDatabaseUrl, connectionTimeoutMillis: 5000 });
const backupDirectory = path.resolve(root, 'apps/api', process.env.BACKUP_DIR ?? '.local/backups');
const proofDirectory = path.resolve(root, 'apps/api', process.env.PAYMENT_PROOF_DIR ?? '.local/payment-proofs');
const pgBin = process.env.PG_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '');
const tarBin = process.env.TAR_BIN ?? 'tar';
const executable = (name) => pgBin ? path.join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`) : name;
const environment = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
const hostArgs = ['--host', url.hostname, '--port', url.port || '5432', '--username', decodeURIComponent(url.username), '--no-password'];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' };
const idSuffix = randomUUID().replaceAll('-', '').slice(0, 10);
const stagedDatabase = `${databaseName.slice(0, 35)}_restore_${idSuffix}`;
const rollbackDatabase = `${databaseName.slice(0, 35)}_rollback_${idSuffix}`;
const failedDatabase = `${databaseName.slice(0, 35)}_failed_${idSuffix}`;
const workDirectory = path.join(backupDirectory, `.restore-${backupId}-${idSuffix}`);
const oldProofDirectory = `${proofDirectory}.rollback-${idSuffix}`;
let sourceClosed = false;
let adminConnected = false;
let originalRenamed = false;
let databaseCutover = false;
let proofCutover = false;
let stagedClient;
let activeTargetClient;

function run(name, args) {
  const command = name === 'tar' ? tarBin : executable(name);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${name} failed (${code}): ${stderr.trim()}`)));
  });
}

function quoteIdentifier(value) { return `"${value.replaceAll('"', '""')}"`; }
function quoteLiteral(value) { return `'${value.replaceAll("'", "''")}'`; }

async function restore() {
  await sourceClient.connect();
  const settings = await sourceClient.query(`select value from application_settings where key='maintenance_mode'`);
  const approval = settings.rows[0]?.value;
  if (!approval || approval.active !== true || approval.backupId !== backupId || !/^[a-f0-9]{64}$/.test(approval.sha256) || !approval.actorId || !approval.actorUsername || !approval.reason || !approval.requestId) {
    throw new Error('No matching active Owner-approved maintenance record exists.');
  }
  const owner = await sourceClient.query(`select u.id from users u join user_roles ur on ur.user_id=u.id join roles r on r.id=ur.role_id where u.id=$1 and lower(u.username)=lower($2) and r.code='OWNER' and u.is_active=true`, [approval.actorId, approval.actorUsername]);
  if (!owner.rows[0]) throw new Error('The approval is not bound to an active Owner account.');
  const otherConnections = await sourceClient.query(`select count(*)::int as total from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()`);
  if (otherConnections.rows[0]?.total !== 0) throw new Error('Stop the API and all database clients before running the offline restore.');
  const backups = await sourceClient.query(`select id,status,sha256,size_bytes::text,storage_path from backup_history where id=$1`, [backupId]);
  const backup = backups.rows[0];
  if (!backup || backup.status !== 'VERIFIED' || backup.sha256 !== approval.sha256) throw new Error('The approved backup is no longer verified or its checksum changed.');
  const archivePath = path.resolve(backup.storage_path);
  if (path.dirname(archivePath) !== backupDirectory || path.basename(archivePath) !== `${backupId}.tar.gz`) throw new Error('The approved archive is outside the configured backup directory.');
  const archiveBytes = await readFile(archivePath);
  if (digest(archiveBytes) !== backup.sha256 || String(archiveBytes.length) !== backup.size_bytes) throw new Error('The archive checksum or recorded byte count does not match.');
  await mkdir(workDirectory, { recursive: false });
  const listing = await runListing(archivePath);
  if (!listing.includes('database.dump') || !listing.includes('manifest.json') || listing.some((entry) => entry.startsWith('/') || entry.split('/').includes('..') || !/^(database\.dump|manifest\.json|proofs\/?|proofs\/[0-9a-f-]+\.(jpg|png|pdf))$/.test(entry.replace(/^\.\//, '')))) throw new Error('Archive paths or required files are invalid.');
  await run('tar', ['-xzf', archivePath, '-C', workDirectory, '--no-same-owner']);
  const manifest = JSON.parse(await readFile(path.join(workDirectory, 'manifest.json'), 'utf8'));
  const dumpPath = path.join(workDirectory, 'database.dump');
  const dumpBytes = await readFile(dumpPath);
  if (manifest.formatVersion !== 1 || manifest.databaseDump?.path !== 'database.dump' || manifest.databaseDump.sha256 !== digest(dumpBytes) || manifest.databaseDump.sizeBytes !== String(dumpBytes.length) || !Array.isArray(manifest.proofs)) throw new Error('Backup manifest or database dump integrity validation failed.');
  for (const proof of manifest.proofs) {
    if (!/^[0-9a-f-]{36}$/i.test(proof.storageKey) || extension[proof.mimeType] === undefined || proof.archivePath !== `proofs/${proof.storageKey}${extension[proof.mimeType]}`) throw new Error('Backup contains invalid payment proof metadata.');
    const bytes = await readFile(path.join(workDirectory, proof.archivePath));
    if (digest(bytes) !== proof.sha256 || String(bytes.length) !== proof.sizeBytes) throw new Error(`Payment proof ${proof.storageKey} failed checksum validation.`);
  }
  await run('pg_restore', [...hostArgs, '--list', dumpPath]);

  await adminClient.connect();
  adminConnected = true;
  const stagedExists = await adminClient.query('select 1 from pg_database where datname=$1', [stagedDatabase]);
  const rollbackExists = await adminClient.query('select 1 from pg_database where datname=$1', [rollbackDatabase]);
  if (stagedExists.rows.length || rollbackExists.rows.length) throw new Error('A generated restore or rollback database already exists.');
  const databaseAttributes = await adminClient.query(`select attname from pg_attribute where attrelid='pg_catalog.pg_database'::regclass and attnum>0`);
  const attributeNames = new Set(databaseAttributes.rows.map((row) => row.attname));
  const providerExpression = attributeNames.has('datlocprovider') ? 'datlocprovider' : "'c'::char as datlocprovider";
  const icuExpression = attributeNames.has('daticulocale') ? 'daticulocale' : 'null::text as daticulocale';
  const localeResult = await adminClient.query(`select pg_encoding_to_char(encoding) as encoding,datcollate,datctype,${providerExpression},${icuExpression} from pg_database where datname=$1`, [databaseName]);
  const locale = localeResult.rows[0];
  if (!locale || !['c', 'i', 'b'].includes(locale.datlocprovider)) throw new Error('Target database locale settings could not be safely reproduced for staging.');
  if (locale.datlocprovider === 'i' && !locale.daticulocale) throw new Error('The target ICU locale cannot be safely reproduced by this PostgreSQL server.');
  const localeOptions = locale.datlocprovider === 'i'
    ? `locale_provider = icu icu_locale = ${quoteLiteral(locale.daticulocale)}`
    : locale.datlocprovider === 'b'
      ? `locale_provider = builtin builtin_locale = ${quoteLiteral(locale.daticulocale)}`
      : `locale_provider = libc lc_collate = ${quoteLiteral(locale.datcollate)} lc_ctype = ${quoteLiteral(locale.datctype)}`;
  await adminClient.query(`create database ${quoteIdentifier(stagedDatabase)} with template = template0 encoding = ${quoteLiteral(locale.encoding)} ${localeOptions} owner ${quoteIdentifier(decodeURIComponent(url.username))}`);
  await run('pg_restore', [...hostArgs, '--exit-on-error', '--no-owner', '--no-privileges', '--dbname', stagedDatabase, dumpPath]);
  if (existsSync(executable('pg_amcheck'))) await run('pg_amcheck', [...hostArgs, '--database', stagedDatabase, '--install-missing']);
  const stagedUrl = new URL(databaseUrl); stagedUrl.pathname = `/${stagedDatabase}`;
  stagedClient = new pg.Client({ connectionString: stagedUrl.toString(), connectionTimeoutMillis: 5000 });
  await stagedClient.connect();
  const actualProofs = await stagedClient.query(`select storage_key,mime_type,size_bytes::text,sha256 from payment_proofs order by storage_key`);
  if (actualProofs.rows.length !== manifest.proofs.length) throw new Error('Restored payment proof count does not match the verified archive.');
  const manifestProofs = new Map(manifest.proofs.map((item) => [item.storageKey, item]));
  for (const row of actualProofs.rows) {
    const item = manifestProofs.get(row.storage_key);
    if (!item || item.mimeType !== row.mime_type || item.sizeBytes !== row.size_bytes || item.sha256 !== row.sha256) throw new Error('Restored proof metadata does not match its manifest.');
  }
  const integrity = await stagedClient.query(`select (select count(*)::int from subscribers) subscribers,(select count(*)::int from invoices) invoices,(select count(*)::int from payments) payments,(select count(*)::int from ledger_entries) ledger_entries,(select count(*)::int from pg_constraint where contype='f') foreign_keys`);
  if (!integrity.rows[0] || integrity.rows[0].foreign_keys < 1) throw new Error('Restored database integrity check failed.');
  await stagedClient.end(); stagedClient = undefined;

  await sourceClient.end(); sourceClosed = true;
  await adminClient.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()', [databaseName]);
  await adminClient.query(`alter database ${quoteIdentifier(databaseName)} rename to ${quoteIdentifier(rollbackDatabase)}`);
  originalRenamed = true;
  await adminClient.query(`alter database ${quoteIdentifier(stagedDatabase)} rename to ${quoteIdentifier(databaseName)}`);
  databaseCutover = true;

  const proofSource = path.join(workDirectory, 'proofs');
  await mkdir(path.dirname(proofDirectory), { recursive: true });
  if (existsSync(proofDirectory)) await rename(proofDirectory, oldProofDirectory);
  await rename(proofSource, proofDirectory); proofCutover = true;
  activeTargetClient = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  await activeTargetClient.connect();
  const actor = await activeTargetClient.query('select id from users where id=$1', [approval.actorId]);
  await activeTargetClient.query('begin');
  try {
    await activeTargetClient.query(`update backup_history set status='RESTORED',restored_at=now() where id=$1`, [backupId]);
    await activeTargetClient.query(`delete from application_settings where key='maintenance_mode'`);
    await activeTargetClient.query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,reason,old_values,new_values,request_id,created_at) values($1,'backup.restored','backup',$2,$3,$4::jsonb,$5::jsonb,$6,now())`, [actor.rows[0]?.id ?? null, backupId, approval.reason, JSON.stringify({ maintenanceGate: 'ACTIVE', sha256: approval.sha256 }), JSON.stringify({ maintenanceGate: 'CLEARED', rollbackDatabase, proofCount: manifest.proofs.length, approvalUsername: approval.actorUsername }), approval.requestId]);
    await activeTargetClient.query('commit');
  } catch (error) { await activeTargetClient.query('rollback'); throw error; }
  await activeTargetClient.end(); activeTargetClient = undefined;
  const result = { status: 'RESTORED', backupId, sha256: approval.sha256, approvedBy: approval.actorUsername, approvedAt: approval.approvedAt, reason: approval.reason, restoredAt: new Date().toISOString(), restoredDatabase: databaseName, rollbackDatabase, rollbackProofDirectory: path.basename(oldProofDirectory), proofCount: manifest.proofs.length, integrity: integrity.rows[0] };
  await writeFile(path.join(backupDirectory, `${backupId}.restore-evidence.json`), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(result));
}

async function runListing(archivePath) {
  const output = await new Promise((resolve, reject) => {
    const child = spawn(tarBin, ['-tzf', archivePath], { env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); }); child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve(stdout) : reject(new Error(`tar listing failed (${code}): ${stderr.trim()}`)));
  });
  return output.trim().split(/\r?\n/).map((entry) => entry.replace(/^\.\//, ''));
}

try {
  await restore();
} catch (error) {
  await stagedClient?.end().catch(() => undefined);
  await activeTargetClient?.end().catch(() => undefined);
  if (!sourceClosed) await sourceClient.end().catch(() => undefined);
  if (databaseCutover && adminConnected) {
    await adminClient.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()', [databaseName]).catch(() => undefined);
    if (existsSync(proofDirectory) && proofCutover) await rm(proofDirectory, { recursive: true, force: true }).catch(() => undefined);
    if (existsSync(oldProofDirectory)) await rename(oldProofDirectory, proofDirectory).catch(() => undefined);
    await adminClient.query(`alter database ${quoteIdentifier(databaseName)} rename to ${quoteIdentifier(failedDatabase)}`).catch(() => undefined);
    await adminClient.query(`alter database ${quoteIdentifier(rollbackDatabase)} rename to ${quoteIdentifier(databaseName)}`).catch(() => undefined);
  } else if (originalRenamed && adminConnected) {
    await adminClient.query(`alter database ${quoteIdentifier(rollbackDatabase)} rename to ${quoteIdentifier(databaseName)}`).catch(() => undefined);
    await adminClient.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()', [stagedDatabase]).catch(() => undefined);
    await adminClient.query(`drop database if exists ${quoteIdentifier(stagedDatabase)}`).catch(() => undefined);
  } else if (adminConnected) {
    await adminClient.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()', [stagedDatabase]).catch(() => undefined);
    await adminClient.query(`drop database if exists ${quoteIdentifier(stagedDatabase)}`).catch(() => undefined);
  }
  console.error(error instanceof Error ? error.message : 'Offline restore failed.');
  process.exitCode = 1;
} finally {
  if (adminConnected) await adminClient.end().catch(() => undefined);
  await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined);
  if (process.exitCode === 0 && existsSync(oldProofDirectory)) await rm(oldProofDirectory, { recursive: true, force: true });
}
