import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Banknote,
  BookOpenCheck,
  Building2,
  Cable,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FileBarChart2,
  FileClock,
  Gauge,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPinned,
  ReceiptText,
  RotateCcw,
  Settings2,
  ShieldCheck,
  UserCog,
  Users,
  WalletCards,
  Wrench,
} from 'lucide-react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { AuthenticatedUser } from '@bcis/shared';
import logo from './assets/bcis-mark.png';
import { ConnectionPanel } from './components/ConnectionPanel';
import { AuthScreen } from './features/auth/AuthScreen';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { ModulePage } from './features/shell/ModulePage';
import { defaultPath, hasAnyPermission, pageLabel, visibleNavigation, type NavigationItemId } from './features/shell/navigation';
import { SubscribersPage } from './features/subscribers/SubscribersPage';
import { SESSION_INVALID_EVENT, changePassword, getSession, login, logout } from './services/api';
import { getConnection } from './services/connection';

const navigationIcons: Record<NavigationItemId, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  subscribers: Users,
  billing: ReceiptText,
  payments: WalletCards,
  collections: MapPinned,
  receivables: FileClock,
  services: Cable,
  reports: FileBarChart2,
  administration: Settings2,
};

function SystemConnection() {
  const query = useQuery({ queryKey: ['connection'], queryFn: getConnection, refetchInterval: 15_000 });
  return <div className="content-enter"><div className="page-heading"><h1>System connection</h1><p>Check this workstation's connection to the office server.</p></div><ConnectionPanel result={query.data} pending={query.isPending} refreshing={query.isFetching} error={query.isError} onRetry={() => void query.refetch()} /></div>;
}

function Allowed({ user, permissions, children }: { user: AuthenticatedUser; permissions: readonly string[]; children: ReactNode }) {
  return hasAnyPermission(user.permissions, permissions) ? children : <Navigate to={defaultPath(user.permissions)} replace />;
}

const modulePages = {
  billingCurrent: { title: 'Current Billing', description: 'Review the active billing period and its generation status.', icon: Gauge, capabilities: ['Current billing cycle status', 'Finalized invoice totals', 'Duplicate-period protection'] },
  billingGenerate: { title: 'Generate Billing', description: 'Create monthly invoices for eligible active service accounts.', icon: CircleDollarSign, capabilities: ['Billing preview', 'Transactional generation', 'Run summary and exceptions'] },
  invoices: { title: 'Invoices', description: 'Search and review finalized subscriber invoices.', icon: ReceiptText, capabilities: ['Server-side invoice search', 'Immutable invoice detail', 'Status and due-date filtering'] },
  receivePayment: { title: 'Receive Payment', description: 'Post an exact, partial, or advance subscriber payment.', icon: Banknote, capabilities: ['Subscriber and balance lookup', 'Oldest-first allocation preview', 'Atomic posting and receipt'] },
  paymentHistory: { title: 'Payment History', description: 'Review posted payments, allocations, credits, receipts, and reversals.', icon: History, capabilities: ['Payment and receipt search', 'Allocation and credit detail', 'Controlled reversal history'] },
  gcash: { title: 'GCash Verification', description: 'Review submitted GCash evidence before a payment is posted.', icon: ShieldCheck, capabilities: ['Pending proof queue', 'Duplicate-reference control', 'Authorized verify or reject'] },
  collectors: { title: 'Collectors', description: 'Maintain collectors and their current route assignments.', icon: Users, capabilities: ['Collector directory', 'Effective assignments', 'Performance access'] },
  routes: { title: 'Areas & Routes', description: 'Organize service accounts into accountable collection routes.', icon: MapPinned, capabilities: ['Collection areas', 'Assigned services', 'Printable route preparation'] },
  batches: { title: 'Collection Batches', description: 'Create route snapshots and record field collection results.', icon: ClipboardList, capabilities: ['Batch lifecycle', 'Route-sheet snapshot', 'Recorded collection exceptions'] },
  remittance: { title: 'Remittance', description: 'Reconcile collector Cash without hiding shortages or overages.', icon: RotateCcw, capabilities: ['Expected versus remitted Cash', 'Non-cash totals', 'Authorized close with variance'] },
  outstanding: { title: 'Outstanding Receivables', description: 'Review every positive open invoice balance.', icon: WalletCards, capabilities: ['Exact outstanding totals', 'Subscriber and service detail', 'Area and collector filtering'] },
  overdue: { title: 'Overdue Accounts', description: 'Prioritize accounts that require collection follow-up.', icon: FileClock, capabilities: ['Oldest unpaid invoice', 'Months unpaid and last payment', 'Delinquency filters'] },
  aging: { title: 'AR Aging', description: 'Reconcile open balances across the required aging buckets.', icon: FileBarChart2, capabilities: ['Current through 90+ buckets', 'Server-side totals', 'Exportable aging detail'] },
  suspensions: { title: 'Suspension Candidates', description: 'Review overdue services against approved suspension policy.', icon: Archive, capabilities: ['Grace and threshold checks', 'Approval history', 'Reconnection handoff'] },
  services: { title: 'Services', description: 'Review service status, assignments, and operational history.', icon: Wrench, capabilities: ['Service account directory', 'Suspension and reconnection status', 'Technician assignments'] },
  users: { title: 'Users & Roles', description: 'Manage staff identities and server-enforced access.', icon: UserCog, capabilities: ['User account status', 'Role assignments', 'Password reset controls'] },
  audit: { title: 'Audit Trail', description: 'Review immutable security and financial activity.', icon: BookOpenCheck, capabilities: ['Actor and action search', 'Before and after values', 'Denied authorization evidence'] },
  settings: { title: 'Settings', description: 'Maintain controlled billing and service policies.', icon: Settings2, capabilities: ['Billing and due-date defaults', 'Grace and suspension policy', 'Company report information'] },
  backups: { title: 'Backup & Restore', description: 'Review verified backups and Owner-controlled recovery.', icon: ShieldCheck, capabilities: ['Backup history and checksums', 'Integrity verification', 'Approved restore evidence'] },
} as const;

