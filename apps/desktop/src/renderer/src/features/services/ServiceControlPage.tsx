import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Check, ClipboardCheck, RefreshCw, Wrench } from 'lucide-react';
import type { AuthenticatedUser, ReceivableAccountQuery } from '@bcis/shared';
import { Button } from '../../components/ui/button';
import { PageError, PageLoading } from '../../components/PageFeedback';
import {
  approveSuspension, assignReconnection, completeReconnection, createSuspension,
  getReceivableAccounts, getServiceControlPolicy, listMyReconnections, listReconnections,
  listSuspensions, listTechnicians, updateServiceControlPolicy,
} from '../../services/api';

type ServiceControlMode = 'candidates' | 'reconnections' | 'my-reconnections' | 'policy';
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: string) => {
  const cents = BigInt(value);
  const pesos = cents / 100n;
  const fraction = (cents < 0n ? -cents : cents) % 100n;
  return `${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(pesos)}.${fraction.toString().padStart(2, '0')}`;
};

function SuspensionCandidates({ user }: { user: AuthenticatedUser }) {
  const client = useQueryClient();
  const canManage = user.permissions.includes('service.suspension.manage');
  const [selected, setSelected] = useState<string | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [reason, setReason] = useState('Delinquent account');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const query: ReceivableAccountQuery = { asOf: today(), overdueOnly: false, suspensionCandidates: true, query: search.trim(), sort: 'priority', direction: 'desc', page: 1, pageSize: 50 };
  const candidates = useQuery({ queryKey: ['receivable-accounts', query], queryFn: () => getReceivableAccounts(query) });
  const suspensions = useQuery({ queryKey: ['suspensions'], queryFn: () => listSuspensions(1, 50), enabled: canManage });
  const request = useMutation({
    mutationFn: createSuspension,
    onSuccess: async () => { setSelected(null); setNotes(''); await client.invalidateQueries({ queryKey: ['receivable-accounts'] }); await client.invalidateQueries({ queryKey: ['suspensions'] }); },
  });
  const approve = useMutation({
    mutationFn: approveSuspension,
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['receivable-accounts'] }); await client.invalidateQueries({ queryKey: ['suspensions'] }); await client.invalidateQueries({ queryKey: ['receivables'] }); },
  });
  if (candidates.isPending) return <PageLoading label="Loading delinquency candidates…" />;
  if (candidates.isError) return <PageError title="Delinquency data unavailable" message={candidates.error.message} onRetry={() => void candidates.refetch()} />;
  if (canManage && suspensions.isError) return <PageError title="Suspension history unavailable" message={suspensions.error.message} onRetry={() => void suspensions.refetch()} />;
  return <div className="service-control-workspace">
    <header className="page-heading page-heading-actions"><div><span className="eyebrow">Service control</span><h1>Suspension candidates</h1><p>Accounts meeting the configured arrears threshold. Every request needs a separate authorized approval.</p></div><Button variant="outline" onClick={() => void candidates.refetch()} disabled={candidates.isFetching}><RefreshCw aria-hidden="true" /> Refresh</Button></header>
    <section className="list-surface receivable-filters account-receivable-filters" aria-label="Suspension candidate filters"><label className="field-label"><span>Search subscriber or service</span><input className="text-input" type="search" value={search} placeholder="Account, name, service…" onChange={(event) => setSearch(event.target.value)} /></label></section>
    <section className="service-control-summary" aria-label="Suspension candidate totals"><article><span>Qualifying services</span><strong>{candidates.data.total}</strong></article><article><span>Subscriber accounts</span><strong>{candidates.data.overdueSubscriberCount}</strong></article><article><span>Total arrears</span><strong>{money(candidates.data.arrearsCentavos)}</strong></article></section>
    <section className="list-surface service-control-table">
      {candidates.data.rows.length === 0 ? <div className="empty-state"><div><Archive aria-hidden="true" /></div><h2>No qualifying services</h2><p>There are no active services at or beyond the current suspension threshold.</p></div> : <div className="table-scroll" role="region" aria-label="Suspension candidates" tabIndex={0}><table className="data-table"><thead><tr><th>Subscriber / service</th><th>Plan</th><th>Oldest due</th><th>Months unpaid</th><th>Days overdue</th><th className="amount-cell">Arrears</th>{canManage && <th>Action</th>}</tr></thead><tbody>{candidates.data.rows.map((row) => <tr key={row.serviceAccountId}><td><strong>{row.subscriberName}</strong><small>{row.subscriberAccountNumber} · {row.serviceAccountNumber}</small></td><td>{row.planName}</td><td>{row.oldestDueDate}</td><td>{row.monthsUnpaid}</td><td><span className="status-badge status-warning">{row.daysOverdue} days</span></td><td className="amount-cell">{money(row.arrearsCentavos)}</td>{canManage && <td><Button size="sm" variant="outline" onClick={() => { setSelected(row.serviceAccountId); setEffectiveDate(today()); }}>Request</Button></td>}</tr>)}</tbody></table></div>}
      {selected && <form className="service-control-form" onSubmit={(event) => { event.preventDefault(); request.mutate({ serviceAccountId: selected, effectiveDate, reason, ...(notes.trim() ? { notes: notes.trim() } : {}) }); }}>
        <h2>Request suspension</h2><p>Approval is a separate action and cannot be made effective before the selected date.</p>
        <label className="field-label"><span>Effective date</span><input className="text-input" type="date" min={today()} value={effectiveDate} required onChange={(event) => setEffectiveDate(event.target.value)} /></label>
        <label className="field-label"><span>Reason</span><input className="text-input" minLength={3} maxLength={255} value={reason} required onChange={(event) => setReason(event.target.value)} /></label>
        <label className="field-label"><span>Notes</span><input className="text-input" maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <div><Button type="submit" disabled={request.isPending}>{request.isPending ? 'Submitting…' : 'Submit request'}</Button><Button type="button" variant="outline" onClick={() => setSelected(null)}>Cancel</Button></div>{request.error && <p className="form-alert" role="alert">{request.error.message}</p>}
      </form>}
    </section>
    {canManage && suspensions.data && <section className="list-surface service-control-table"><div className="section-heading"><div><h2>Suspension history</h2><p>Approval and effective status for prior service actions.</p></div></div><div className="table-scroll" role="region" aria-label="Suspension history" tabIndex={0}><table className="data-table"><thead><tr><th>Service</th><th>Reason</th><th>Effective date</th><th>Status</th><th>Approval</th><th>Action</th></tr></thead><tbody>{suspensions.data.items.map((item) => <tr key={item.id}><td><strong>{item.serviceAccountNumber}</strong><small>{item.subscriberName}</small></td><td>{item.reason}</td><td>{item.effectiveDate}</td><td><span className={`status-badge ${item.status === 'ACTIVE' ? 'status-warning' : item.status === 'PENDING' ? 'status-pending' : 'status-active'}`}>{item.status}</span></td><td>{item.approvedAt ? new Date(item.approvedAt).toLocaleString() : 'Awaiting approval'}</td><td>{item.status === 'PENDING' && <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(item.id)}><Check aria-hidden="true" /> Approve</Button>}</td></tr>)}</tbody></table></div>{approve.error && <p className="form-alert" role="alert">{approve.error.message}</p>}</section>}
  </div>;
}

