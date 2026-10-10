/* eslint-disable react-hooks/incompatible-library -- TanStack Table is required for the server-paginated payment history. */
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCoreRowModel, useReactTable, flexRender, type ColumnDef } from '@tanstack/react-table';
import { Banknote, ChevronLeft, ChevronRight, Printer, Search, ShieldCheck } from 'lucide-react';
import type { AuthenticatedUser, PaymentHistoryItem, PaymentMethod, PaymentStatus } from '@bcis/shared';
import { PageError, PageLoading } from '../../components/PageFeedback';
import { Button } from '../../components/ui/button';
import { getPayment, listPayments, listSubscribers, postPayment, previewPayment, reversePayment } from '../../services/api';

type Mode = 'receive' | 'history';
type CollectMethod = Exclude<PaymentMethod, 'GCASH'>;
const peso = (centavos: string) => {
  const amount = BigInt(centavos);
  const fraction = (amount % 100n).toString().padStart(2, '0');
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .formatToParts(amount / 100n).map((part) => part.type === 'fraction' ? fraction : part.value).join('');
};
const dateTime = (value: string) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

function parseCentavos(value: string): string | null {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const amount = BigInt(whole ?? '0') * 100n + BigInt(fraction.padEnd(2, '0'));
  return amount > 0n ? amount.toString() : null;
}

