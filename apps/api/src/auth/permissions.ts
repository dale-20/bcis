export const permissionDefinitions = {
  'dashboard.view': 'View operational dashboards',
  'subscriber.view': 'View subscribers and service balances',
  'subscriber.manage': 'Create and maintain subscriber records',
  'plan.manage': 'Create and maintain service plans',
  'service.view': 'View service account operational information',
  'service.manage': 'Create and maintain service accounts',
  'service.status.update': 'Record suspension and reconnection operations',
  'billing.view': 'View billing cycles and invoices',
  'billing.generate': 'Generate and finalize billing',
  'billing.adjust': 'Request or approve billing adjustments',
  'payment.create': 'Create and post authorized payments',
  'payment.verify_gcash': 'Verify or reject GCash proof',
  'payment.reverse': 'Reverse a posted payment',
  'receipt.void': 'Void a receipt without reusing its number',
  'collection.view': 'View collection areas, routes, and batches',
  'collection.manage': 'Manage collectors, routes, and batches',
  'collection.reconcile': 'Record remittance and reconciliation',
  'collection.close': 'Authorize collection batch closure',
  'receivables.view': 'View outstanding and aging receivables',
  'report.view': 'View management and operational reports',
  'report.export': 'Export authorized reports',
  'audit.view': 'View immutable audit records',
  'user.manage': 'Manage users and role assignments',
  'settings.manage': 'Manage application settings',
  'backup.create': 'Create and verify backups',
  'backup.restore': 'Authorize and perform restore operations',
} as const;

export type PermissionCode = keyof typeof permissionDefinitions;
export type RoleCode = keyof typeof roleDefinitions;

const allPermissions = Object.keys(permissionDefinitions) as PermissionCode[];
export const roleDefinitions = {
  OWNER: { name: 'Owner / Super Admin', description: 'Full system control', permissions: allPermissions },
  ADMIN: {
    name: 'Administrator', description: 'Operational and user administration without restore or audit authority',
    permissions: allPermissions.filter((code) => !['backup.restore', 'audit.view'].includes(code)),
  },
  CASHIER: {
    name: 'Cashier', description: 'Subscriber lookup and authorized payment collection',
    permissions: ['dashboard.view', 'subscriber.view', 'service.view', 'billing.view', 'payment.create', 'payment.verify_gcash'] as PermissionCode[],
  },
  COLLECTION_SUPERVISOR: {
    name: 'Collection Supervisor', description: 'Collector routes, batches, remittance, and reconciliation',
    permissions: ['dashboard.view', 'subscriber.view', 'service.view', 'collection.view', 'collection.manage', 'collection.reconcile', 'collection.close', 'receivables.view', 'report.view', 'report.export'] as PermissionCode[],
  },
  AUDITOR: {
    name: 'Accounting / Auditor', description: 'Read-only financial, receivable, reversal, and audit review',
    permissions: ['dashboard.view', 'subscriber.view', 'service.view', 'billing.view', 'collection.view', 'receivables.view', 'report.view', 'report.export', 'audit.view'] as PermissionCode[],
  },
  TECHNICIAN: {
    name: 'Technician', description: 'Service status and reconnection operations only',
    permissions: ['subscriber.view', 'service.view', 'service.status.update'] as PermissionCode[],
  },
  VIEWER: {
    name: 'Read-only Viewer', description: 'Read-only dashboards and reports',
    permissions: ['dashboard.view', 'report.view'] as PermissionCode[],
  },
} as const;
