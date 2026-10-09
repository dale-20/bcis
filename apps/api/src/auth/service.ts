import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { auditLogs, permissions, rolePermissions, roles, userRoles, userSessions, users } from '../db/schema.js';
import { AppError } from '../errors.js';
import { PasswordHasher } from './password.js';
import { permissionDefinitions, type PermissionCode } from './permissions.js';
import { normalizeUsername } from './schemas.js';

const FAILED_LOGIN_LIMIT = 5;
const LOCK_MINUTES = 15;
const IDLE_MINUTES = 30;
const ABSOLUTE_HOURS = 8;

function invalidCredentials(): AppError {
  return new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
}

export interface RequestMetadata {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthContext {
  sessionId: string;
  userId: string;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
  roles: string[];
  permissions: PermissionCode[];
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: Omit<AuthContext, 'sessionId'>;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function isPermissionCode(value: string): value is PermissionCode {
  return Object.hasOwn(permissionDefinitions, value);
}

export class AuthService {
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly database: Database,
    private readonly passwordHasher = new PasswordHasher(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.dummyHash = passwordHasher.hash('not-a-real-bcis-account-password');
  }

  async login(username: string, password: string, metadata: RequestMetadata): Promise<LoginResult> {
    const normalizedUsername = normalizeUsername(username);
    const [user] = await this.database.db.select().from(users)
      .where(eq(users.normalizedUsername, normalizedUsername)).limit(1);
    const verified = await this.passwordHasher.verify(password, user?.passwordHash ?? await this.dummyHash);
    const now = this.now();
    const locked = user?.lockedUntil !== null && user?.lockedUntil !== undefined && user.lockedUntil > now;

    if (!user || !verified || !user.isActive || locked) {
      await this.database.db.transaction(async (transaction) => {
        if (user && user.isActive && !locked) {
          await transaction.update(users).set({
            failedLoginCount: sql`${users.failedLoginCount} + 1`,
            lockedUntil: sql`CASE WHEN ${users.failedLoginCount} + 1 >= ${FAILED_LOGIN_LIMIT} THEN ${now}::timestamptz + (${LOCK_MINUTES} * interval '1 minute') ELSE ${users.lockedUntil} END`,
            updatedAt: now,
          }).where(eq(users.id, user.id));
        }
        await transaction.insert(auditLogs).values({
          actorUserId: user?.id,
          action: 'auth.login.failed',
          entityType: 'user',
          entityId: user?.id,
          reason: locked ? 'ACCOUNT_LOCKED' : user?.isActive === false ? 'ACCOUNT_INACTIVE' : 'INVALID_CREDENTIALS',
          newValues: { normalizedUsername },
          requestId: metadata.requestId,
          ipAddress: metadata.ipAddress,
          createdAt: now,
        });
      });
      throw invalidCredentials();
    }

    const token = randomBytes(32).toString('base64url');
    const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_HOURS * 60 * 60 * 1000);
    const idleExpiresAt = new Date(now.getTime() + IDLE_MINUTES * 60 * 1000);
    await this.database.db.transaction(async (transaction) => {
      const [session] = await transaction.insert(userSessions).values({
        userId: user.id,
        tokenHash: tokenHash(token),
        createdAt: now,
        lastSeenAt: now,
        idleExpiresAt,
        absoluteExpiresAt,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent?.slice(0, 255),
      }).returning({ id: userSessions.id });
      if (!session) throw new Error('Session insert did not return an identifier');
      await transaction.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now })
        .where(eq(users.id, user.id));
      await transaction.insert(auditLogs).values({
        actorUserId: user.id,
        sessionId: session.id,
        action: 'auth.login.succeeded',
        entityType: 'user',
        entityId: user.id,
        requestId: metadata.requestId,
        ipAddress: metadata.ipAddress,
        createdAt: now,
      });
    });
    const grants = await this.loadGrants(user.id);
    return {
      token,
      expiresAt: absoluteExpiresAt,
      user: {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        mustChangePassword: user.mustChangePassword,
        ...grants,
      },
    };
  }

  async authenticate(token: string): Promise<AuthContext> {
    const now = this.now();
    const [record] = await this.database.db.select({
      sessionId: userSessions.id,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      mustChangePassword: users.mustChangePassword,
      absoluteExpiresAt: userSessions.absoluteExpiresAt,
    }).from(userSessions).innerJoin(users, eq(userSessions.userId, users.id)).where(and(
      eq(userSessions.tokenHash, tokenHash(token)),
      isNull(userSessions.revokedAt),
      gt(userSessions.idleExpiresAt, now),
      gt(userSessions.absoluteExpiresAt, now),
      eq(users.isActive, true),
    )).limit(1);
    if (!record) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');

    const nextIdle = new Date(Math.min(record.absoluteExpiresAt.getTime(), now.getTime() + IDLE_MINUTES * 60 * 1000));
    await this.database.db.update(userSessions).set({ lastSeenAt: now, idleExpiresAt: nextIdle })
      .where(eq(userSessions.id, record.sessionId));
    return { ...record, ...(await this.loadGrants(record.userId)) };
  }

  async logout(context: AuthContext, metadata: RequestMetadata): Promise<void> {
    const now = this.now();
    await this.database.db.transaction(async (transaction) => {
      await transaction.update(userSessions).set({ revokedAt: now, revokedReason: 'USER_LOGOUT' })
        .where(and(eq(userSessions.id, context.sessionId), isNull(userSessions.revokedAt)));
      await transaction.insert(auditLogs).values({
        actorUserId: context.userId,
        sessionId: context.sessionId,
        action: 'auth.logout',
        entityType: 'user_session',
        entityId: context.sessionId,
        requestId: metadata.requestId,
        ipAddress: metadata.ipAddress,
        createdAt: now,
      });
    });
  }

  async changePassword(
    context: AuthContext,
    currentPassword: string,
    newPassword: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    const [user] = await this.database.db.select({ passwordHash: users.passwordHash }).from(users)
      .where(eq(users.id, context.userId)).limit(1);
    if (!user || !await this.passwordHasher.verify(currentPassword, user.passwordHash)) {
      throw new AppError(400, 'CURRENT_PASSWORD_INVALID', 'Current password is incorrect');
    }
    const passwordHash = await this.passwordHasher.hash(newPassword);
    const now = this.now();
    await this.database.db.transaction(async (transaction) => {
      await transaction.update(users).set({
        passwordHash,
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: now,
      }).where(eq(users.id, context.userId));
      await transaction.update(userSessions).set({ revokedAt: now, revokedReason: 'PASSWORD_CHANGED' }).where(and(
        eq(userSessions.userId, context.userId),
        isNull(userSessions.revokedAt),
        sql`${userSessions.id} <> ${context.sessionId}`,
      ));
      await transaction.insert(auditLogs).values({
        actorUserId: context.userId,
        sessionId: context.sessionId,
        action: 'auth.password.changed',
        entityType: 'user',
        entityId: context.userId,
        requestId: metadata.requestId,
        ipAddress: metadata.ipAddress,
        createdAt: now,
      });
    });
  }

  async auditDenied(context: AuthContext, permission: PermissionCode, metadata: RequestMetadata): Promise<void> {
    await this.database.db.insert(auditLogs).values({
      actorUserId: context.userId,
      sessionId: context.sessionId,
      action: 'authorization.denied',
      entityType: 'permission',
      entityId: permission,
      reason: 'MISSING_PERMISSION',
      newValues: { permission },
      requestId: metadata.requestId,
      ipAddress: metadata.ipAddress,
      createdAt: this.now(),
    });
  }

  async listUsers() {
    const rows = await this.database.db.select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      role: roles.code,
    }).from(users).leftJoin(userRoles, eq(userRoles.userId, users.id)).leftJoin(roles, eq(roles.id, userRoles.roleId))
      .orderBy(users.username, roles.code);
    const grouped = new Map<string, { id: string; username: string; displayName: string; isActive: boolean; mustChangePassword: boolean; roles: string[] }>();
    for (const row of rows) {
      const current = grouped.get(row.id) ?? { id: row.id, username: row.username, displayName: row.displayName, isActive: row.isActive, mustChangePassword: row.mustChangePassword, roles: [] };
      if (row.role) current.roles.push(row.role);
      grouped.set(row.id, current);
    }
    return [...grouped.values()];
  }

  private async loadGrants(userId: string): Promise<{ roles: string[]; permissions: PermissionCode[] }> {
    const roleRows = await this.database.db.select({ code: roles.code }).from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, userId)).orderBy(roles.code);
    const roleIds = await this.database.db.select({ id: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId));
    if (roleIds.length === 0) return { roles: [], permissions: [] };
    const permissionRows = await this.database.db.selectDistinct({ code: permissions.code }).from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(inArray(rolePermissions.roleId, roleIds.map((row) => row.id))).orderBy(permissions.code);
    return {
      roles: roleRows.map((row) => row.code),
      permissions: permissionRows.map((row) => row.code).filter(isPermissionCode),
    };
  }
}
