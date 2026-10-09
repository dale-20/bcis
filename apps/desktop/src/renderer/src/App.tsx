import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Cable, CircleDollarSign, FileBarChart2, LayoutDashboard, LogOut, ReceiptText, Settings2, Users, Wallet, Wifi } from 'lucide-react';
import type { AuthenticatedUser } from '@bcis/shared';
import { ConnectionPanel } from './components/ConnectionPanel';
import { AuthScreen } from './features/auth/AuthScreen';
import { SubscribersPage } from './features/subscribers/SubscribersPage';
import { changePassword, getSession, login, logout } from './services/api';
import { getConnection } from './services/connection';

const deferredModules = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Billing', icon: ReceiptText },
  { label: 'Payments', icon: Wallet },
  { label: 'Collections', icon: CircleDollarSign },
  { label: 'Receivables', icon: FileBarChart2 },
  { label: 'Services', icon: Cable },
  { label: 'Reports', icon: FileBarChart2 },
];

function SystemConnection() {
  const query = useQuery({ queryKey: ['connection'], queryFn: getConnection, refetchInterval: 15000 });
  return <div className="content-enter"><div className="page-heading"><h1>System connection</h1><p>Check this workstation’s connection to the office server.</p></div><ConnectionPanel result={query.data} pending={query.isPending} refreshing={query.isFetching} error={query.isError} onRetry={() => { void query.refetch(); }} /></div>;
}
function Workspace({ user, onLogout }: { user: AuthenticatedUser; onLogout: () => Promise<void> }) {
  const [view, setView] = useState<'subscribers' | 'connection'>('subscribers');
  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setView('subscribers')}><span className="brand-mark"><Wifi aria-hidden="true" /></span><span>BCIS<small>Billing &amp; Collection</small></span></button>
      <nav aria-label="Main navigation"><p className="nav-description">Workspace</p>
        <button className={`nav-item ${view === 'subscribers' ? 'active' : ''}`} onClick={() => setView('subscribers')} aria-current={view === 'subscribers' ? 'page' : undefined}><Users aria-hidden="true" /><span>Subscribers</span></button>
        {deferredModules.map(({ label, icon: Icon }) => <button key={label} className="nav-item" disabled title="Available in a later milestone"><Icon aria-hidden="true" /><span>{label}</span></button>)}
        <div className="nav-separator" /><button className={`nav-item ${view === 'connection' ? 'active' : ''}`} onClick={() => setView('connection')} aria-current={view === 'connection' ? 'page' : undefined}><Settings2 aria-hidden="true" /><span>System connection</span></button>
      </nav>
      <div className="sidebar-footer"><Building2 aria-hidden="true" /><div>Office desktop<span>Secure API session</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span>Bukidnon Cable and Internet Services</span><div className="user-menu"><span className="user-avatar" aria-hidden="true">{user.displayName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span><strong>{user.displayName}</strong><small>{user.roles.map((role) => role.replaceAll('_', ' ')).join(', ')}</small></span><button className="icon-button" onClick={() => { void onLogout(); }} aria-label="Sign out"><LogOut aria-hidden="true" /></button></div></header>
      <main id="main" tabIndex={-1}>{view === 'subscribers' ? <SubscribersPage user={user} /> : <SystemConnection />}</main>
      <footer className="app-footer"><span>BCIS Subscription Billing &amp; Collection</span><span>Subscriber operations · Secure session</span></footer>
    </div>
  </div>;
}
export function App() {
  const client = useQueryClient();
  const session = useQuery({ queryKey: ['session'], queryFn: getSession, staleTime: Infinity, retry: false });
  const [authError, setAuthError] = useState<string | null>(null);
  const loginMutation = useMutation({ mutationFn: login, onSuccess: (user) => { client.setQueryData(['session'], user); setAuthError(null); }, onError: (error) => setAuthError(error.message) });
  const passwordMutation = useMutation({ mutationFn: changePassword, onSuccess: (user) => { client.setQueryData(['session'], user); setAuthError(null); }, onError: (error) => setAuthError(error.message) });
  const logoutMutation = useMutation({ mutationFn: logout, onSettled: () => { client.clear(); client.setQueryData(['session'], null); } });

  if (session.isPending) return <div className="app-boot" aria-live="polite"><span className="brand-mark"><Wifi aria-hidden="true" /></span><p>Opening BCIS…</p></div>;
  if (session.isError) return <div className="app-boot error-state"><h1>BCIS could not start</h1><p>{session.error.message}</p></div>;
  if (!session.data || session.data.mustChangePassword) return <AuthScreen user={session.data} pending={loginMutation.isPending || passwordMutation.isPending} error={authError} onLogin={async (values) => { setAuthError(null); await loginMutation.mutateAsync(values); }} onChangePassword={async (values) => { setAuthError(null); await passwordMutation.mutateAsync(values); }} />;
  return <Workspace user={session.data} onLogout={async () => { await logoutMutation.mutateAsync(); }} />;
}
