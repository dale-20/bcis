import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, Banknote, CalendarRange, CircleDollarSign, Clock3, ExternalLink, ReceiptText, TrendingUp, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { receivableAgingBucketLabel, type AgingBucket, type AuthenticatedUser } from '@bcis/shared';
import { PageError, PageLoading } from '../../components/PageFeedback';
import { getDashboard, getReceivableAging, listCollectionBatches, listGcashProofs } from '../../services/api';

type DashboardPeriod = '30d' | '90d' | '6m' | '12m' | 'ytd';

const periodOptions: readonly { value: DashboardPeriod; label: string }[] = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '6m', label: '6 months' },
  { value: '12m', label: '12 months' },
  { value: 'ytd', label: 'Year to date' },
];

function manilaToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftCalendarDate(value: string, offsetDays: number): string {
  const [year = '0', month = '1', day = '1'] = value.split('-');
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + offsetDays)).toISOString().slice(0, 10);
}

function periodStart(today: string, period: DashboardPeriod): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (period === 'ytd') return `${year}-01-01`;
  if (period === '30d') return shiftCalendarDate(today, -29);
  if (period === '90d') return shiftCalendarDate(today, -89);
  const monthsBack = period === '6m' ? 5 : 11;
  const firstMonth = new Date(Date.UTC(year, month - 1 - monthsBack, 1));
  return `${firstMonth.getUTCFullYear()}-${String(firstMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

const peso = (value: string) => {
  const centavos = BigInt(value);
  const fraction = (centavos < 0n ? -centavos : centavos) % 100n;
  return `${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(centavos / 100n)}.${fraction.toString().padStart(2, '0')}`;
};
const monthLabel = (value: string) => new Intl.DateTimeFormat('en-PH', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));
const shortDate = (value: string) => new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));

export function DashboardPage({ user }: { user: AuthenticatedUser }) {
  const [period, setPeriod] = useState<DashboardPeriod>('ytd');
  const today = manilaToday();
  const range = { from: periodStart(today, period), to: today };
  const canViewReceivables = user.permissions.includes('receivables.view');
  const canViewCollections = user.permissions.includes('collection.view');
  const canVerifyGcash = user.permissions.includes('payment.verify_gcash');
  const query = useQuery({ queryKey: ['dashboard', user.userId, range], queryFn: () => getDashboard(range), refetchInterval: 60_000 });
  const overdueQueue = useQuery({
    queryKey: ['dashboard-attention', 'overdue', user.userId, today],
    queryFn: () => getReceivableAging({ asOf: today, overdueOnly: true, page: 1, pageSize: 5 }),
    enabled: canViewReceivables,
  });
  const batchQueue = useQuery({
    queryKey: ['dashboard-attention', 'batches', user.userId],
    queryFn: () => listCollectionBatches({ page: 1, pageSize: 5, exceptionsOnly: true }),
    enabled: canViewCollections,
  });
  const gcashQueue = useQuery({
    queryKey: ['dashboard-attention', 'gcash', user.userId],
    queryFn: () => listGcashProofs(1, 10),
    enabled: canVerifyGcash,
  });

  if (query.isPending) return <PageLoading label="Loading operational dashboard..." />;
  if (query.isError) return <PageError title="Dashboard unavailable" message={query.error.message} onRetry={() => void query.refetch()} />;

  const data = query.data;
  const batchExceptions = batchQueue.data?.items ?? [];
  const maxMonthly = data.monthlyCollections.reduce((maximum, item) => {
    const billed = BigInt(item.billedCentavos);
    const collected = BigInt(item.amountCentavos);
    return billed > maximum ? (collected > billed ? collected : billed) : (collected > maximum ? collected : maximum);
  }, 0n);
  const agingTotal = Object.values(data.aging).reduce((sum, value) => sum + BigInt(value), 0n);
  const percentage = (value: string) => maxMonthly === 0n ? 0 : Number(BigInt(value) * 10_000n / maxMonthly) / 100;

  return <div className="content-enter dashboard-page">
    <header className="page-heading page-heading-actions dashboard-heading">
      <div><span className="eyebrow">Operational overview</span><h1>Dashboard</h1><p>Financial activity for the selected period, with current receivables and service totals.</p></div>
      <div className="dashboard-period">
        <label htmlFor="dashboard-period">Reporting period</label>
        <div className="dashboard-period-control"><CalendarRange aria-hidden="true" /><select id="dashboard-period" value={period} onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}>
          {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></div>
        <small>Through {shortDate(range.to)} · Manila time</small>
      </div>
    </header>

    <section className="metric-grid" aria-label="Key performance indicators">
      <article className="metric-card accent"><div><span>Collected · period</span><CircleDollarSign aria-hidden="true" /></div><strong>{peso(data.collectedCentavos)}</strong><small>{data.postedPaymentCount.toLocaleString()} posted payments</small></article>
      <article className="metric-card"><div><span>Billed · period</span><TrendingUp aria-hidden="true" /></div><strong>{peso(data.billedCentavos)}</strong><small>Finalized invoices issued</small></article>
      <article className="metric-card"><div><span>Outstanding · today</span><ReceiptText aria-hidden="true" /></div><strong>{peso(data.outstandingCentavos)}</strong><small>All open invoice balances</small></article>
      <article className="metric-card warning"><div><span>Overdue · today</span><Clock3 aria-hidden="true" /></div><strong>{peso(data.overdueCentavos)}</strong><small>{data.overdueInvoiceCount.toLocaleString()} invoices · {data.overdueSubscriberCount.toLocaleString()} subscribers</small></article>
      <article className="metric-card"><div><span>Active subscribers</span><Users aria-hidden="true" /></div><strong>{data.activeSubscribers.toLocaleString()}</strong><small>Current active records</small></article>
    </section>

    <div className="dashboard-grid dashboard-finance-grid">
      <section className="insight-card collections-chart" aria-labelledby="billing-trend-title">
        <div className="card-title"><div><h2 id="billing-trend-title">Billing and collections</h2><p>Monthly invoices issued and payments posted in the selected period</p></div><Banknote aria-hidden="true" /></div>
        {data.monthlyCollections.length ? <>
          <div className="trend-legend" aria-hidden="true"><span><i className="trend-swatch billed" /> Billed</span><span><i className="trend-swatch collected" /> Collected</span></div>
          <div className="comparison-chart" aria-hidden="true">{data.monthlyCollections.map((item) => <div className="comparison-month" key={item.month}>
            <div className="comparison-bars"><span className={`comparison-bar billed${item.billedCentavos === '0' ? ' is-zero' : ''}`} style={{ height: `${percentage(item.billedCentavos)}%` }} title={`Billed ${peso(item.billedCentavos)}`} /><span className={`comparison-bar collected${item.amountCentavos === '0' ? ' is-zero' : ''}`} style={{ height: `${percentage(item.amountCentavos)}%` }} title={`Collected ${peso(item.amountCentavos)}`} /></div>
            <strong>{monthLabel(item.month)}</strong>
          </div>)}</div>
          <details className="trend-data-details"><summary>View exact monthly totals</summary><div className="dense-table-wrap trend-table-wrap"><table className="dense-table trend-data-table"><caption className="sr-only">Exact monthly billed and collected totals</caption><thead><tr><th>Month</th><th className="numeric">Billed</th><th className="numeric">Collected</th></tr></thead><tbody>{data.monthlyCollections.map((item) => <tr key={item.month}><th scope="row">{monthLabel(item.month)}</th><td className="numeric">{peso(item.billedCentavos)}</td><td className="numeric">{peso(item.amountCentavos)}</td></tr>)}</tbody></table></div></details>
        </> : <p className="empty-inline">No invoices or posted collections in this period.</p>}
      </section>

    </div>

    {(canViewReceivables || canViewCollections || canVerifyGcash) && <section className="dashboard-attention" aria-labelledby="attention-title">
      <header><div><span className="eyebrow">Action needed</span><h2 id="attention-title">Operational attention</h2></div><p>Permission-scoped shortcuts to open work</p></header>
      <div className="attention-grid">
        {canViewReceivables && <article className="attention-card"><div className="attention-card-heading"><h3>Overdue accounts</h3><Clock3 aria-hidden="true" /></div>
          {overdueQueue.isPending ? <p className="attention-state" role="status">Loading overdue accounts…</p> : overdueQueue.isError ? <button className="attention-retry" onClick={() => void overdueQueue.refetch()}>Could not load · Retry</button> : overdueQueue.data.rows.length ? <ul>{overdueQueue.data.rows.slice(0, 5).map((row) => <li key={row.invoiceId}><span><strong>{row.subscriberName}</strong><small>{row.accountNumber} · {row.daysOverdue} days overdue</small></span><strong className="numeric">{peso(row.balanceCentavos)}</strong></li>)}</ul> : <p className="attention-state">No overdue balances need follow-up.</p>}
          <Link className="attention-link" to="/receivables/overdue">Open overdue accounts <ExternalLink aria-hidden="true" /></Link>
        </article>}
        {canViewCollections && <article className="attention-card"><div className="attention-card-heading"><h3>Batch exceptions</h3><Users aria-hidden="true" /></div>
          {batchQueue.isPending ? <p className="attention-state" role="status">Loading collection batches…</p> : batchQueue.isError ? <button className="attention-retry" onClick={() => void batchQueue.refetch()}>Could not load · Retry</button> : batchExceptions.length ? <ul>{batchExceptions.map((batch) => {
              const difference = BigInt(batch.remittance?.differenceCentavos ?? '0');
              const variance = difference < 0n ? `Short ${peso((-difference).toString())}` : difference > 0n ? `Over ${peso(difference.toString())}` : batch.status;
              return <li key={batch.id}><span><strong>{batch.batchNumber}</strong><small>{batch.collectorName} · {batch.status}</small></span><Link className={`attention-variance ${difference < 0n ? 'variance-short' : difference > 0n ? 'variance-over' : ''}`} to={`/collections/batches/${batch.id}`} aria-label={`${batch.batchNumber}: ${variance}`}>{variance}</Link></li>;
            })}</ul> : <p className="attention-state">No open remittance exceptions.</p>}
          <Link className="attention-link" to="/collections/remittance">Open remittance <ExternalLink aria-hidden="true" /></Link>
        </article>}
        {canVerifyGcash && <article className="attention-card gcash-attention"><div className="attention-card-heading"><h3>GCash verification</h3><Banknote aria-hidden="true" /></div>
          {gcashQueue.isPending ? <p className="attention-state" role="status">Checking pending proofs…</p> : gcashQueue.isError ? <button className="attention-retry" onClick={() => void gcashQueue.refetch()}>Could not load · Retry</button> : <><strong className="attention-count">{gcashQueue.data.total.toLocaleString()}</strong><p className="attention-state">Unverified proof{gcashQueue.data.total === 1 ? '' : 's'} awaiting review. Not included in posted collections.</p></>}
          <Link className="attention-link" to="/payments/gcash">Review proofs <ExternalLink aria-hidden="true" /></Link>
        </article>}
      </div>
    </section>}

    <div className="dashboard-grid dashboard-detail-grid">
      <section className="insight-card"><div className="card-title"><div><h2>Payment mix</h2><p>Posted value by method · selected period</p></div><ArrowDownRight aria-hidden="true" /></div>
        {data.paymentMethods.length ? <div className="method-list">{data.paymentMethods.map((item) => { const share = data.collectedCentavos === '0' ? 0 : Number(BigInt(item.amountCentavos) * 100n / BigInt(data.collectedCentavos)); return <div key={item.method}><div><strong>{item.method.replaceAll('_', ' ')}</strong><span>{peso(item.amountCentavos)} · {item.count}</span></div><div className="progress-track"><span style={{ width: `${share}%` }} /></div><small>{share}%</small></div>; })}</div> : <p className="empty-inline">No posted payments in this period.</p>}
      </section>

      <section className="insight-card aging-card"><div className="card-title"><div><h2>Accounts receivable aging</h2><p>Current open balances by age · today</p></div><span className="total-pill">{peso(agingTotal.toString())}</span></div><div className="aging-list">{Object.entries(data.aging).map(([key, value]) => { const share = agingTotal === 0n ? 0 : Number(BigInt(value) * 100n / agingTotal); return <div key={key}><span>{receivableAgingBucketLabel(key as AgingBucket)}</span><div className="aging-bar"><i style={{ width: `${share}%` }} /></div><strong>{peso(value)}</strong></div>; })}</div></section>

      {canViewCollections && <section className="insight-card collector-card"><div className="card-title"><div><h2>Collector performance</h2><p>Route outcomes for the selected period</p></div><Users aria-hidden="true" /></div>{data.collectorPerformance.length ? <div className="dense-table-wrap"><table className="dense-table"><thead><tr><th>Collector</th><th>Accounts</th><th>Completion</th><th className="numeric">Amount</th><th className="numeric">Variance</th></tr></thead><tbody>{data.collectorPerformance.map((collector) => { const completion = collector.assignedAccounts === 0 ? 0 : Math.round(collector.collectedAccounts * 100 / collector.assignedAccounts); return <tr key={collector.collectorId}><td><strong>{collector.collectorName}</strong></td><td>{collector.collectedAccounts} / {collector.assignedAccounts}</td><td><div className="collector-completion"><span>{completion}%</span><div className="progress-track"><span style={{ width: `${completion}%` }} /></div></div></td><td className="numeric">{peso(collector.amountCentavos)}</td><td className={`numeric ${BigInt(collector.varianceCentavos) < 0n ? 'variance-short' : BigInt(collector.varianceCentavos) > 0n ? 'variance-over' : ''}`}>{peso(collector.varianceCentavos)}</td></tr>; })}</tbody></table></div> : <p className="empty-inline">No active collectors are assigned to routes in this period.</p>}</section>}

      {user.permissions.includes('subscriber.view') && <section className="insight-card recent-card"><div className="card-title"><div><h2>Recent collections</h2><p>Latest issued receipts</p></div></div>{data.recentPayments.length ? <div className="dense-table-wrap"><table className="dense-table"><thead><tr><th>Receipt</th><th>Subscriber</th><th>Method</th><th>Date</th><th className="numeric">Amount</th></tr></thead><tbody>{data.recentPayments.map((payment) => <tr key={payment.id}><td><strong>{payment.receiptNumber}</strong></td><td>{payment.subscriberName}</td><td><span className="method-badge">{payment.method}</span></td><td>{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(payment.paymentDate))}</td><td className="numeric"><strong>{peso(payment.amountCentavos)}</strong></td></tr>)}</tbody></table></div> : <p className="empty-inline">No posted receipts are available yet.</p>}</section>}
    </div>
  </div>;
}