function ReceiveWorkspace({ user }: { user: AuthenticatedUser }) {
  const [search, setSearch] = useState('');
  const [subscriberId, setSubscriberId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<CollectMethod>('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [postedPaymentId, setPostedPaymentId] = useState<string | null>(null);
  const client = useQueryClient();
  const subscribers = useQuery({
    queryKey: ['payment-subscriber-search', search],
    queryFn: () => listSubscribers({ query: search.trim(), status: 'ALL', page: 1, pageSize: 20, sort: 'name', direction: 'asc' }),
    enabled: search.trim().length >= 2,
  });
  const centavos = parseCentavos(amount);
  const allocation = useQuery({
    queryKey: ['payment-preview', subscriberId, centavos ?? 'balance'],
    queryFn: () => previewPayment({ subscriberId: subscriberId ?? '', amountCentavos: centavos ?? '1' }),
    enabled: Boolean(subscriberId),
  });
  const postedReceipt = useQuery({ queryKey: ['payment', postedPaymentId], queryFn: () => getPayment(postedPaymentId ?? ''), enabled: Boolean(postedPaymentId) });
  const post = useMutation({
    mutationFn: async () => {
      if (!subscriberId || !centavos) throw new Error('Choose a subscriber and enter a valid amount.');
      const base = { subscriberId, amountCentavos: centavos, paymentDate: new Date(paymentDate).toISOString(), idempotencyKey: crypto.randomUUID() };
      if (method === 'CASH') return postPayment({ ...base, method, ...(notes.trim() ? { notes: notes.trim() } : {}) });
      if (method === 'BANK_TRANSFER' || method === 'CHEQUE') {
        if (reference.trim().length < 3) throw new Error('Enter the bank transfer or cheque reference.');
        return postPayment({ ...base, method, referenceNumber: reference.trim(), ...(notes.trim() ? { notes: notes.trim() } : {}) });
      }
      if (notes.trim().length < 3) throw new Error('Explain the other payment method in the notes.');
      return postPayment({ ...base, method: 'OTHER', notes: notes.trim(), ...(reference.trim() ? { referenceNumber: reference.trim() } : {}) });
    },
    onSuccess: async (result) => {
      setPostedPaymentId(result.paymentId);
      setAmount(''); setReference(''); setNotes('');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['payments'] }),
        client.invalidateQueries({ queryKey: ['payment-preview', subscriberId] }),
      ]);
    },
  });
  const selectedSubscriber = subscribers.data?.items.find((subscriber) => subscriber.id === subscriberId);
  const mayPost = user.permissions.includes('payment.create');

  return <div className="content-enter payment-workspace">
    <header className="page-heading"><h1>Receive payment</h1><p>Review the oldest-first allocation before posting. The server rechecks balances when it commits.</p></header>
    <div className="payment-receive-grid">
      <section className="list-surface payment-entry-card" aria-labelledby="payment-entry-title">
        <div className="section-heading compact"><div><span className="eyebrow">Cashier workflow</span><h2 id="payment-entry-title">Payment details</h2></div><span className="payment-step"><Banknote aria-hidden="true" /> 1 / 3</span></div>
        <label className="form-field"><span>Find subscriber</span><div className="search-field"><Search aria-hidden="true" /><input value={search} onChange={(event) => { setSearch(event.target.value); setSubscriberId(null); setPostedPaymentId(null); }} placeholder="Name, account, phone, or service number" autoComplete="off" /></div></label>
        {search.trim().length >= 2 && <div className="payment-subscriber-results" aria-live="polite">{subscribers.isPending ? <p>Searching subscribers...</p> : subscribers.isError ? <p className="form-error">{subscribers.error.message}</p> : subscribers.data.items.length === 0 ? <p>No matching subscribers found.</p> : subscribers.data.items.map((subscriber) => <button key={subscriber.id} type="button" className={subscriber.id === subscriberId ? 'selected' : ''} onClick={() => { setSubscriberId(subscriber.id); setPostedPaymentId(null); }}><span><strong>{subscriber.displayName}</strong><small>{subscriber.accountNumber} · {subscriber.primaryContact ?? 'No primary contact'}</small></span><span className="status-badge">{subscriber.activeServiceCount} active</span></button>)}</div>}
        {subscriberId && allocation.isPending && <PageLoading label="Loading subscriber balance..." />}
        {subscriberId && allocation.isError && <PageError title="Balance unavailable" message={allocation.error.message} onRetry={() => void allocation.refetch()} />}
        {allocation.data && <div className="payment-balance-summary"><div><span>Subscriber</span><strong>{selectedSubscriber?.displayName ?? allocation.data.subscriberName}</strong><small>{selectedSubscriber?.accountNumber ?? allocation.data.subscriberAccountNumber}</small></div><div><span>Outstanding</span><strong>{peso(allocation.data.outstandingCentavos)}</strong></div><div><span>Available credit</span><strong>{peso(allocation.data.existingAvailableCreditCentavos)}</strong></div></div>}
        <div className="payment-form-grid">
          <label className="form-field"><span>Amount received (PHP)</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" aria-describedby="payment-amount-hint" /><small id="payment-amount-hint">Enter pesos. Posting preserves exact centavos.</small></label>
          <label className="form-field"><span>Payment method</span><select value={method} onChange={(event) => setMethod(event.target.value as CollectMethod)}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option><option value="GCASH" disabled>GCash — proof workflow in next increment</option></select></label>
          <label className="form-field"><span>Payment date and time</span><input type="datetime-local" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
          {(method === 'BANK_TRANSFER' || method === 'CHEQUE' || method === 'OTHER') && <label className="form-field"><span>{method === 'CHEQUE' ? 'Cheque number' : method === 'BANK_TRANSFER' ? 'Transfer reference' : 'Reference (optional)'}</span><input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={100} /></label>}
          <label className="form-field payment-notes"><span>{method === 'OTHER' ? 'Explain payment method' : 'Notes (optional)'}</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={2} /></label>
        </div>
        {allocation.isError && <p className="form-error" role="alert">Allocation preview unavailable: {allocation.error.message}</p>}
        {amount && !centavos && <p className="form-error" role="alert">Enter a positive amount with up to two decimal places.</p>}
        {allocation.data && centavos && <section className="payment-allocation-preview" aria-labelledby="allocation-preview-title"><div className="section-heading compact"><div><h3 id="allocation-preview-title">Allocation preview</h3><p>Oldest due invoice first. Existing credit stays available.</p></div><span className="status-badge status-pending">Preview</span></div>{allocation.data.allocations.length === 0 ? <p className="empty-inline">No unpaid invoices. The full payment becomes customer credit.</p> : <div className="dense-table-wrap"><table className="dense-table"><thead><tr><th>Invoice</th><th>Due</th><th className="numeric">Open</th><th className="numeric">Allocate</th><th className="numeric">After</th></tr></thead><tbody>{allocation.data.allocations.map((item) => <tr key={item.invoiceId}><td><strong>{item.invoiceNumber}</strong><small>{item.period}</small></td><td>{item.dueDate}</td><td className="numeric">{peso(item.balanceBeforeCentavos)}</td><td className="numeric">{peso(item.allocationCentavos)}</td><td className="numeric">{peso(item.balanceAfterCentavos)}</td></tr>)}</tbody></table></div>}<div className="payment-preview-totals"><span>Allocated <strong>{peso(allocation.data.allocatedCentavos)}</strong></span><span>New customer credit <strong>{peso(allocation.data.unappliedCreditCentavos)}</strong></span></div></section>}
        {post.isError && <p className="form-error" role="alert">{post.error.message}</p>}
        <div className="payment-submit-row"><p>Cash, bank transfer, cheque, and other post immediately. GCash remains pending until proof is reviewed.</p><Button disabled={!mayPost || !subscriberId || !centavos || allocation.isPending || allocation.isError || post.isPending} onClick={() => { if (window.confirm(`Post ${peso(centavos ?? '0')} for ${selectedSubscriber?.displayName ?? 'this subscriber'}?`)) post.mutate(); }}>{post.isPending ? 'Posting…' : 'Confirm and post'}</Button></div>
      </section>
      <aside className="list-surface payment-posting-note"><span className="payment-note-icon"><ShieldCheck aria-hidden="true" /></span><h2>Protected financial posting</h2><p>The server locks the subscriber account, recalculates oldest-first allocations, creates a unique receipt, updates balances, and writes the audit record in one transaction.</p><ul><li>Duplicate requests use an idempotency key.</li><li>Unallocated value remains customer credit.</li><li>Receipt numbers are sequence-backed and never reused.</li></ul></aside>
    </div>
    {postedPaymentId && (postedReceipt.isPending ? <PageLoading label="Preparing receipt..." /> : postedReceipt.isError ? <PageError title="Payment posted; receipt details unavailable" message={postedReceipt.error.message} onRetry={() => void postedReceipt.refetch()} /> : postedReceipt.data && <ReceiptPrint payment={postedReceipt.data} />)}
  </div>;
}

