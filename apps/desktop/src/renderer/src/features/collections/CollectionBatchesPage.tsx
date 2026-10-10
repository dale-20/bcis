import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, Route as RouteIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AuthenticatedUser, CollectionBatch } from '@bcis/shared';
import { PageError, PageLoading } from '../../components/PageFeedback';
import { Button } from '../../components/ui/button';
import { closeCollectionBatch, createCollectionBatch, getCollectionBatch, getCollectionReferences, getEligibleCollectionPayments, listCollectionBatches, recordCollection, reconcileCollectionBatch, remitCollectionBatch, submitCollectionBatch } from '../../services/api';

const money = (value: string) => {
  const cents = BigInt(value);
  const pesos = cents / 100n;
  const fraction = (cents < 0n ? -cents : cents) % 100n;
  return `${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(pesos)}.${fraction.toString().padStart(2, '0')}`;
};
const toCentavos = (amount: string) => {
  const parsed = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!parsed) throw new Error('Enter a valid Peso amount with up to two decimal places.');
  return (BigInt(parsed[1] ?? '0') * 100n + BigInt((parsed[2] ?? '').padEnd(2, '0') || '0')).toString();
};
const localDate = () => new Date().toISOString().slice(0, 10);
const statuses: Record<CollectionBatch['status'], string> = { OPEN: 'Open', IN_PROGRESS: 'In progress', SUBMITTED: 'Submitted', REMITTED: 'Remitted', RECONCILED: 'Reconciled', CLOSED: 'Closed' };

