import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, FileBarChart2, RefreshCw, WalletCards } from 'lucide-react';
import type { ReceivableAgingQuery } from '@bcis/shared';
import { Button } from '../../components/ui/button';
import { PageError, PageLoading } from '../../components/PageFeedback';
import { getCollectionReferences, getReceivableAging } from '../../services/api';

type ReceivablesMode = 'outstanding' | 'overdue' | 'aging';
const dateToday = () => new Date().toISOString().slice(0, 10);
const money = (value: string) => {
  const cents = BigInt(value);
  const pesos = cents / 100n;
  const fraction = (cents < 0n ? -cents : cents) % 100n;
  return `${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(pesos)}.${fraction.toString().padStart(2, '0')}`;
};
const bucketLabel = (bucket: string) => bucket === 'CURRENT' ? 'Current' : bucket.replace('_', '–');

export function ReceivablesPage({ mode }: { mode: ReceivablesMode }) {
  const [asOf, setAsOf] = useState(dateToday);
  const [collectorId, setCollectorId] = useState('');
  const [collectionAreaId, setCollectionAreaId] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const references = useQuery({ queryKey: ['collection-reference-data'], queryFn: getCollectionReferences });
  const query: ReceivableAgingQuery = {
    asOf,
    overdueOnly: mode === 'overdue',
    page,
    pageSize,
    ...(collectorId ? { collectorId } : {}),
    ...(collectionAreaId ? { collectionAreaId } : {}),
  };
  const result = useQuery({ queryKey: ['receivables', mode, query], queryFn: () => getReceivableAging(query) });
  const titles: Record<ReceivablesMode, string> = {
    outstanding: 'Outstanding receivables', overdue: 'Overdue accounts', aging: 'Accounts receivable aging',
  };
  const descriptions: Record<ReceivablesMode, string> = {
    outstanding: 'Open finalized invoice balances as of the selected business date.',
    overdue: 'Past-due invoice balances, ordered by oldest due date first.',
    aging: 'Outstanding invoice balances grouped into non-overlapping aging buckets.',
  };
  if (references.isPending) return <PageLoading label="Loading receivable filters…" />;
  if (references.isError) return <PageError title="Receivable filters unavailable" message={references.error.message} onRetry={() => void references.refetch()} />;

  return <div className="content-enter">
    <header className="page-heading page-heading-actions">
      <div><span className="eyebrow">Receivables</span><h1>{titles[mode]}</h1><p>{descriptions[mode]}</p></div>
      <Button variant="outline" onClick={() => void result.refetch()} disabled={result.isFetching}><RefreshCw aria-hidden="true" /> Refresh</Button>
    </header>
    <section className="list-surface receivable-filters" aria-label="Receivable filters">
      <label className="field-label"><span>As of</span><input className="text-input" type="date" value={asOf} onChange={(event) => { setAsOf(event.target.value); setPage(1); }} /></label>
      <label className="field-label"><span>Collector</span><select className="select-input" value={collectorId} onChange={(event) => { setCollectorId(event.target.value); setPage(1); }}><option value="">All collectors</option>{references.data.collectors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field-label"><span>Collection area</span><select className="select-input" value={collectionAreaId} onChange={(event) => { setCollectionAreaId(event.target.value); setPage(1); }}><option value="">All areas</option>{references.data.areas.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
    </section>
    {result.isPending ? <PageLoading label="Loading receivable balances…" /> : result.isError ? <PageError title="Receivable data unavailable" message={result.error.message} onRetry={() => void result.refetch()} /> : <>
      {result.isFetching && <p className="refreshing-note" role="status">Updating receivables…</p>}
      <section className="receivable-total-grid" aria-label="Aging totals">
        {Object.entries(result.data.totals).filter(([key]) => mode === 'aging' ? key !== 'total' : key === 'total').map(([key, value]) => <article className="receivable-total" key={key}><span>{key === 'total' ? 'Outstanding total' : bucketLabel(key)}</span><strong>{money(value)}</strong>{mode === 'aging' && <small>centavos exact</small>}</article>)}
      </section>
      <section className="list-surface receivable-table-wrap" aria-label="Open invoice balances">
        {result.data.rows.length === 0 ? <div className="empty-state"><div><WalletCards aria-hidden="true" /></div><h2>No open balances found</h2><p>Try a different date or remove one of the route filters.</p></div> : <div className="table-scroll" role="region" aria-label="Open invoice balance results" tabIndex={0}><table className="data-table receivable-table"><thead><tr><th>Subscriber</th><th>Service account</th><th>Due date</th><th>Age</th><th>Area / collector</th><th className="amount-cell">Balance</th></tr></thead><tbody>{result.data.rows.map((row) => <tr key={row.invoiceId}><td><strong>{row.subscriberName}</strong><small>{row.accountNumber} · {row.invoiceNumber}</small></td><td>{row.serviceAccountNumber}</td><td>{row.dueDate}</td><td><span className={`status-badge ${row.daysOverdue > 0 ? 'status-warning' : 'status-active'}`}>{bucketLabel(row.bucket)}{row.daysOverdue > 0 ? ` · ${row.daysOverdue}d` : ''}</span></td><td>{row.collectionAreaName ?? 'Unassigned'}<small>{row.collectorName ?? 'No collector'}</small></td><td className="amount-cell">{money(row.balanceCentavos)}</td></tr>)}</tbody></table></div>}
        <footer className="receivable-pagination"><span>{result.data.total} open invoice{result.data.total === 1 ? '' : 's'} · page {result.data.page}</span><div><Button variant="outline" size="sm" disabled={page <= 1 || result.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}><ArrowLeft aria-hidden="true" /> Previous</Button><Button variant="outline" size="sm" disabled={page * pageSize >= result.data.total || result.isFetching} onClick={() => setPage((value) => value + 1)}>Next <ArrowRight aria-hidden="true" /></Button></div></footer>
      </section>
      {mode === 'aging' && <p className="receivable-footnote"><FileBarChart2 aria-hidden="true" /> Totals include all matching open invoices, not only the visible page. Day 90 belongs to 61–90; 90+ starts on day 91.</p>}
    </>}
  </div>;
}