function ReceiptPrint({ payment }: { payment: Awaited<ReturnType<typeof getPayment>> }) {
  return <section className="list-surface receipt-preview" aria-labelledby="receipt-title"><div className="section-heading compact receipt-actions"><div><span className="eyebrow">Payment posted</span><h2 id="receipt-title">Receipt {payment.receiptNumber ?? 'pending'}</h2></div><Button variant="outline" onClick={() => window.print()} disabled={!payment.receiptNumber}><Printer aria-hidden="true" /> Print receipt</Button></div><article className="receipt-paper"><header><strong>BCIS</strong><span>Official payment receipt</span></header><dl><div><dt>Receipt number</dt><dd>{payment.receiptNumber ?? 'Pending verification'}</dd></div><div><dt>Subscriber</dt><dd>{payment.subscriberName} · {payment.subscriberAccountNumber}</dd></div><div><dt>Paid on</dt><dd>{dateTime(payment.paymentDate)}</dd></div><div><dt>Receipt issued</dt><dd>{payment.receiptIssuedAt ? dateTime(payment.receiptIssuedAt) : 'Pending'}</dd></div><div><dt>Method</dt><dd>{payment.method.replaceAll('_', ' ')}</dd></div><div><dt>Received by</dt><dd>{payment.postedBy ?? payment.createdBy}</dd></div><div><dt>Amount</dt><dd>{peso(payment.amountCentavos)}</dd></div></dl><h3>Invoice allocations</h3>{payment.allocations.length === 0 ? <p>Applied to customer credit.</p> : <ul>{payment.allocations.map((item) => <li key={item.invoiceId}><span>{item.invoiceNumber} · {item.period}</span><strong>{peso(item.amountCentavos)}</strong></li>)}</ul>}<footer><span>Allocated: {peso(payment.allocatedCentavos)}</span><strong>Customer credit: {peso(payment.unappliedCreditCentavos)}</strong></footer></article></section>;
}