function WorkspaceRoutes({ user }: { user: AuthenticatedUser }) {
  const navigate = useNavigate();
  const fallback = defaultPath(user.permissions);
  return <Routes>
    <Route path="/" element={<Navigate to={fallback} replace />} />
    <Route path="/dashboard" element={<Allowed user={user} permissions={['dashboard.view']}><DashboardPage /></Allowed>} />
    <Route path="/subscribers" element={<Allowed user={user} permissions={['subscriber.view']}><SubscribersPage user={user} mode="list" onNavigate={navigate} /></Allowed>} />
    <Route path="/subscribers/new" element={<Allowed user={user} permissions={['subscriber.manage']}><SubscribersPage user={user} mode="create" onNavigate={navigate} /></Allowed>} />
    <Route path="/subscribers/services" element={<Allowed user={user} permissions={['service.view']}><ModulePage {...modulePages.services} /></Allowed>} />
    <Route path="/subscribers/:subscriberId" element={<Allowed user={user} permissions={['subscriber.view']}><SubscribersPage user={user} mode="profile" onNavigate={navigate} /></Allowed>} />
    <Route path="/billing/current" element={<Allowed user={user} permissions={['billing.view']}><ModulePage {...modulePages.billingCurrent} /></Allowed>} />
    <Route path="/billing/generate" element={<Allowed user={user} permissions={['billing.generate']}><ModulePage {...modulePages.billingGenerate} /></Allowed>} />
    <Route path="/billing/invoices" element={<Allowed user={user} permissions={['billing.view']}><ModulePage {...modulePages.invoices} /></Allowed>} />
    <Route path="/payments/receive" element={<Allowed user={user} permissions={['payment.create']}><ModulePage {...modulePages.receivePayment} /></Allowed>} />
    <Route path="/payments/history" element={<Allowed user={user} permissions={['payment.create', 'payment.reverse']}><ModulePage {...modulePages.paymentHistory} /></Allowed>} />
    <Route path="/payments/gcash" element={<Allowed user={user} permissions={['payment.verify_gcash']}><ModulePage {...modulePages.gcash} /></Allowed>} />
    <Route path="/collections/collectors" element={<Allowed user={user} permissions={['collection.view']}><ModulePage {...modulePages.collectors} /></Allowed>} />
    <Route path="/collections/routes" element={<Allowed user={user} permissions={['collection.view']}><ModulePage {...modulePages.routes} /></Allowed>} />
    <Route path="/collections/batches" element={<Allowed user={user} permissions={['collection.view']}><ModulePage {...modulePages.batches} /></Allowed>} />
    <Route path="/collections/remittance" element={<Allowed user={user} permissions={['collection.view']}><ModulePage {...modulePages.remittance} /></Allowed>} />
    <Route path="/receivables/outstanding" element={<Allowed user={user} permissions={['receivables.view']}><ModulePage {...modulePages.outstanding} /></Allowed>} />
    <Route path="/receivables/overdue" element={<Allowed user={user} permissions={['receivables.view']}><ModulePage {...modulePages.overdue} /></Allowed>} />
    <Route path="/receivables/aging" element={<Allowed user={user} permissions={['receivables.view']}><ModulePage {...modulePages.aging} /></Allowed>} />
    <Route path="/receivables/suspensions" element={<Allowed user={user} permissions={['receivables.view']}><ModulePage {...modulePages.suspensions} /></Allowed>} />
    <Route path="/services" element={<Allowed user={user} permissions={['service.view']}><ModulePage {...modulePages.services} /></Allowed>} />
    <Route path="/reports" element={<Allowed user={user} permissions={['report.view']}><ReportsPage /></Allowed>} />
    <Route path="/administration/users" element={<Allowed user={user} permissions={['user.manage']}><ModulePage {...modulePages.users} /></Allowed>} />
    <Route path="/administration/audit" element={<Allowed user={user} permissions={['audit.view']}><ModulePage {...modulePages.audit} /></Allowed>} />
    <Route path="/administration/settings" element={<Allowed user={user} permissions={['settings.manage']}><ModulePage {...modulePages.settings} /></Allowed>} />
    <Route path="/administration/backups" element={<Allowed user={user} permissions={['backup.create', 'backup.restore']}><ModulePage {...modulePages.backups} /></Allowed>} />
    <Route path="/connection" element={<SystemConnection />} />
    <Route path="*" element={<Navigate to={fallback} replace />} />
  </Routes>;
}