function ReconnectionQueue({ user, mine }: { user: AuthenticatedUser; mine: boolean }) {
  const client = useQueryClient();
  const canAssign = user.permissions.includes('service.reconnection.assign');
  const query = useQuery({ queryKey: [mine ? 'my-reconnections' : 'reconnections'], queryFn: () => mine ? listMyReconnections(1, 50) : listReconnections(1, 50) });
  const technicians = useQuery({ queryKey: ['service-technicians'], queryFn: listTechnicians, enabled: canAssign });
  const [assignments, setAssignments] = useState<Record<string, { technicianUserId: string; scheduledDate: string; notes: string }>>({});
  const update = useMutation({
    mutationFn: async ({ id, complete }: { id: string; complete: boolean }) => {
      if (complete) return completeReconnection(id);
      const input = assignments[id];
      if (!input?.technicianUserId || !input.scheduledDate) throw new Error('Select a technician and scheduled date.');
      return assignReconnection(id, input);
    },
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['reconnections'] }); await client.invalidateQueries({ queryKey: ['my-reconnections'] }); },
  });
  if (query.isPending || (canAssign && technicians.isPending)) return <PageLoading label="Loading reconnection work…" />;
  if (query.isError) return <PageError title="Reconnection queue unavailable" message={query.error.message} onRetry={() => void query.refetch()} />;
  if (canAssign && technicians.isError) return <PageError title="Technician list unavailable" message={technicians.error.message} onRetry={() => void technicians.refetch()} />;
  return <div className="service-control-workspace">
    <header className="page-heading page-heading-actions"><div><span className="eyebrow">Service control</span><h1>{mine ? 'My reconnection work' : 'Reconnection requests'}</h1><p>{mine ? 'Complete only work assigned to your Technician account.' : 'Assign a Technician after the subscriber’s qualifying arrears are settled.'}</p></div><Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw aria-hidden="true" /> Refresh</Button></header>
    <section className="list-surface service-control-table">{query.data.items.length === 0 ? <div className="empty-state"><div><Wrench aria-hidden="true" /></div><h2>No open reconnections</h2><p>New requests appear automatically when payment allocation clears suspended service arrears.</p></div> : <div className="table-scroll" role="region" aria-label="Reconnection requests" tabIndex={0}><table className="data-table"><thead><tr><th>Subscriber / service</th><th>Requested</th><th>Fee</th><th>Technician / date</th><th>Status</th><th>Action</th></tr></thead><tbody>{query.data.items.map((item) => {
      const value = assignments[item.id] ?? { technicianUserId: item.technicianUserId ?? '', scheduledDate: item.scheduledDate ?? today(), notes: item.notes ?? '' };
      return <tr key={item.id}><td><strong>{item.subscriberName}</strong><small>{item.serviceAccountNumber}</small></td><td>{new Date(item.requestedAt).toLocaleDateString()}</td><td className="amount-cell">{money(item.feeCentavos)}</td><td>{canAssign ? <div className="service-assignment-controls"><label className="sr-only" htmlFor={`tech-${item.id}`}>Assign Technician for {item.serviceAccountNumber}</label><select id={`tech-${item.id}`} className="select-input" value={value.technicianUserId} onChange={(event) => setAssignments((current) => ({ ...current, [item.id]: { ...value, technicianUserId: event.target.value } }))}><option value="">Select Technician</option>{technicians.data?.map((tech) => <option key={tech.id} value={tech.id}>{tech.displayName}</option>)}</select><label className="sr-only" htmlFor={`date-${item.id}`}>Scheduled date for {item.serviceAccountNumber}</label><input id={`date-${item.id}`} className="text-input" type="date" value={value.scheduledDate} onChange={(event) => setAssignments((current) => ({ ...current, [item.id]: { ...value, scheduledDate: event.target.value } }))} /></div> : <>{item.technicianName ?? 'Unassigned'}<small>{item.scheduledDate ?? 'Not scheduled'}</small></>}</td><td><span className="status-badge status-pending">{item.status}</span></td><td>{canAssign ? <Button size="sm" disabled={update.isPending || !value.technicianUserId} onClick={() => update.mutate({ id: item.id, complete: false })}><ClipboardCheck aria-hidden="true" /> Assign</Button> : <Button size="sm" disabled={update.isPending || item.technicianUserId !== user.userId} onClick={() => update.mutate({ id: item.id, complete: true })}><Check aria-hidden="true" /> Complete</Button>}</td></tr>;
    })}</tbody></table></div>}{update.error && <p className="form-alert" role="alert">{update.error.message}</p>}</section>
  </div>;
}

