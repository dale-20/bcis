import type { FastifyPluginAsync } from 'fastify';
import type { AuthService } from './service.js';
import { changePasswordSchema, loginSchema, managedUserSchema, managedUserUpdateSchema, userPasswordResetSchema } from './schemas.js';
import { AppError } from '../errors.js';
import { authenticateWith, requestMetadata, requirePermission } from './guards.js';

interface AuthPluginOptions { authService: AuthService }

const errorResponse = {
  type: 'object', required: ['error', 'message', 'requestId'], additionalProperties: false,
  properties: { error: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' } },
} as const;

function isDuplicateUsername(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && 'constraint' in error && error.code === '23505' && error.constraint === 'users_normalized_username_uq') return true;
  return 'cause' in error && error.cause !== error && isDuplicateUsername(error.cause);
}
const userResponse = {
  type: 'object', required: ['userId', 'username', 'displayName', 'mustChangePassword', 'roles', 'permissions'], additionalProperties: false,
  properties: {
    userId: { type: 'string', format: 'uuid' }, username: { type: 'string' }, displayName: { type: 'string' },
    mustChangePassword: { type: 'boolean' }, roles: { type: 'array', items: { type: 'string' } },
    permissions: { type: 'array', items: { type: 'string' } },
  },
} as const;
const userListResponse = {
  type: 'object', required: ['items'], additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'username', 'displayName', 'isActive', 'mustChangePassword', 'roles'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', format: 'uuid' }, username: { type: 'string' }, displayName: { type: 'string' },
          isActive: { type: 'boolean' }, mustChangePassword: { type: 'boolean' },
          roles: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;

export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (app, options) => {
  const authenticate = authenticateWith(options.authService);

  app.post('/auth/login', {
    schema: {
      body: { type: 'object', required: ['username', 'password'], additionalProperties: false, properties: { username: { type: 'string', minLength: 3, maxLength: 64 }, password: { type: 'string', minLength: 1, maxLength: 256 } } },
      response: {
        200: { type: 'object', required: ['token', 'expiresAt', 'user'], additionalProperties: false, properties: { token: { type: 'string' }, expiresAt: { type: 'string', format: 'date-time' }, user: userResponse } },
        400: errorResponse, 401: errorResponse, 429: errorResponse,
      },
    },
  }, async (request) => {
    const input = loginSchema.parse(request.body);
    const result = await options.authService.login(input.username, input.password, requestMetadata(request));
    return { ...result, expiresAt: result.expiresAt.toISOString() };
  });

  app.get('/auth/me', {
    preHandler: [authenticate],
    schema: { response: { 200: userResponse, 401: errorResponse } },
  }, async (request) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    return {
      userId: context.userId,
      username: context.username,
      displayName: context.displayName,
      mustChangePassword: context.mustChangePassword,
      roles: context.roles,
      permissions: context.permissions,
    };
  });

  app.post('/auth/logout', {
    preHandler: [authenticate],
    schema: { response: { 204: { type: 'null' }, 401: errorResponse } },
  }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    await options.authService.logout(context, requestMetadata(request));
    return reply.code(204).send();
  });

  app.post('/auth/change-password', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object', required: ['currentPassword', 'newPassword'], additionalProperties: false,
        properties: {
          currentPassword: { type: 'string', minLength: 1, maxLength: 256 },
          newPassword: { type: 'string', minLength: 8, maxLength: 128 },
        },
      },
      response: {
        204: { type: 'null' }, 400: errorResponse, 401: errorResponse,
      },
    },
  }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    const input = changePasswordSchema.parse(request.body);
    await options.authService.changePassword(context, input.currentPassword, input.newPassword, requestMetadata(request));
    return reply.code(204).send();
  });

  app.get('/admin/users', {
    preHandler: [authenticate, requirePermission(options.authService, 'user.manage')],
    schema: {
      response: {
        200: userListResponse,
        401: errorResponse, 403: errorResponse,
      },
    },
  }, async () => ({ items: await options.authService.listUsers() }));

  app.post('/admin/users', {
    preHandler: [authenticate, requirePermission(options.authService, 'user.manage')],
    schema: { body: { type: 'object', required: ['username', 'displayName', 'role', 'password'], additionalProperties: false, properties: {
      username: { type: 'string', minLength: 3, maxLength: 64 }, displayName: { type: 'string', minLength: 1, maxLength: 120 },
      role: { type: 'string', enum: ['OWNER', 'ADMIN', 'CASHIER', 'COLLECTION_SUPERVISOR', 'AUDITOR', 'TECHNICIAN', 'VIEWER'] }, password: { type: 'string', minLength: 8, maxLength: 128 },
    } }, response: { 201: { type: 'object', required: ['id'], additionalProperties: false, properties: { id: { type: 'string', format: 'uuid' } } }, 400: errorResponse, 401: errorResponse, 403: errorResponse, 409: errorResponse } },
  }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    let result: { id: string };
    try {
      result = await options.authService.createManagedUser(managedUserSchema.parse(request.body), context, requestMetadata(request));
    } catch (error) {
      if (isDuplicateUsername(error)) throw new AppError(409, 'USERNAME_TAKEN', 'That username is already assigned');
      throw error;
    }
    return reply.code(201).send(result);
  });

  app.patch('/admin/users/:userId', {
    preHandler: [authenticate, requirePermission(options.authService, 'user.manage')],
    schema: { params: { type: 'object', required: ['userId'], additionalProperties: false, properties: { userId: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', minProperties: 1, additionalProperties: false, properties: { displayName: { type: 'string', minLength: 1, maxLength: 120 }, role: { type: 'string', enum: ['OWNER', 'ADMIN', 'CASHIER', 'COLLECTION_SUPERVISOR', 'AUDITOR', 'TECHNICIAN', 'VIEWER'] }, isActive: { type: 'boolean' } } },
      response: { 204: { type: 'null' }, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } },
  }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    const { userId } = request.params as { userId: string };
    const parsed = managedUserUpdateSchema.parse(request.body);
    await options.authService.updateManagedUser(userId, {
      ...(parsed.displayName !== undefined ? { displayName: parsed.displayName } : {}),
      ...(parsed.role !== undefined ? { role: parsed.role } : {}),
      ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
    }, context, requestMetadata(request));
    return reply.code(204).send();
  });

  app.post('/admin/users/:userId/password-reset', {
    preHandler: [authenticate, requirePermission(options.authService, 'user.manage')],
    schema: { params: { type: 'object', required: ['userId'], additionalProperties: false, properties: { userId: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', required: ['password'], additionalProperties: false, properties: { password: { type: 'string', minLength: 8, maxLength: 128 } } },
      response: { 204: { type: 'null' }, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse } },
  }, async (request, reply) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    const { userId } = request.params as { userId: string };
    const { password } = userPasswordResetSchema.parse(request.body);
    await options.authService.resetManagedUserPassword(userId, password, context, requestMetadata(request));
    return reply.code(204).send();
  });
};
