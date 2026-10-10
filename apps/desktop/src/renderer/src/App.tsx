import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, FileBarChart2, LayoutDashboard, LogOut, Settings2, Users } from 'lucide-react';
import type { AuthenticatedUser } from '@bcis/shared';
import logo from './assets/bcis-mark.png';
import { ConnectionPanel } from './components/ConnectionPanel';
import { AuthScreen } from './features/auth/AuthScreen';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { SubscribersPage } from './features/subscribers/SubscribersPage';
import { changePassword, getSession, login, logout } from './services/api';
import { getConnection } from './services/connection';

type View = 'dashboard' | 'subscribers' | 'reports' | 'connection';
function SystemConnection() { const query = useQuery({ queryKey: ['connection'], queryFn: getConnection, refetchInterval: 15000 }); return <div className="content-enter"><div className="page-heading"><h1>System connection</h1><p>Check this workstation’s connection to the office server.</p></div><ConnectionPanel result={query.data} pending={query.isPending} refreshing={query.isFetching} error={query.isError} onRetry={() => void query.refetch()} /></div>; }

function Workspace({ user, onLogout }: { user: AuthenticatedUser; onLogout: () => Promise<void> }) {
  const start: View = user.permissions.includes('dashboard.view') ? 'dashboard' : 'subscribers'; const [view, setView] = useState<View>(start);
  const navigation = [
    { view: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
    { view: 'subscribers' as const, label: 'Subscribers', icon: Users, permission: 'subscriber.view' },
    { view: 'reports' as const, label: 'Reports', icon: FileBarChart2, permission: 'report.view' },
  ].filter((item) => user.permissions.includes(item.permission));
  return <div className="app-shell">
    <aside className="sidebar"><button className="brand" onClick={() => setView(start)}><img src={logo} alt="" /><span>BCIS<small>Billing &amp; Collection</small></span></button>
      <nav aria-label="Main navigation"><p className="nav-description">Workspace</p>{navigation.map(({ view: target, label, icon: Icon }) => <button key={target} className={`nav-item ${view === target ? 'active' : ''}`} onClick={() => setView(target)} aria-current={view === target ? 'page' : undefined}><Icon /><span>{label}</span></button>)}<div className="nav-separator" /><p className="nav-description">System</p><button className={`nav-item ${view === 'connection' ? 'active' : ''}`} onClick={() => setView('connection')} aria-current={view === 'connection' ? 'page' : undefined}><Settings2 /><span>Connection</span></button></nav>
      <div className="sidebar-account"><span className="user-avatar">{user.displayName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><div><strong>{user.displayName}</strong><small>{user.roles.map((role) => role.replaceAll('_', ' ')).join(', ')}</small></div><button className="icon-button" onClick={() => void onLogout()} aria-label="Sign out"><LogOut /></button></div>
      <div className="sidebar-footer"><Building2 /><div>Office desktop<span>Secure API session</span></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div><strong>Bukidnon Cable and Internet Services</strong><span>Financial operations workspace</span></div><div className="live-indicator"><i />Live data</div></header><main id="main" tabIndex={-1}>{view === 'dashboard' ? <DashboardPage /> : view === 'subscribers' ? <SubscribersPage user={user} /> : view === 'reports' ? <ReportsPage /> : <SystemConnection />}</main></div>
  </div>;
}
export function App() {
  const client = useQueryClient(); const session = useQuery({ queryKey: ['session'], queryFn: getSession, staleTime: Infinity, retry: false }); const [authError, setAuthError] = useState<string | null>(null);
  const loginMutation = useMutation({ mutationFn: login, onSuccess: (user) => { client.setQueryData(['session'], user); setAuthError(null); }, onError: (error) => setAuthError(error.message) });
  const passwordMutation = useMutation({ mutationFn: changePassword, onSuccess: (user) => { client.setQueryData(['session'], user); setAuthError(null); }, onError: (error) => setAuthError(error.message) });
  const logoutMutation = useMutation({ mutationFn: logout, onSettled: () => { client.clear(); client.setQueryData(['session'], null); } });
  if (session.isPending) return <div className="app-boot"><img src={logo} alt="" /><p>Opening BCIS…</p></div>;
  if (session.isError) return <div className="app-boot error-state"><h1>BCIS could not start</h1><p>{session.error.message}</p></div>;
  if (!session.data || session.data.mustChangePassword) return <AuthScreen user={session.data} pending={loginMutation.isPending || passwordMutation.isPending} error={authError} onLogin={async (values) => { setAuthError(null); await loginMutation.mutateAsync(values); }} onChangePassword={async (values) => { setAuthError(null); await passwordMutation.mutateAsync(values); }} />;
  return <Workspace user={session.data} onLogout={async () => { await logoutMutation.mutateAsync(); }} />;
}
