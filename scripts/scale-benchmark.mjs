import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ReceivableRepository } from '../apps/api/dist/receivables/repository.js';
import { createDatabase } from '../apps/api/dist/db/client.js';
import { SubscriberRepository } from '../apps/api/dist/subscribers/repository.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const clusterPort = 55432;
const databaseName = `bcis_perf_${randomBytes(4).toString('hex')}`;
const outputPath = path.join(root, 'tests', 'evidence', 'scale-query-benchmark.json');
const { password } = JSON.parse(await readFile(path.join(root, '.local', 'database.json'), 'utf8'));
const baseUrl = new URL(`postgresql://bcis:${encodeURIComponent(password)}@127.0.0.1:${clusterPort}/postgres`);

if (baseUrl.hostname !== '127.0.0.1' || Number(baseUrl.port) !== clusterPort || !/^bcis_perf_[a-f0-9]{8}$/.test(databaseName)) {
  throw new Error('Scale benchmark is restricted to a uniquely named database in the isolated project cluster.');
}

function runNpm(args, env) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', `npm ${args.join(' ')}`] : args;
  const result = spawnSync(command, commandArgs, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} failed (${result.status})`);
}

const admin = new pg.Client({ connectionString: baseUrl.toString() });
let created = false;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE ${databaseName}`);
  created = true;
  const databaseUrl = new URL(baseUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl.toString(),
    NODE_ENV: 'development',
    DEMO_ACCOUNT_PASSWORD: `Scale-only-${randomBytes(18).toString('hex')}`,
  };
  runNpm(['run', 'db:migrate', '-w', '@bcis/api'], env);
  runNpm(['run', 'db:seed:demo', '-w', '@bcis/api'], env);

  const target = new pg.Pool({ connectionString: databaseUrl.toString(), max: 4, statement_timeout: 120_000 });
  try {
    await target.query('SET synchronous_commit = off');
    await target.query(`
      INSERT INTO subscribers (id, account_number, first_name, last_name, billing_day, due_day, status, notes)
      SELECT md5('scale-subscriber:' || n)::uuid, 'LOAD-' || lpad(n::text, 5, '0'),
             'Synthetic' || n::text, 'Subscriber' || (n % 1000)::text, 1, 15, 'ACTIVE', 'Synthetic scale benchmark fixture'
      FROM generate_series(51, 20000) AS n;
      INSERT INTO subscriber_addresses (id, subscriber_id, type, line1, barangay, municipality, province, is_primary)
      SELECT md5('scale-address:' || n)::uuid, md5('scale-subscriber:' || n)::uuid,
             'SERVICE', n::text || ' Synthetic Road', 'Poblacion', 'Malaybalay City', 'Bukidnon', true
      FROM generate_series(51, 20000) AS n;
      INSERT INTO service_accounts (id, service_account_number, subscriber_id, plan_id, installation_address_id,
        collection_area_id, assigned_collector_id, activation_date, billing_start_date, billing_day, due_day,
        current_rate_centavos, status)
      SELECT md5('scale-service:' || n)::uuid, 'LOAD-SA-' || lpad(n::text, 5, '0'),
        md5('scale-subscriber:' || n)::uuid, p.id, md5('scale-address:' || n)::uuid,
        a.id, c.id, '2024-01-01', '2024-01-01', 1, 15, p.price_centavos, 'ACTIVE'
      FROM generate_series(51, 20000) AS n
      CROSS JOIN LATERAL (SELECT id, price_centavos FROM service_plans WHERE code = 'FIBER-50') p
      CROSS JOIN LATERAL (SELECT id FROM collection_areas ORDER BY code LIMIT 1) a
      CROSS JOIN LATERAL (SELECT id FROM collectors ORDER BY collector_number LIMIT 1) c;
      INSERT INTO billing_cycles (id, period_start, period_end, status, finalized_at, finalized_by_user_id)
      SELECT md5('scale-cycle:' || to_char(month_start, 'YYYY-MM'))::uuid,
        month_start::date, (month_start + interval '1 month - 1 day')::date, 'FINALIZED', now(), u.id
      FROM generate_series(date '2024-09-01', date '2026-09-01', interval '1 month') AS months(month_start)
      CROSS JOIN LATERAL (SELECT id FROM users WHERE normalized_username = 'owner.demo') u;
      INSERT INTO invoices (id, invoice_number, subscriber_id, service_account_id, billing_cycle_id, invoice_date,
        due_date, status, total_centavos, balance_centavos, finalized_at, finalized_by_user_id)
      SELECT md5('scale-invoice:' || sa.id::text || ':' || bc.id::text)::uuid,
        'LOAD-' || sa.service_account_number || '-' || to_char(bc.period_start, 'YYYYMM'),
        sa.subscriber_id, sa.id, bc.id, bc.period_start,
        make_date(extract(year FROM bc.period_start)::int, extract(month FROM bc.period_start)::int, 15),
        'PARTIALLY_PAID', 99900, 89900, now(), u.id
      FROM service_accounts sa CROSS JOIN billing_cycles bc
      CROSS JOIN LATERAL (SELECT id FROM users WHERE normalized_username = 'owner.demo') u
      WHERE sa.service_account_number LIKE 'SVC-%' OR sa.service_account_number LIKE 'LOAD-SA-%';
      INSERT INTO payments (id, idempotency_key, subscriber_id, payment_date, amount_centavos, method, status,
        reference_number, posted_by_user_id, posted_at, created_by_user_id)
      SELECT md5('scale-payment:' || i.id::text)::uuid, 'scale:' || i.invoice_number, i.subscriber_id,
        i.due_date::timestamp + interval '1 day', 10000, 'CASH', 'POSTED', NULL, u.id, now(), u.id
      FROM invoices i CROSS JOIN LATERAL (SELECT id FROM users WHERE normalized_username = 'owner.demo') u
      WHERE i.invoice_number LIKE 'LOAD-%';
      INSERT INTO receipts (receipt_number, payment_id, status, issued_by_user_id)
      SELECT 'LOAD-R-' || right(p.id::text, 24), p.id, 'ISSUED', p.created_by_user_id
      FROM payments p WHERE p.idempotency_key LIKE 'scale:%';
      INSERT INTO payment_allocations (payment_id, invoice_id, amount_centavos, allocation_order)
      SELECT p.id, i.id, 10000, 1 FROM payments p JOIN invoices i ON p.idempotency_key = 'scale:' || i.invoice_number
      WHERE p.idempotency_key LIKE 'scale:%';
      INSERT INTO ledger_entries (subscriber_id, occurred_at, reference_type, reference_id, reference_number,
        description, debit_centavos, credit_centavos)
      SELECT i.subscriber_id, i.finalized_at, 'INVOICE', i.id, i.invoice_number, 'Synthetic scale invoice', 99900, 0
      FROM invoices i WHERE i.invoice_number LIKE 'LOAD-%';
      INSERT INTO ledger_entries (subscriber_id, occurred_at, reference_type, reference_id, reference_number,
        description, debit_centavos, credit_centavos)
      SELECT p.subscriber_id, p.posted_at, 'PAYMENT', p.id, p.idempotency_key, 'Synthetic scale payment', 0, 10000
      FROM payments p WHERE p.idempotency_key LIKE 'scale:%';
      ANALYZE subscribers;
      ANALYZE subscriber_addresses;
      ANALYZE service_accounts;
      ANALYZE invoices;
      ANALYZE payments;
      ANALYZE ledger_entries;
    `);
    await target.query('VACUUM (ANALYZE) invoices');

    const database = createDatabase({ DATABASE_URL: databaseUrl.toString(), DATABASE_POOL_MAX: 4 });
    try {
      const subscribers = new SubscriberRepository(database);
      const receivables = new ReceivableRepository(database);
      async function measure(label, operation) {
        await operation();
        const timings = [];
        let result;
        for (let i = 0; i < 7; i += 1) {
          const start = performance.now();
          result = await operation();
          timings.push(Math.round((performance.now() - start) * 100) / 100);
        }
        timings.sort((a, b) => a - b);
        return { label, runsMs: timings, medianMs: timings[Math.floor(timings.length / 2)], result };
      }
      const subscriberPage = await measure('subscriber list final page 400, pageSize 50', () => subscribers.list({ query: '', status: 'ALL', page: 400, pageSize: 50, sort: 'account', direction: 'asc' }));
      const agingPage = await measure('receivables aging page 1000, pageSize 25', () => receivables.aging({ asOf: '2026-10-11', overdueOnly: true, page: 1000, pageSize: 25 }));
      const agingTotalCentavos = Object.values(agingPage.result.totals).reduce((sum, amount) => sum + amount, 0n).toString();
      const plans = await Promise.all([
        target.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id, account_number FROM subscribers ORDER BY account_number, id LIMIT 50 OFFSET 19950`),
        target.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
          SELECT i.id, i.due_date, i.invoice_number, i.balance_centavos
          FROM invoices i JOIN service_accounts s ON i.service_account_id=s.id
          WHERE i.balance_centavos>0 AND i.status IN ('UNPAID','PARTIALLY_PAID','OVERDUE') AND i.due_date<date '2026-10-11'
          ORDER BY i.due_date, i.invoice_number LIMIT 25 OFFSET 24975`),
      ]);
      const counts = await target.query(`SELECT
        (SELECT count(*)::int FROM subscribers) subscribers,
        (SELECT count(*)::int FROM invoices) invoices,
        (SELECT count(*)::int FROM payments) payments,
        (SELECT count(*)::int FROM ledger_entries) ledger_entries,
        (SELECT coalesce(sum(balance_centavos),0)::text FROM invoices) outstanding_centavos`);
      const output = {
        generatedAt: new Date().toISOString(),
        scope: 'Synthetic isolated project-cluster database; API repository pagination methods; development hardware only.',
        volume: counts.rows[0],
        subscriberPage: { label: subscriberPage.label, medianMs: subscriberPage.medianMs, runsMs: subscriberPage.runsMs, rows: subscriberPage.result.rows.length, total: subscriberPage.result.total },
        agingPage: { label: agingPage.label, medianMs: agingPage.medianMs, runsMs: agingPage.runsMs, rows: agingPage.result.rows.length, total: agingPage.result.total, totalCentavos: agingTotalCentavos },
        queryPlans: plans.map((plan) => plan.rows[0]['QUERY PLAN'][0]),
        limits: 'Fixture rows are synthetic and inserted directly for query-performance measurement; this is not payment/billing workflow or financial-invariant evidence. No concurrency or 3-client LAN test is implied.',
      };
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
      console.log(`Scale benchmark complete: ${counts.rows[0].subscribers} subscribers, ${counts.rows[0].invoices} invoices, ${counts.rows[0].payments} payments, ${counts.rows[0].ledger_entries} ledger rows.`);
      console.log(`Median page timings: subscriber ${subscriberPage.medianMs} ms; AR aging ${agingPage.medianMs} ms.`);
      console.log(`Evidence: ${path.relative(root, outputPath)}`);
    } finally {
      await database.close();
    }
  } finally {
    await target.end();
  }
} finally {
  await admin.end();
  if (created) {
    const cleanup = new pg.Client({ connectionString: baseUrl.toString() });
    await cleanup.connect();
    await cleanup.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
    await cleanup.end();
  }
}