function BatchCreate({ user, onCreated }: { user: AuthenticatedUser; onCreated: (id: string) => void }) {
  const references = useQuery({ queryKey: ['collection-reference-data'], queryFn: getCollectionReferences });
  const [collectorId, setCollectorId] = useState('');
  const [collectionAreaId, setCollectionAreaId] = useState('');
  const [collectionDate, setCollectionDate] = useState(localDate());
  const create = useMutation({ mutationFn: createCollectionBatch, onSuccess: (batch) => onCreated(batch.id) });
  if (references.isPending) return <PageLoading label="Loading collectors and routes…" />;
  if (references.isError) return <PageError title="Collection setup unavailable" message={references.error.message} onRetry={() => void references.refetch()} />;
  const collectors = references.data.collectors.filter((item) => item.status === 'ACTIVE');
  const areas = references.data.areas.filter((item) => item.status === 'ACTIVE');
  return <section className="list-surface collection-create">
    <div className="section-heading"><div><h2>Prepare a route batch</h2><p>Creates an immutable account and balance snapshot for the selected route date.</p></div></div>
    {!user.permissions.includes('collection.manage') ? <p className="empty-inline">You have read access. Ask a Collection Supervisor to create a route batch.</p> : <form className="collection-create-form" onSubmit={(event) => { event.preventDefault(); create.mutate({ collectorId, collectionAreaId, collectionDate }); }}>
      <label className="field-label"><span>Collector</span><select className="select-input" value={collectorId} required onChange={(event) => setCollectorId(event.target.value)}><option value="">Select collector</option>{collectors.map((item) => <option key={item.id} value={item.id}>{item.collectorNumber} · {item.name}</option>)}</select></label>
      <label className="field-label"><span>Area / route</span><select className="select-input" value={collectionAreaId} required onChange={(event) => setCollectionAreaId(event.target.value)}><option value="">Select area</option>{areas.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
      <label className="field-label"><span>Collection date</span><input className="text-input" type="date" value={collectionDate} required onChange={(event) => setCollectionDate(event.target.value)} /></label>
      <Button type="submit" disabled={create.isPending || !collectorId || !collectionAreaId}>{create.isPending ? 'Preparing…' : 'Create route batch'}</Button>
      {create.error && <p className="form-alert" role="alert">{create.error.message}</p>}
    </form>}
  </section>;
}

function BatchDetail({ id, user, onBack }: { id: string; user: AuthenticatedUser; onBack: () => void }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['collection-batch', id], queryFn: () => getCollectionBatch(id) });
  const [recordTarget, setRecordTarget] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState('');
  const eligiblePayments = useQuery({ queryKey: ['eligible-collection-payments', id, recordTarget], queryFn: () => recordTarget ? getEligibleCollectionPayments(id, recordTarget) : Promise.resolve([]), enabled: Boolean(recordTarget) });
  const [recordNotes, setRecordNotes] = useState('');
  const [remittedCash, setRemittedCash] = useState('');
  const [remitNotes, setRemitNotes] = useState('');
  const [reconcileNotes, setReconcileNotes] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const update = useMutation({ mutationFn: async (action: { kind: 'record'; accountId: string } | { kind: 'submit' } | { kind: 'remit' } | { kind: 'reconcile' } | { kind: 'close' }) => {
    if (action.kind === 'record') {
      if (!paymentId) throw new Error('Select a posted receipt before recording the collection.');
      return recordCollection(id, { batchAccountId: action.accountId, paymentId, ...(recordNotes.trim() ? { notes: recordNotes.trim() } : {}) });
    }
    if (action.kind === 'submit') return submitCollectionBatch(id);
    if (action.kind === 'remit') return remitCollectionBatch(id, { remittedCashCentavos: toCentavos(remittedCash), ...(remitNotes.trim() ? { notes: remitNotes.trim() } : {}) });
    if (action.kind === 'reconcile') return reconcileCollectionBatch(id, { notes: reconcileNotes.trim() });
    return closeCollectionBatch(id, { ...(closeNotes.trim() ? { notes: closeNotes.trim() } : {}) });
  }, onSuccess: async () => { setRecordTarget(null); setPaymentId(''); await client.invalidateQueries({ queryKey: ['collection-batch', id] }); await client.invalidateQueries({ queryKey: ['collection-batches'] }); await client.invalidateQueries({ queryKey: ['eligible-collection-payments', id] }); } });
  if (query.isPending) return <PageLoading label="Loading route sheet…" />;
  if (query.isError) return <PageError title="Route batch unavailable" message={query.error.message} onRetry={() => void query.refetch()} />;
  const batch = query.data;
  const canManage = user.permissions.includes('collection.manage');
  const canReconcile = user.permissions.includes('collection.reconcile');
  const canClose = user.permissions.includes('collection.close');
  const cashExpected = batch.accounts.filter((account) => account.paymentMethod === 'CASH').reduce((total, account) => total + BigInt(account.paymentAmountCentavos ?? '0'), 0n).toString();
  const nonCashExpected = batch.accounts.filter((account) => account.paymentMethod && account.paymentMethod !== 'CASH').reduce((total, account) => total + BigInt(account.paymentAmountCentavos ?? '0'), 0n).toString();
  return <div className="content-enter collection-batch-detail">
    <header className="page-heading page-heading-actions no-print"><div><button className="text-button" onClick={onBack}><ArrowLeft /> All batches</button><h1>{batch.batchNumber}</h1><p>{batch.collectorName} · {batch.collectionAreaName} · {new Intl.DateTimeFormat('en-PH', { dateStyle: 'long' }).format(new Date(`${batch.collectionDate}T00:00:00`))}</p></div><Button variant="outline" onClick={() => window.print()}><Printer /> Print route sheet</Button></header>
    <div className="collection-summary-grid"><article><span>Route receivable</span><strong>{money(batch.expectedReceivableCentavos)}</strong><small>{batch.accounts.length} service accounts</small></article><article><span>Recorded Cash</span><strong>{money(cashExpected)}</strong><small>Cash linked to posted receipts</small></article><article><span>Recorded non-cash</span><strong>{money(nonCashExpected)}</strong><small>Other linked payment methods</small></article><article><span>Status</span><strong className={`status-badge status-${batch.status.toLowerCase()}`}>{statuses[batch.status]}</strong><small>{batch.accounts.filter((account) => account.paymentId).length} of {batch.accounts.length} recorded</small></article></div>
    {batch.remittance && <section className={`collection-variance ${BigInt(batch.remittance.differenceCentavos) === 0n ? 'balanced' : 'unbalanced'}`} aria-live="polite"><div><span>Expected Cash</span><strong>{money(batch.remittance.expectedCashCentavos)}</strong></div><div><span>Remitted Cash</span><strong>{money(batch.remittance.remittedCashCentavos)}</strong></div><div><span>Difference</span><strong>{BigInt(batch.remittance.differenceCentavos) < 0n ? 'Short ' : BigInt(batch.remittance.differenceCentavos) > 0n ? 'Over ' : ''}{money(batch.remittance.differenceCentavos.replace('-', ''))}</strong></div><p>{batch.remittance.notes ?? 'No remittance note'} {batch.reconciliationNotes && `· Reconciliation: ${batch.reconciliationNotes}`}</p></section>}
    <section className="list-surface route-sheet"><div className="section-heading"><div><h2><RouteIcon /> Route sheet</h2><p>Account, installation address, current bill, arrears, total due, and collection evidence.</p></div></div><div className="report-table-wrap">{batch.accounts.length === 0 ? <p className="empty-inline">No open receivables were assigned to this route on the selected date.</p> : <table className="report-table" aria-label="Collection route sheet"><thead><tr><th>Subscriber / account</th><th>Installation address</th><th className="numeric">Current bill</th><th className="numeric">Arrears</th><th className="numeric">Total due</th><th>Collection</th></tr></thead><tbody>{batch.accounts.map((account) => <tr key={account.id}><td><strong>{account.subscriberName}</strong><small>{account.accountNumber} · {account.serviceAccountNumber}</small></td><td>{account.address}</td><td className="numeric">{money(account.currentBillCentavos)}</td><td className="numeric">{money(account.arrearsCentavos)}</td><td className="numeric"><strong>{money(account.amountDueCentavos)}</strong></td><td>{account.paymentId ? <><strong>{account.paymentMethod} · {money(account.paymentAmountCentavos ?? '0')}</strong><small>Receipt linked · {account.outcome}</small>{account.notes && <small>{account.notes}</small>}</> : canManage && ['OPEN', 'IN_PROGRESS'].includes(batch.status) ? recordTarget === account.id ? <div className="collection-link-form"><label><span className="sr-only">Posted receipt</span><select className="select-input" aria-label={`Posted receipt for ${account.subscriberName}`} value={paymentId} onChange={(event) => setPaymentId(event.target.value)} disabled={eligiblePayments.isPending}><option value="">{eligiblePayments.isPending ? 'Finding posted receipts…' : eligiblePayments.data?.length ? 'Select posted receipt' : 'No same-day posted receipts'}</option>{eligiblePayments.data?.map((payment) => <option key={payment.paymentId} value={payment.paymentId}>{payment.receiptNumber} · {payment.method} · {money(payment.amountCentavos)}</option>)}</select></label>{eligiblePayments.isError && <small role="alert">{eligiblePayments.error.message}</small>}<input className="text-input" aria-label="Collection note" placeholder="Optional note" value={recordNotes} onChange={(event) => setRecordNotes(event.target.value)} /><div><Button size="sm" disabled={update.isPending || !paymentId} onClick={() => update.mutate({ kind: 'record', accountId: account.id })}>Link receipt</Button><Button size="sm" variant="outline" onClick={() => setRecordTarget(null)}>Cancel</Button></div></div> : <Button size="sm" variant="outline" onClick={() => { setRecordTarget(account.id); setPaymentId(''); update.reset(); }}>Record receipt</Button> : <span className="status-badge status-inactive">Not collected</span>}</td></tr>)}</tbody></table>}</div>{update.error && <p className="form-alert" role="alert">{update.error.message}</p>}</section>
    <section className="list-surface collection-actions no-print"><div className="section-heading"><div><h2>Batch workflow</h2><p>Each step is authorized and recorded by the server.</p></div></div>
      {canManage && ['OPEN', 'IN_PROGRESS'].includes(batch.status) && <Button disabled={update.isPending || !batch.accounts.some((account) => account.paymentId)} onClick={() => update.mutate({ kind: 'submit' })}>Submit collected route</Button>}
      {canReconcile && batch.status === 'SUBMITTED' && <form onSubmit={(event) => { event.preventDefault(); update.mutate({ kind: 'remit' }); }}><h3>Record remittance</h3><label className="field-label"><span>Cash remitted (PHP)</span><input className="text-input" inputMode="decimal" pattern="(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?" required value={remittedCash} onChange={(event) => setRemittedCash(event.target.value)} placeholder="e.g. 1,250.00" /></label><label className="field-label"><span>Remittance note</span><input className="text-input" maxLength={255} value={remitNotes} onChange={(event) => setRemitNotes(event.target.value)} /></label><Button type="submit" disabled={update.isPending}>Save remittance</Button></form>}
      {canReconcile && batch.status === 'REMITTED' && <form onSubmit={(event) => { event.preventDefault(); update.mutate({ kind: 'reconcile' }); }}><h3>Reconcile variance</h3><label className="field-label"><span>Reconciliation notes</span><textarea className="text-area" minLength={3} maxLength={255} required value={reconcileNotes} onChange={(event) => setReconcileNotes(event.target.value)} /></label><Button type="submit" disabled={update.isPending}>Confirm reconciliation</Button></form>}
      {canClose && batch.status === 'RECONCILED' && <form onSubmit={(event) => { event.preventDefault(); update.mutate({ kind: 'close' }); }}><h3>Close batch</h3>{batch.remittance && BigInt(batch.remittance.differenceCentavos) !== 0n && <p className="variance-warning">Variance of {money(batch.remittance.differenceCentavos.replace('-', ''))} remains visible. Enter the authorized acknowledgement to close without balancing it.</p>}<label className="field-label"><span>Close acknowledgement {batch.remittance && BigInt(batch.remittance.differenceCentavos) !== 0n ? '*' : '(optional)'}</span><textarea className="text-area" minLength={3} maxLength={255} required={Boolean(batch.remittance && BigInt(batch.remittance.differenceCentavos) !== 0n)} value={closeNotes} onChange={(event) => setCloseNotes(event.target.value)} /></label><Button type="submit" disabled={update.isPending || (Boolean(batch.remittance && BigInt(batch.remittance.differenceCentavos) !== 0n) && closeNotes.trim().length < 3)}>Close batch</Button></form>}
      {batch.status === 'CLOSED' && <p className="success-callout">Closed {batch.closedAt ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(batch.closedAt)) : ''}. Finalized route and variance records are preserved.</p>}
    </section>
  </div>;
}

