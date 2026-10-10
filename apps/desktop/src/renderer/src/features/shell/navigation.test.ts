import { describe, expect, it } from 'vitest';
import { canAccessPath, defaultPath, visibleNavigation } from './navigation';

const permissions = {
  owner: ['dashboard.view', 'subscriber.view', 'subscriber.manage', 'plan.manage', 'service.view', 'service.manage', 'service.status.update', 'billing.view', 'billing.generate', 'billing.adjust', 'payment.create', 'payment.verify_gcash', 'payment.reverse', 'receipt.void', 'collection.view', 'collection.manage', 'collection.reconcile', 'collection.close', 'receivables.view', 'report.view', 'report.export', 'audit.view', 'user.manage', 'settings.manage', 'backup.create', 'backup.restore'],
  admin: ['dashboard.view', 'subscriber.view', 'subscriber.manage', 'plan.manage', 'service.view', 'service.manage', 'service.status.update', 'billing.view', 'billing.generate', 'billing.adjust', 'payment.create', 'payment.verify_gcash', 'payment.reverse', 'receipt.void', 'collection.view', 'collection.manage', 'collection.reconcile', 'collection.close', 'receivables.view', 'report.view', 'report.export', 'user.manage', 'settings.manage', 'backup.create'],
  cashier: ['dashboard.view', 'subscriber.view', 'service.view', 'billing.view', 'payment.create', 'payment.verify_gcash'],
  collections: ['dashboard.view', 'subscriber.view', 'service.view', 'collection.view', 'collection.manage', 'collection.reconcile', 'collection.close', 'receivables.view', 'report.view', 'report.export'],
  auditor: ['dashboard.view', 'subscriber.view', 'service.view', 'billing.view', 'collection.view', 'receivables.view', 'report.view', 'report.export', 'audit.view'],
  technician: ['subscriber.view', 'service.view', 'service.status.update'],
  viewer: ['dashboard.view', 'report.view'],
} as const;

const ids = (key: keyof typeof permissions) => visibleNavigation(permissions[key]).map((item) => item.id);

describe('permission-aware navigation', () => {
  it('shows Owner and Admin every operational module', () => {
    expect(ids('owner')).toEqual(['dashboard', 'subscribers', 'billing', 'payments', 'collections', 'receivables', 'services', 'reports', 'administration']);
    expect(ids('admin')).toEqual(ids('owner'));
  });

  it('limits the Cashier to lookup, billing visibility, and payment work', () => {
    expect(ids('cashier')).toEqual(['dashboard', 'subscribers', 'billing', 'payments', 'services']);
    expect(canAccessPath(permissions.cashier, '/administration/users')).toBe(false);
    expect(canAccessPath(permissions.cashier, '/payments/gcash')).toBe(true);
  });

  it('shows collection and audit work only to their assigned roles', () => {
    expect(ids('collections')).toEqual(['dashboard', 'subscribers', 'collections', 'receivables', 'services', 'reports']);
    expect(ids('auditor')).toEqual(['dashboard', 'subscribers', 'billing', 'collections', 'receivables', 'services', 'reports', 'administration']);
    expect(visibleNavigation(permissions.auditor).find((item) => item.id === 'administration')?.children.map((child) => child.label)).toEqual(['Audit Trail']);
  });

  it('keeps Technician and Viewer read-focused', () => {
    expect(ids('technician')).toEqual(['subscribers', 'services']);
    expect(ids('viewer')).toEqual(['dashboard', 'reports']);
    expect(defaultPath(permissions.technician)).toBe('/subscribers');
    expect(defaultPath(permissions.viewer)).toBe('/dashboard');
  });
});