function ServicePolicy() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['service-control-policy'], queryFn: getServiceControlPolicy });
  const [form, setForm] = useState<{ gracePeriodDays: number; suspensionThresholdDays: number; feePesos: string } | null>(null);
  const save = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('Policy settings are not loaded.');
      const cents = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(form.feePesos.trim());
      if (!cents) throw new Error('Enter a valid reconnection fee with up to two decimal places.');
      const amount = (BigInt(cents[1] ?? '0') * 100n + BigInt((cents[2] ?? '').padEnd(2, '0') || '0')).toString();
      return updateServiceControlPolicy({ gracePeriodDays: form.gracePeriodDays, suspensionThresholdDays: form.suspensionThresholdDays, reconnectionFeeCentavos: amount });
    },
    onSuccess: async () => { setForm(null); await client.invalidateQueries({ queryKey: ['service-control-policy'] }); await client.invalidateQueries({ queryKey: ['receivable-accounts'] }); },
  });
  if (query.isPending) return <PageLoading label="Loading service policy…" />;
  if (query.isError) return <PageError title="Service policy unavailable" message={query.error.message} onRetry={() => void query.refetch()} />;
  const feeCentavos = BigInt(query.data.reconnectionFeeCentavos);
  const feePesos = `${feeCentavos / 100n}.${(feeCentavos % 100n).toString().padStart(2, '0')}`;
  const current = form ?? { gracePeriodDays: query.data.gracePeriodDays, suspensionThresholdDays: query.data.suspensionThresholdDays, feePesos };
  return <div className="service-control-workspace"><header className="page-heading"><span className="eyebrow">Administration</span><h1>Service control policy</h1><p>Delinquency timing and reconnection fees used by server-side eligibility checks.</p></header>
    <form className="list-surface service-policy-form" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><div className="section-heading"><div><h2>Delinquency and reconnection</h2><p>Changes are audited and apply to future requests.</p></div></div>
      <label className="field-label"><span>Grace period (days)</span><input className="text-input" type="number" min={0} max={365} value={current.gracePeriodDays} onChange={(event) => setForm({ ...current, gracePeriodDays: Number(event.target.value) })} required /></label>
      <label className="field-label"><span>Suspension threshold (days)</span><input className="text-input" type="number" min={1} max={730} value={current.suspensionThresholdDays} onChange={(event) => setForm({ ...current, suspensionThresholdDays: Number(event.target.value) })} required /></label>
      <label className="field-label"><span>Reconnection fee (PHP)</span><input className="text-input" inputMode="decimal" value={current.feePesos} onChange={(event) => setForm({ ...current, feePesos: event.target.value })} required /><small>Sent to the API as exact integer centavos.</small></label>
      <div className="service-policy-actions"><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save policy'}</Button><Button type="button" variant="outline" onClick={() => setForm(null)} disabled={!form}>Discard changes</Button></div>{save.error && <p className="form-alert" role="alert">{save.error.message}</p>}
    </form>
  </div>;
}

export function ServiceControlPage({ mode, user }: { mode: ServiceControlMode; user: AuthenticatedUser }) {
  if (mode === 'candidates') return <SuspensionCandidates user={user} />;
  if (mode === 'reconnections') return <ReconnectionQueue user={user} mine={false} />;
  if (mode === 'my-reconnections') return <ReconnectionQueue user={user} mine />;
  return <ServicePolicy />;
}
