import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, CalendarDays, Contact, MapPin, Pencil, PlugZap, RadioTower, RotateCcw, Route, UserRound, X } from 'lucide-react';
import type { AuthenticatedUser, SubscriberStatusChange, SubscriberUpdate } from '@bcis/shared';
import { Button } from '../../components/ui/button';
import { changeSubscriberStatus, getServiceHistory, getSubscriber, updateSubscriber } from '../../services/api';
import { SubscriberEditForm } from './SubscriberEditForm';

function money(centavos: string): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(BigInt(centavos)) / 100);
}

export function SubscriberProfile({ id, user, onBack }: { id: string; user: AuthenticatedUser; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [statusTarget, setStatusTarget] = useState<'ACTIVE' | 'ARCHIVED' | null>(null);
  const [reason, setReason] = useState('');
  const query = useQuery({ queryKey: ['subscriber', id], queryFn: () => getSubscriber(id) });
  const history = useQuery({ queryKey: ['service-history', id], queryFn: () => getServiceHistory(id) });
  const updateMutation = useMutation({ mutationFn: (input: SubscriberUpdate) => updateSubscriber(id, input), onSuccess: async (updated) => {
    queryClient.setQueryData(['subscriber', id], updated);
    await queryClient.invalidateQueries({ queryKey: ['subscribers'] });
    setEditing(false);
  } });
  const statusMutation = useMutation({ mutationFn: (input: SubscriberStatusChange) => changeSubscriberStatus(id, input), onSuccess: async (updated) => {
    queryClient.setQueryData(['subscriber', id], updated);
    await queryClient.invalidateQueries({ queryKey: ['subscribers'] });
    setStatusTarget(null);
    setReason('');
  } });
  if (query.isPending) return <section className="page-state" aria-live="polite"><div className="skeleton profile-skeleton" /><p>Loading subscriber profile…</p></section>;
  if (query.isError) return <section className="page-state error-state"><h2>Profile unavailable</h2><p>{query.error.message}</p><Button variant="outline" onClick={() => { void query.refetch(); }}>Try again</Button></section>;
  const subscriber = query.data;
  const canManage = user.permissions.includes('subscriber.manage');
  const hasLiveServices = subscriber.services.some((service) => service.status !== 'DISCONNECTED' && service.status !== 'TERMINATED');
  return <div className="content-enter">
    <button className="back-button" onClick={onBack}><ArrowLeft aria-hidden="true" /> Back to subscribers</button>
    <header className="profile-header">
      <div className="profile-avatar" aria-hidden="true">{subscriber.firstName[0]}{subscriber.lastName[0]}</div>
      <div className="profile-identity"><div><h1>{subscriber.displayName}</h1><span className={`status-badge status-${subscriber.status.toLowerCase()}`}>{subscriber.status}</span></div><p>{subscriber.accountNumber}{subscriber.organizationName ? ` · ${subscriber.organizationName}` : ''}</p></div>
      <dl className="profile-cycle"><div><dt>Billing day</dt><dd>{subscriber.billingDay}</dd></div><div><dt>Due day</dt><dd>{subscriber.dueDay}</dd></div></dl>
      {canManage && <div className="profile-actions"><Button variant="outline" size="sm" onClick={() => { updateMutation.reset(); setEditing(true); }}><Pencil aria-hidden="true" /> Edit</Button>{subscriber.status === 'ARCHIVED' ? <Button size="sm" onClick={() => { statusMutation.reset(); setStatusTarget('ACTIVE'); }}><RotateCcw aria-hidden="true" /> Reactivate</Button> : <Button variant="outline" size="sm" disabled={hasLiveServices} title={hasLiveServices ? 'Disconnect or terminate every service before archiving' : undefined} onClick={() => { statusMutation.reset(); setStatusTarget('ARCHIVED'); }}><Archive aria-hidden="true" /> Archive</Button>}</div>}
    </header>
    <div className="profile-grid">
      <section className="profile-section profile-services" aria-labelledby="services-title"><div className="section-heading"><div><h2 id="services-title">Service accounts</h2><p>{subscriber.services.length} connected service{subscriber.services.length === 1 ? '' : 's'}</p></div></div>
        <div className="service-list">{subscriber.services.map((service) => <article className="service-row" key={service.id}>
          <div className="service-symbol"><RadioTower aria-hidden="true" /></div>
          <div className="service-main"><div><strong>{service.planName}</strong><span className={`status-badge status-${service.status.toLowerCase()}`}>{service.status}</span></div><p>{service.serviceAccountNumber} · {service.category}</p></div>
          <div className="service-rate"><strong>{money(service.currentRateCentavos)}</strong><span>per month</span></div>
          <dl className="service-meta"><div><dt><MapPin aria-hidden="true" /> Installation</dt><dd>{service.installationAddress}</dd></div><div><dt><Route aria-hidden="true" /> Collection route</dt><dd>{service.collectionAreaName ?? 'Unassigned'} · {service.assignedCollectorName ?? 'No collector'}</dd></div><div><dt><CalendarDays aria-hidden="true" /> Billing started</dt><dd>{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(`${service.billingStartDate}T00:00:00`))}</dd></div></dl>
        </article>)}</div>
        <div className="history-section"><div className="section-heading"><div><h2>Suspension &amp; reconnection history</h2><p>Permanent service status events across all accounts</p></div><PlugZap aria-hidden="true" /></div>
          {history.isPending ? <p className="empty-inline">Loading service history…</p> : history.isError ? <p className="form-error">{history.error.message}</p> : history.data.events.length === 0 ? <p className="empty-inline">No suspension or reconnection events recorded.</p> : <ol className="history-timeline">{history.data.events.map((event) => <li key={event.id}><i aria-hidden="true" /><div><strong>{event.type === 'SUSPENSION' ? 'Service suspended' : 'Service reconnected'}</strong><span>{event.serviceAccountNumber} · {event.status}</span><p>{event.reason ?? event.notes ?? 'No additional notes'}</p></div><time>{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(`${event.occurredOn.slice(0, 10)}T00:00:00`))}</time></li>)}</ol>}
        </div>
      </section>
      <aside className="profile-aside">
        <section className="profile-section"><div className="section-heading"><div><h2>Contacts</h2><p>Subscriber communication details</p></div><Contact aria-hidden="true" /></div><dl className="detail-list">{subscriber.contacts.map((contact) => <div key={contact.id}><dt>{contact.type}{contact.isPrimary && <span>Primary</span>}</dt><dd>{contact.value}</dd></div>)}</dl></section>
        <section className="profile-section"><div className="section-heading"><div><h2>Service addresses</h2><p>Billing and installation locations</p></div><MapPin aria-hidden="true" /></div><div className="address-list">{subscriber.addresses.map((address) => <address key={address.id}><strong>{address.type}{address.isPrimary ? ' · Primary' : ''}</strong><span>{address.line1}{address.line2 ? `, ${address.line2}` : ''}</span><span>{address.barangay}, {address.municipality}</span><span>{address.province} {address.postalCode ?? ''}</span></address>)}</div></section>
        <section className="profile-section"><div className="section-heading"><div><h2>Record details</h2><p>Administrative information</p></div><UserRound aria-hidden="true" /></div><dl className="detail-list"><div><dt>Created</dt><dd>{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(subscriber.createdAt))}</dd></div><div><dt>Notes</dt><dd>{subscriber.notes ?? 'No notes recorded.'}</dd></div></dl></section>
      </aside>
    </div>
    {editing && <SubscriberEditForm subscriber={subscriber} pending={updateMutation.isPending} serverError={updateMutation.error?.message ?? null} onCancel={() => setEditing(false)} onSubmit={async (input) => { await updateMutation.mutateAsync(input); }} />}
    {statusTarget && <div className="dialog-backdrop" role="presentation"><section className="status-dialog" role="dialog" aria-modal="true" aria-labelledby="status-dialog-title"><header className="dialog-heading"><div><h2 id="status-dialog-title">{statusTarget === 'ACTIVE' ? 'Reactivate subscriber' : 'Archive subscriber'}</h2><p>This change remains in the audit history.</p></div><button className="icon-button" type="button" onClick={() => setStatusTarget(null)} aria-label="Close status dialog"><X aria-hidden="true" /></button></header><label className="field-label"><span>Reason *</span><textarea className="text-area" rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Enter the reason for this status change" /></label>{statusMutation.error && <div className="form-alert" role="alert">{statusMutation.error.message}</div>}<footer className="form-actions"><Button variant="outline" onClick={() => setStatusTarget(null)}>Cancel</Button><Button disabled={reason.trim().length < 3 || statusMutation.isPending} onClick={() => statusMutation.mutate({ status: statusTarget, reason: reason.trim() })}>{statusMutation.isPending ? 'Saving…' : statusTarget === 'ACTIVE' ? 'Reactivate' : 'Archive'}</Button></footer></section></div>}
  </div>;
}
