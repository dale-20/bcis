import { spawnSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = path.join(root, '.local');
const data = path.join(local, 'postgres');
const port = 55432;
const bin = process.env.PG_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin' : '');
const executable = (name) => bin ? path.join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`) : name;
function run(name, args) {
  const result = spawnSync(executable(name), args, { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${name} failed (${result.status})`);
}
async function credentials() {
  return JSON.parse(await readFile(path.join(local, 'database.json'), 'utf8'));
}
const action = process.argv[2];
try {
  if (action === 'init') {
    await mkdir(local, { recursive: true });
    if (existsSync(path.join(data, 'PG_VERSION'))) {
      console.log('Project cluster already initialized; data and configuration preserved.');
    } else {
      const password = randomBytes(24).toString('hex');
      const passwordFile = path.join(local, 'init-password');
      await writeFile(passwordFile, password, { mode: 0o600 });
      try {
        run('initdb', ['-D', data, '-U', 'bcis', '--pwfile', passwordFile, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C']);
      } finally { await unlink(passwordFile); }
      await writeFile(path.join(local, 'database.json'), JSON.stringify({ password, port }), { mode: 0o600 });
      const envFile = path.join(root, 'apps/api/.env');
      const original = await readFile(existsSync(envFile) ? envFile : `${envFile}.example`, 'utf8');
      // Never replace a user-configured database connection.
      if (/^DATABASE_URL=.*CHANGE_ME/m.test(original)) {
        const updated = original.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=postgresql://bcis:${password}@127.0.0.1:${port}/bcis_dev`)
          .replace(/^TEST_DATABASE_URL=.*$/m, `TEST_DATABASE_URL=postgresql://bcis:${password}@127.0.0.1:${port}/bcis_test`);
        await writeFile(envFile, updated, { mode: 0o600 });
      } else {
        console.log('Existing API database configuration preserved. Project credentials are in ignored .local/database.json.');
      }
      console.log('Isolated project cluster initialized. Existing PostgreSQL service unchanged.');
    }
  } else if (action === 'start') {
    const { password } = await credentials();
    const status = spawnSync(executable('pg_ctl'), ['-D', data, 'status'], { stdio: 'ignore', windowsHide: true });
    if (status.status !== 0) {
      // pg_ctl detaches PostgreSQL; windowsHide avoids a visible helper console.
      const child = spawn(executable('pg_ctl'), ['-D', data, '-l', path.join(local, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { stdio: 'inherit', windowsHide: true });
      await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('PostgreSQL failed to start'))); });
    }
    const client = new pg.Client({ host: '127.0.0.1', port, user: 'bcis', password, database: 'postgres', connectionTimeoutMillis: 3000 });
    try {
      await client.connect();
      for (const name of ['bcis_dev', 'bcis_test']) {
        const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
        if (result.rowCount === 0) await client.query(`CREATE DATABASE ${name}`);
      }
    } finally { await client.end(); }
    console.log(`Project PostgreSQL ready on 127.0.0.1:${port}; bcis_dev and bcis_test available.`);
  } else if (action === 'stop') {
    run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  } else { throw new Error('Usage: node scripts/local-db.mjs init|start|stop'); }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local database command failed');
  process.exitCode = 1;
}
