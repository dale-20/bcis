import { useQuery } from '@tanstack/react-query';
import { Building2, Cable, CircleDollarSign, FileBarChart2, LayoutDashboard, ReceiptText, Settings2, Users, Wallet, Wifi } from 'lucide-react';
import { ConnectionPanel } from './components/ConnectionPanel';
import { getConnection } from './services/connection';

const futureModules = [
  { label: 'Dashboard', icon: LayoutDashboard }, { label: 'Subscribers', icon: Users },
  { label: 'Billing', icon: ReceiptText }, { label: 'Payments', icon: Wallet },
  { label: 'Collections', icon: CircleDollarSign }, { label: 'Receivables', icon: FileBarChart2 },
  { label: 'Services', icon: Cable }, { label: 'Reports', icon: FileBarChart2 },
];

export function App() {
  const query = useQuery({ queryKey: ['connection'], queryFn: getConnection, refetchInterval: 15000 });
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#main"><span className="brand-mark"><Wifi aria-hidden="true" /></span><span>BCIS<small>Billing &amp; Collection</small></span></a>
      <nav aria-label="Main navigation"><p className="nav-description">Workspace</p>{futureModules.map(({ label, icon: Icon }) => <button key={label} className="nav-item" disabled title="Available in a later milestone"><Icon aria-hidden="true" /><span>{label}</span></button>)}
        <div className="nav-separator" /><div className="nav-item active" aria-current="page"><Settings2 aria-hidden="true" /><span>System connection</span></div>
      </nav>
      <div className="sidebar-footer"><Building2 aria-hidden="true" /><div>Office desktop<span>Development environment</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span>Bukidnon Cable and Internet Services</span><span className="environment-label">Foundation · v0.1.0</span></header>
      <main id="main" tabIndex={-1}>
        <div className="page-heading"><h1>System connection</h1><p>Check this workstation’s connection to your office server.</p></div>
        <ConnectionPanel result={query.data} pending={query.isPending} refreshing={query.isFetching} error={query.isError} onRetry={() => { void query.refetch(); }} />
        <section className="scope-note" aria-labelledby="scope-title"><h2 id="scope-title">Your workspace starts here</h2><p>This foundation connects your desktop to the central BCIS environment. Subscriber management, billing, payments, and reports will be added in later milestones.</p><p className="scope-footnote">No subscriber or financial records are available in this build.</p></section>
      </main>
      <footer className="app-footer"><span>BCIS Subscription Billing &amp; Collection</span><span>Milestone 1 · Project foundation</span></footer>
    </div>
  </div>;
}
