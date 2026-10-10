export type NavigationItemId =
  | 'dashboard'
  | 'subscribers'
  | 'billing'
  | 'payments'
  | 'collections'
  | 'receivables'
  | 'services'
  | 'reports'
  | 'administration';

export type NavigationChild = {
  label: string;
  path: string;
  permissions: readonly string[];
};

export type NavigationItem = {
  id: NavigationItemId;
  label: string;
  path: string;
  permissions: readonly string[];
  children?: readonly NavigationChild[];
};

export type VisibleNavigationItem = Omit<NavigationItem, 'children'> & {
  children: NavigationChild[];
};

export const navigationItems: readonly NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', permissions: ['dashboard.view'] },
  {
    id: 'subscribers', label: 'Subscribers', path: '/subscribers', permissions: ['subscriber.view'],
    children: [
      { label: 'All Subscribers', path: '/subscribers', permissions: ['subscriber.view'] },
      { label: 'New Subscriber', path: '/subscribers/new', permissions: ['subscriber.manage'] },
      { label: 'Service Accounts', path: '/subscribers/services', permissions: ['service.view'] },
    ],
  },
  {
    id: 'billing', label: 'Billing', path: '/billing/current', permissions: ['billing.view', 'billing.generate'],
    children: [
      { label: 'Current Billing', path: '/billing/current', permissions: ['billing.view'] },
      { label: 'Generate Billing', path: '/billing/generate', permissions: ['billing.generate'] },
      { label: 'Invoices', path: '/billing/invoices', permissions: ['billing.view'] },
    ],
  },
  {
    id: 'payments', label: 'Payments', path: '/payments/receive', permissions: ['payment.create', 'payment.verify_gcash', 'payment.reverse'],
    children: [
      { label: 'Receive Payment', path: '/payments/receive', permissions: ['payment.create'] },
      { label: 'Payment History', path: '/payments/history', permissions: ['payment.create', 'payment.reverse'] },
      { label: 'GCash Verification', path: '/payments/gcash', permissions: ['payment.verify_gcash'] },
    ],
  },
  {
    id: 'collections', label: 'Collections', path: '/collections/batches', permissions: ['collection.view'],
    children: [
      { label: 'Collectors', path: '/collections/collectors', permissions: ['collection.view'] },
      { label: 'Areas & Routes', path: '/collections/routes', permissions: ['collection.view'] },
      { label: 'Collection Batches', path: '/collections/batches', permissions: ['collection.view'] },
      { label: 'Remittance', path: '/collections/remittance', permissions: ['collection.view'] },
    ],
  },
  {
    id: 'receivables', label: 'Receivables', path: '/receivables/outstanding', permissions: ['receivables.view'],
    children: [
      { label: 'Outstanding', path: '/receivables/outstanding', permissions: ['receivables.view'] },
      { label: 'Overdue', path: '/receivables/overdue', permissions: ['receivables.view'] },
      { label: 'Aging', path: '/receivables/aging', permissions: ['receivables.view'] },
      { label: 'Suspension Candidates', path: '/receivables/suspensions', permissions: ['receivables.view'] },
    ],
  },
  { id: 'services', label: 'Services', path: '/services', permissions: ['service.view'] },
  { id: 'reports', label: 'Reports', path: '/reports', permissions: ['report.view'] },
  {
    id: 'administration', label: 'Administration', path: '/administration/users',
    permissions: ['user.manage', 'settings.manage', 'audit.view', 'backup.create', 'backup.restore'],
    children: [
      { label: 'Users & Roles', path: '/administration/users', permissions: ['user.manage'] },
      { label: 'Audit Trail', path: '/administration/audit', permissions: ['audit.view'] },
      { label: 'Settings', path: '/administration/settings', permissions: ['settings.manage'] },
      { label: 'Backup & Restore', path: '/administration/backups', permissions: ['backup.create', 'backup.restore'] },
    ],
  },
];

export function hasAnyPermission(userPermissions: readonly string[], required: readonly string[]): boolean {
  return required.some((permission) => userPermissions.includes(permission));
}

export function visibleNavigation(userPermissions: readonly string[]): VisibleNavigationItem[] {
  return navigationItems
    .filter((item) => hasAnyPermission(userPermissions, item.permissions))
    .map((item) => ({
      ...item,
      children: (item.children ?? []).filter((child) => hasAnyPermission(userPermissions, child.permissions)),
    }));
}

export function defaultPath(userPermissions: readonly string[]): string {
  return visibleNavigation(userPermissions)[0]?.path ?? '/connection';
}

export function canAccessPath(userPermissions: readonly string[], path: string): boolean {
  if (path === '/connection') return true;
  return navigationItems.some((item) => {
    if (item.path === path) return hasAnyPermission(userPermissions, item.permissions);
    return item.children?.some((child) => child.path === path && hasAnyPermission(userPermissions, child.permissions)) ?? false;
  });
}

export function pageLabel(path: string): string {
  for (const item of navigationItems) {
    const child = item.children?.find((candidate) => candidate.path === path);
    if (child) return child.label;
    if (item.path === path) return item.label;
  }
  if (path.startsWith('/subscribers/')) return 'Subscriber Profile';
  return path === '/connection' ? 'System Connection' : 'BCIS Workspace';
}