export function CollectionBatchesPage({ user, batchId }: { user: AuthenticatedUser; batchId?: string | undefined }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const batches = useQuery({ queryKey: ['collection-batches', page], queryFn: () => listCollectionBatches({ page, pageSize: 20 }), enabled: !batchId });
  if (batchId) return <BatchDetail id={batchId} user={user} onBack={() => navigate('/collections/batches')} />;
  if (batches.isPending) return <PageLoading label="Loading collection batches…" />;
  if (batches.isError) return <PageError title="Collection batches unavailable" message={batches.error.message} onRetry={() => void batches.refetch()} />;
  return <div className="content-enter collection-workspace"><header className="page-heading"><div><h1>Collection batches</h1><p>Prepare route snapshots, track field results, and reconcile remittance variances.</p></div></header><BatchCreate user={user} onCreated={(id) => { void client.invalidateQueries({ queryKey: ['collection-batches'] }); navigate(`/collections/batches/${id}`); }} /><section className="list-surface"><div className="section-heading"><div><h2>Recent route batches</h2><p>{batches.data.total} total · showing page {batches.data.page} of {Math.max(1, batches.data.pageCount)}</p></div></div><div className="report-table-wrap">{batches.data.items.length === 0 ? <p className="empty-inline">No route batches have been created yet.</p> : <table className="report-table" aria-label="Recent collection batches"><thead><tr><th>Batch</th><th>Route date</th><th>Collector / area</th><th>Status</th><th className="numeric">Route amount</th><th>Progress</th><th /></tr></thead><tbody>{batches.data.items.map((batch) => <tr key={batch.id}><td><strong>{batch.batchNumber}</strong></td><td>{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(`${batch.collectionDate}T00:00:00`))}</td><td>{batch.collectorName}<small>{batch.collectionAreaName}</small></td><td><span className={`status-badge status-${batch.status.toLowerCase()}`}>{statuses[batch.status]}</span></td><td className="numeric">{money(batch.expectedReceivableCentavos)}</td><td>{batch.recordedAccountCount}/{batch.accountCount} collected{batch.remittance && <small>Cash variance {money(batch.remittance.differenceCentavos.replace('-', ''))}</small>}</td><td><Button size="sm" variant="outline" onClick={() => navigate(`/collections/batches/${batch.id}`)}>Open</Button></td></tr>)}</tbody></table>}</div><footer className="table-pagination"><span>{batches.data.total} batches</span><div><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= batches.data.pageCount} onClick={() => setPage((value) => value + 1)}>Next</Button></div></footer></section></div>;
}

export function CollectionRemittancePage({ user }: { user: AuthenticatedUser }) {
  return <CollectionBatchesPage user={user} />;
}
