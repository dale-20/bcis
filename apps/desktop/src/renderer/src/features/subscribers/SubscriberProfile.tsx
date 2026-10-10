import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Contact, MapPin, PlugZap, RadioTower, Route, UserRound } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { getServiceHistory, getSubscriber } from '../../services/api';

function money(centavos: string): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(BigInt(centavos)) / 100);
}

export function SubscriberProfile({ id, onBack }: { id: string; onBack: () => void }) {
  const query = useQuery({ queryKey: ['subscriber', id], queryFn: () => getSubscriber(id) });
  const history = useQuery({ queryKey: ['service-history', id], queryFn: () => getServiceHistory(id) });
  if (query.isPending) return <section className="page-state" aria-live="polite"><div className="skeleton profile-skeleton" /><p>Loading subscriber profile…</p></section>;
  if (query.isError) return <section className="page-state error-state"><h2>Profile unavailable</h2><p>{query.error.message}</p><Button variant="outline" onClick={() => { void query.refetch(); }}>Try again</Button></section>;
  const subscriber = query.data;
  return <div className="content-enter">
    <button className="back-button" onClick={onBack}><ArrowLeft aria-hidden="true" /> Back to subscribers</button>
    <header className="profile-header">
      <div className="profile-avatar" aria-hidden="true">{subscriber.firstName[0]}{subscriber.lastName[0]}</div>
      <div className="profile-identity"><div><h1>{subscriber.displayName}</h1><span className={`status-badge status-${subscriber.status.toLowerCase()}`}>{subscriber.status}</span></div><p>{subscriber.accountNumber}{subscriber.organizationName ? ` · ${subscriber.organizationName}` : ''}</p></div>
      <dl className="profile-cycle"><div><dt>Billing day</dt><dd>{subscriber.billingDay}</dd></div><div><dt>Due day</dt><dd>{subscriber.dueDay}</dd></div></dl>
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
          {history.isPending ? <p className="empty-inline">Loading service history…</p> : history.isError ? <p className="form-error">{history.error.message}</p> : history.data.events.length === 0 ? <p className="empty-inline">No suspension or reconnection events recorded.</p> : <ol className="history-timeline">{history.data.events.map((event) => <li key={event.id}><i aria-hidden="true" /><div><strong>{event.type === 'SUSPENSION' ? 'Service suspended' : 'Service reconnection'}</strong><span>{event.serviceAccountNumber} · {event.status}</span><p>{event.reason ?? event.notes ?? 'No additional notes'}</p></div><time>{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(`${event.occurredOn.slice(0, 10)}T00:00:00`))}</time></li>)}</ol>}
        </div>
      </section>

      <aside className="profile-aside">
        <section className="profile-section"><div className="section-heading"><div><h2>Contacts</h2><p>Subscriber communication details</p></div><Contact aria-hidden="true" /></div><dl className="detail-list">{subscriber.contacts.map((contact) => <div key={contact.id}><dt>{contact.type}{contact.isPrimary && <span>Primary</span>}</dt><dd>{contact.value}</dd></div>)}</dl></section>
        <section className="profile-section"><div className="section-heading"><div><h2>Service addresses</h2><p>Billing and installation locations</p></div><MapPin aria-hidden="true" /></div><div className="address-list">{subscriber.addresses.map((address) => <address key={address.id}><strong>{address.type}{address.isPrimary ? ' · Primary' : ''}</strong><span>{address.line1}{address.line2 ? `, ${address.line2}` : ''}</span><span>{address.barangay}, {address.municipality}</span><span>{address.province} {address.postalCode ?? ''}</span></address>)}</div></section>
        <section className="profile-section"><div className="section-heading"><div><h2>Record details</h2><p>Administrative information</p></div><UserRound aria-hidden="true" /></div><dl className="detail-list"><div><dt>Created</dt><dd>{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(subscriber.createdAt))}</dd></div><div><dt>Notes</dt><dd>{subscriber.notes ?? 'No notes recorded.'}</dd></div></dl></section>
      </aside>
    </div>
  </div>;
}

