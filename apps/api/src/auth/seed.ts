import { eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { auditLogs, permissions, rolePermissions, roles, userRoles, users } from '../db/schema.js';
import { PasswordHasher } from './password.js';
import { permissionDefinitions, roleDefinitions, type RoleCode } from './permissions.js';
import { demoPasswordSchema, normalizeUsername, usernameSchema } from './schemas.js';

export interface DemoAccount {
  username: string;
  displayName: string;
  role: RoleCode;
}

export const demoAccounts: readonly DemoAccount[] = [
  { username: 'owner.demo', displayName: 'Demo Owner', role: 'OWNER' },
  { username: 'admin.demo', displayName: 'Demo Administrator', role: 'ADMIN' },
  { username: 'cashier.demo', displayName: 'Demo Cashier', role: 'CASHIER' },
  { username: 'collections.demo', displayName: 'Demo Collection Supervisor', role: 'COLLECTION_SUPERVISOR' },
  { username: 'auditor.demo', displayName: 'Demo Auditor', role: 'AUDITOR' },
  { username: 'technician.demo', displayName: 'Demo Technician', role: 'TECHNICIAN' },
  { username: 'viewer.demo', displayName: 'Demo Read-only Viewer', role: 'VIEWER' },
] as const;

export async function seedAuthorization(
  database: Database,
  password: string,
  passwordHasher = new PasswordHasher(),
  accounts: readonly DemoAccount[] = demoAccounts,
): Promise<void> {
  demoPasswordSchema.parse(password);
  for (const account of accounts) usernameSchema.parse(account.username);
  const passwordHashes = new Map<string, string>();
  for (const account of accounts) passwordHashes.set(account.username, await passwordHasher.hash(password));

  await database.db.transaction(async (transaction) => {
    for (const [code, description] of Object.entries(permissionDefinitions)) {
      await transaction.insert(permissions).values({ code, description }).onConflictDoUpdate({
        target: permissions.code,
        set: { description },
      });
    }
    for (const [code, definition] of Object.entries(roleDefinitions)) {
      await transaction.insert(roles).values({ code, name: definition.name, description: definition.description, isSystem: true })
        .onConflictDoUpdate({ target: roles.code, set: { name: definition.name, description: definition.description, isSystem: true } });
    }

    const roleRows = await transaction.select({ id: roles.id, code: roles.code }).from(roles);
    const permissionRows = await transaction.select({ id: permissions.id, code: permissions.code }).from(permissions);
    const roleByCode = new Map(roleRows.map((row) => [row.code, row.id]));
    const permissionByCode = new Map(permissionRows.map((row) => [row.code, row.id]));
    const systemRoleIds = Object.keys(roleDefinitions).map((code) => roleByCode.get(code)).filter((id): id is string => id !== undefined);
    if (systemRoleIds.length !== Object.keys(roleDefinitions).length) throw new Error('Authorization role seed incomplete');
    await transaction.delete(rolePermissions).where(inArray(rolePermissions.roleId, systemRoleIds));
    for (const [roleCode, definition] of Object.entries(roleDefinitions)) {
      const roleId = roleByCode.get(roleCode);
      if (!roleId) throw new Error(`Seeded role missing: ${roleCode}`);
      const grants = definition.permissions.map((permissionCode) => {
        const permissionId = permissionByCode.get(permissionCode);
        if (!permissionId) throw new Error(`Seeded permission missing: ${permissionCode}`);
        return { roleId, permissionId };
      });
      if (grants.length > 0) await transaction.insert(rolePermissions).values(grants);
    }

    const seededUserIds: string[] = [];
    for (const account of accounts) {
      const passwordHash = passwordHashes.get(account.username);
      if (!passwordHash) throw new Error(`Password hash missing for ${account.username}`);
      const normalizedUsername = normalizeUsername(account.username);
      const [user] = await transaction.insert(users).values({
        username: account.username,
        normalizedUsername,
        displayName: account.displayName,
        passwordHash,
        isActive: true,
        mustChangePassword: true,
      }).onConflictDoUpdate({
        target: users.normalizedUsername,
        set: { username: account.username, displayName: account.displayName, passwordHash, isActive: true, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() },
      }).returning({ id: users.id });
      if (!user) throw new Error(`Seeded user missing: ${account.username}`);
      seededUserIds.push(user.id);
      const roleId = roleByCode.get(account.role);
      if (!roleId) throw new Error(`Seeded account role missing: ${account.role}`);
      await transaction.delete(userRoles).where(eq(userRoles.userId, user.id));
      await transaction.insert(userRoles).values({ userId: user.id, roleId });
    }

    await transaction.insert(auditLogs).values({
      action: 'security.demo_seed.applied',
      entityType: 'user',
      reason: 'SYNTHETIC_DEMO_ACCOUNTS',
      newValues: { userIds: seededUserIds, usernames: accounts.map((account) => account.username) },
      requestId: 'seed:demo',
    });
  });
}
