import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuditSearchQuery } from '@bcis/shared';
import { Button } from '../../components/ui/button';
import { searchAudit } from '../../services/api';

const blankQuery: AuditSearchQuery = { actor: '', action: '', entity: '', requestId: '', page: 1, pageSize: 25 };

export function AuditPage() {
  const [query, setQuery] = useState<AuditSearchQuery>(blankQuery);
  const audit = useQuery({ queryKey: ['administration', 'audit', query], queryFn: () => searchAudit(query) });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setQuery({ actor: String(form.get('actor') ?? ''), action: String(form.get('action') ?? ''), entity: String(form.get('entity') ?? ''), requestId: String(form.get('requestId') ?? ''), from: String(form.get('from') ?? '') || undefined, to: String(form.get('to') ?? '') || undefined, page: 1, pageSize: 25 });
  }
  return <div className="content-enter space-y-5">
    <header className="page-heading"><h1>Audit Trail</h1><p>Read-only record of security, user, and financial actions. Values come from the API audit log.</p></header>
    <section className="list-surface p-4"><form id="audit-search" className="grid gap-3 md:grid-cols-3 xl:grid-cols-6" onSubmit={submit}>
      <label className="field-label">Actor<input className="text-input" name="actor" placeholder="Username or display name" /></label>
      <label className="field-label">Action<input className="text-input" name="action" placeholder="payment.reversed" /></label>
      <label className="field-label">Entity<input className="text-input" name="entity" placeholder="payment, user…" /></label>
      <label className="field-label">Request ID<input className="text-input" name="requestId" /></label>
      <label className="field-label">From<input className="text-input" type="date" name="from" /></label>
      <label className="field-label">To<input className="text-input" type="date" name="to" /></label>
      <div className="flex items-end gap-2 xl:col-span-6"><Button type="submit">Search audit</Button><Button type="button" variant="outline" onClick={() => { setQuery(blankQuery); document.querySelector<HTMLFormElement>('#audit-search')?.reset(); }}>Clear</Button></div>
    </form></section>
    <section className="list-surface overflow-hidden" aria-label="Audit entries">
      {audit.isPending ? <p className="p-5 text-sm text-secondary">Loading audit entries…</p> : audit.isError ? <div className="p-5"><p role="alert">Could not load audit entries: {audit.error.message}</p><Button variant="outline" className="mt-3" onClick={() => void audit.refetch()}>Retry</Button></div> : audit.data.items.length === 0 ? <p className="p-5 text-sm text-secondary">No audit entries match these filters.</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Request</th><th>Change detail</th></tr></thead><tbody>{audit.data.items.map((entry) => <tr key={entry.id}>
        <td className="whitespace-nowrap">{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}</td>
        <td>{entry.actor ?? 'System'}</td><td><span className="font-medium">{entry.action}</span>{entry.reason && <span className="block text-xs text-secondary">{entry.reason}</span>}</td>
        <td>{entry.entityType}{entry.entityId ? <span className="block max-w-40 truncate text-xs text-secondary" title={entry.entityId}>{entry.entityId}</span> : null}</td>
        <td className="max-w-40 truncate font-mono text-xs" title={entry.requestId}>{entry.requestId}</td>
        <td><details><summary className="cursor-pointer text-primary">View values</summary><div className="mt-2 grid max-w-lg gap-2 text-xs"><div><strong>Before</strong><pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-canvas p-2">{entry.oldValues ? JSON.stringify(entry.oldValues, null, 2) : '—'}</pre></div><div><strong>After</strong><pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-canvas p-2">{entry.newValues ? JSON.stringify(entry.newValues, null, 2) : '—'}</pre></div></div></details></td>
      </tr>)}</tbody></table></div>}
      {!audit.isError && audit.data && <footer className="pagination"><span>{audit.data.total} audit entries · Page {audit.data.page}</span><div><Button variant="outline" size="sm" disabled={(query.page ?? 1) <= 1} onClick={() => setQuery((current) => ({ ...current, page: Math.max(1, (current.page ?? 1) - 1) }))}>Previous</Button><Button variant="outline" size="sm" disabled={(query.page ?? 1) * (query.pageSize ?? 25) >= audit.data.total} onClick={() => setQuery((current) => ({ ...current, page: (current.page ?? 1) + 1 }))}>Next</Button></div></footer>}
    </section>
  </div>;
}