function HistoryWorkspace({ user }: { user: AuthenticatedUser }) {
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<'ALL' | PaymentMethod>('ALL');
  const [status, setStatus] = useState<'ALL' | PaymentStatus>('ALL');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const query = useQuery({ queryKey: ['payments', { search, method, status, page }], queryFn: () => listPayments({ query: search, method, status, page, pageSize: 20 }), placeholderData: keepPreviousData });
  const detail = useQuery({ queryKey: ['payment', selectedId], queryFn: () => getPayment(selectedId ?? ''), enabled: Boolean(selectedId) });
  const reverse = useMutation({ mutationFn: () => {
    if (!selectedId) throw new Error('Select a payment first.');
    return reversePayment(selectedId, { reason });
  }, onSuccess: async () => { setReason(''); await Promise.all([query.refetch(), detail.refetch()]); } });
  const mayReverse = user.permissions.includes('payment.reverse');
  const columns = useMemo<ColumnDef<PaymentHistoryItem>[]>(() => [
    { accessorKey: 'paymentDate', header: 'Date', cell: ({ getValue }) => dateTime(String(getValue())) },
    { accessorKey: 'subscriberName', header: 'Subscriber', cell: ({ row }) => <div><strong>{row.original.subscriberName}</strong><small>{row.original.subscriberAccountNumber}</small></div> },
    { accessorKey: 'receiptNumber', header: 'Receipt', cell: ({ row }) => <div><strong>{row.original.receiptNumber ?? '—'}</strong><small>{row.original.referenceNumber ?? row.original.method.replaceAll('_', ' ')}</small></div> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <span className={`status-badge status-${row.original.status.toLowerCase()}`}>{row.original.receiptStatus === 'VOID' ? 'REVERSED · RECEIPT VOID' : row.original.status.replaceAll('_', ' ')}</span> },
    { accessorKey: 'amountCentavos', header: 'Amount', cell: ({ getValue }) => <strong>{peso(String(getValue()))}</strong> },
  ], []);
  const table = useReactTable({ data: query.data?.items ?? [], columns, getCoreRowModel: getCoreRowModel(), manualPagination: true, rowCount: query.data?.total ?? 0 });
  return <div className="content-enter payment-workspace"><header className="page-heading"><h1>Payment history</h1><p>Search posted payments, receipt status, allocations, credit, and reversal history.</p></header><section className="list-surface"><div className="list-toolbar"><label className="search-field"><Search aria-hidden="true" /><span className="sr-only">Search payment history</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Subscriber, account, receipt, or reference" /></label><label className="filter-field"><span>Method</span><select value={method} onChange={(event) => { setMethod(event.target.value as PaymentMethod | 'ALL'); setPage(1); }}><option value="ALL">All methods</option>{['CASH','GCASH','BANK_TRANSFER','CHEQUE','OTHER'].map((item) => <option key={item} value={item}>{item.replaceAll('_',' ')}</option>)}</select></label><label className="filter-field"><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value as PaymentStatus | 'ALL'); setPage(1); }}><option value="ALL">All statuses</option>{['POSTED','PENDING_VERIFICATION','REJECTED','REVERSED'].map((item) => <option key={item} value={item}>{item.replaceAll('_',' ')}</option>)}</select></label></div>{query.isPending ? <PageLoading label="Loading payment history..." /> : query.isError ? <PageError title="Payment history unavailable" message={query.error.message} onRetry={() => void query.refetch()} /> : query.data.items.length === 0 ? <p className="empty-inline">No payments match these filters.</p> : <><div className="dense-table-wrap"><table className="dense-table payment-history-table"><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr key={row.id} tabIndex={0} aria-selected={selectedId === row.original.paymentId} onClick={() => setSelectedId(row.original.paymentId)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(row.original.paymentId); }}>{row.getVisibleCells().map((cell) => <td key={cell.id} className={cell.column.id === 'amountCentavos' ? 'numeric' : undefined}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table></div><div className="table-pagination"><span>{query.data.total} payment records</span><div><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft />Previous</Button><span>Page {page} of {Math.max(1, query.data.pageCount)}</span><Button variant="outline" size="sm" disabled={page >= query.data.pageCount} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight /></Button></div></div></>}</section>
    {selectedId && <section className="list-surface payment-detail-panel" aria-labelledby="payment-detail-title">{detail.isPending ? <PageLoading label="Loading payment detail..." /> : detail.isError ? <PageError title="Payment detail unavailable" message={detail.error.message} onRetry={() => void detail.refetch()} /> : <><div className="section-heading compact"><div><span className="eyebrow">Immutable payment record</span><h2 id="payment-detail-title">{detail.data.receiptNumber ?? detail.data.paymentId}</h2></div></div><dl className="payment-detail-grid"><div><dt>Subscriber</dt><dd>{detail.data.subscriberName} · {detail.data.subscriberAccountNumber}</dd></div><div><dt>Payment date</dt><dd>{dateTime(detail.data.paymentDate)}</dd></div><div><dt>Recorded at</dt><dd>{dateTime(detail.data.createdAt)}</dd></div><div><dt>Amount / method</dt><dd>{peso(detail.data.amountCentavos)} · {detail.data.method.replaceAll('_',' ')}</dd></div><div><dt>Recorded by</dt><dd>{detail.data.createdBy}</dd></div><div><dt>Posted by</dt><dd>{detail.data.postedBy ?? 'Not posted'}</dd></div><div><dt>Posted at</dt><dd>{detail.data.postedAt ? dateTime(detail.data.postedAt) : 'Not posted'}</dd></div><div><dt>Reference</dt><dd>{detail.data.referenceNumber ?? '—'}</dd></div><div><dt>Allocated</dt><dd>{peso(detail.data.allocatedCentavos)}</dd></div><div><dt>Customer credit</dt><dd>{peso(detail.data.unappliedCreditCentavos)}</dd></div><div><dt>Receipt</dt><dd>{detail.data.receiptNumber ?? '—'} · {detail.data.receiptStatus ?? '—'}</dd></div></dl>{detail.data.notes && <p className="table-note">Notes: {detail.data.notes}</p>}{detail.data.allocations.length > 0 && <div className="dense-table-wrap"><table className="dense-table"><thead><tr><th>Invoice</th><th>Period</th><th>Due</th><th className="numeric">Allocated</th></tr></thead><tbody>{detail.data.allocations.map((item) => <tr key={item.invoiceId}><td>{item.invoiceNumber}</td><td>{item.period}</td><td>{item.dueDate}</td><td className="numeric">{peso(item.amountCentavos)}</td></tr>)}</tbody></table></div>}{detail.data.reversal && <p className="warning-callout">Reversed by {detail.data.reversal.reversedBy} on {dateTime(detail.data.reversal.reversedAt)}. Reason: {detail.data.reversal.reason}</p>}{detail.data.receiptNumber && detail.data.receiptStatus === 'ISSUED' && <ReceiptPrint payment={detail.data} />}{mayReverse && detail.data.status === 'POSTED' && <form className="payment-reversal-form" onSubmit={(event) => { event.preventDefault(); if (window.confirm(`Reverse receipt ${detail.data.receiptNumber}? Balances will be restored.`)) reverse.mutate(); }}><label className="form-field"><span>Reversal reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={255} required placeholder="Reason required for audit history" /></label><Button variant="outline" disabled={reason.trim().length < 3 || reverse.isPending}>{reverse.isPending ? 'Reversing…' : 'Reverse payment and void receipt'}</Button>{reverse.isError && <p className="form-error" role="alert">{reverse.error.message}</p>}</form>}</>}</section>}
  </div>;
}

export function PaymentsPage({ user, mode }: { user: AuthenticatedUser; mode: Mode }) {
  return mode === 'receive' ? <ReceiveWorkspace user={user} /> : <HistoryWorkspace user={user} />;
}