function Workspace({ user, onEndSession }: { user: AuthenticatedUser; onEndSession: (message?: string) => Promise<void> }) {
  const location = useLocation();
  const navigation = useMemo(() => visibleNavigation(user.permissions), [user.permissions]);
  const activeSection = navigation.find((item) => location.pathname === item.path || location.pathname.startsWith(`/${item.id}`) || item.children.some((child) => location.pathname === child.path));

  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink className="brand" to={defaultPath(user.permissions)}><img src={logo} alt="" /><span>BCIS<small>Billing &amp; Collection</small></span></NavLink>
      <nav aria-label="Main navigation">
        <p className="nav-description">Workspace</p>
        {navigation.map((item) => {
          const Icon = navigationIcons[item.id];
          const active = activeSection?.id === item.id;
          return <div className={`nav-group ${active ? 'active' : ''}`} key={item.id}>
            <NavLink className={`nav-item ${active ? 'active' : ''}`} to={item.path} aria-current={location.pathname === item.path ? 'page' : undefined}>
              <Icon aria-hidden="true" /><span>{item.label}</span>{item.children.length > 0 && <ChevronRight className="nav-chevron" aria-hidden="true" />}
            </NavLink>
            {active && item.children.length > 0 && <div className="subnav" aria-label={`${item.label} navigation`}>
              {item.children.map((child) => <NavLink key={child.path} to={child.path} className={({ isActive }) => `subnav-item ${isActive ? 'active' : ''}`} end={child.path === item.path}>{child.label}</NavLink>)}
            </div>}
          </div>;
        })}
        <div className="nav-separator" />
        <p className="nav-description">System</p>
        <NavLink className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} to="/connection"><Settings2 aria-hidden="true" /><span>Connection</span></NavLink>
      </nav>
      <div className="sidebar-account">
        <span className="user-avatar">{user.displayName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
        <div><strong>{user.displayName}</strong><small>{user.roles.map((role) => role.replaceAll('_', ' ')).join(', ')}</small></div>
        <button className="icon-button" onClick={() => void onEndSession()} aria-label="Sign out"><LogOut /></button>
      </div>
      <div className="sidebar-footer"><Building2 /><div>Office desktop<span>Secure API session</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div><strong>{pageLabel(location.pathname)}</strong><span>Bukidnon Cable and Internet Services</span></div>
        <div className="topbar-actions"><div className="live-indicator"><i />Live data</div><button className="lock-button" onClick={() => void onEndSession('Workstation locked. Sign in to continue.')}><LockKeyhole aria-hidden="true" />Lock</button></div>
      </header>
      <main id="main" tabIndex={-1}><WorkspaceRoutes user={user} /></main>
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

  useEffect(() => {
    const handleInvalidSession = () => {
      client.clear();
      client.setQueryData(['session'], null);
      setAuthError('Your session ended. Sign in again to continue.');
    };
    window.addEventListener(SESSION_INVALID_EVENT, handleInvalidSession);
    return () => window.removeEventListener(SESSION_INVALID_EVENT, handleInvalidSession);
  }, [client]);

  if (session.isPending) return <div className="app-boot"><img src={logo} alt="" /><p>Opening BCIS...</p></div>;
  if (session.isError) return <div className="app-boot error-state"><h1>BCIS could not start</h1><p>{session.error.message}</p></div>;
  if (!session.data || session.data.mustChangePassword) return <AuthScreen user={session.data} pending={loginMutation.isPending || passwordMutation.isPending} error={authError} onLogin={async (values) => { setAuthError(null); await loginMutation.mutateAsync(values); }} onChangePassword={async (values) => { setAuthError(null); await passwordMutation.mutateAsync(values); }} />;
  return <Workspace user={session.data} onEndSession={async (message) => {
    setAuthError(message ?? null);
    await logoutMutation.mutateAsync().catch(() => undefined);
  }} />;
}
