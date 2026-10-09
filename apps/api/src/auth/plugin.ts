import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { AuthContext, AuthService, RequestMetadata } from './service.js';
import type { PermissionCode } from './permissions.js';
import { changePasswordSchema, loginSchema } from './schemas.js';
import { AppError } from '../errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    authContext: AuthContext | null;
  }
}

interface AuthPluginOptions { authService: AuthService }

const errorResponse = {
  type: 'object', required: ['error', 'message', 'requestId'], additionalProperties: false,
  properties: { error: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' } },
} as const;
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

function metadata(request: FastifyRequest): RequestMetadata {
  const userAgent = request.headers['user-agent'];
  return {
    requestId: request.id,
    ipAddress: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {}),
  };
}

function bearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  const match = authorization ? /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization) : null;
  if (!match?.[1]) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
  return match[1];
}

export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (app, options) => {
  app.decorateRequest('authContext', null);

  const authenticate = async (request: FastifyRequest) => {
    request.authContext = await options.authService.authenticate(bearerToken(request));
  };
  const requirePermission = (permission: PermissionCode) => async (request: FastifyRequest) => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    if (context.mustChangePassword) {
      throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change the demo password before using protected operations');
    }
    if (!context.permissions.includes(permission)) {
      await options.authService.auditDenied(context, permission, metadata(request));
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action');
    }
  };

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
    const result = await options.authService.login(input.username, input.password, metadata(request));
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
    await options.authService.logout(context, metadata(request));
    return reply.code(204).send();
  });

  app.post('/auth/change-password', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object', required: ['currentPassword', 'newPassword'], additionalProperties: false,
        properties: {
          currentPassword: { type: 'string', minLength: 1, maxLength: 256 },
          newPassword: { type: 'string', minLength: 12, maxLength: 128 },
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
    await options.authService.changePassword(context, input.currentPassword, input.newPassword, metadata(request));
    return reply.code(204).send();
  });

  app.get('/admin/users', {
    preHandler: [authenticate, requirePermission('user.manage')],
    schema: {
      response: {
        200: userListResponse,
        401: errorResponse, 403: errorResponse,
      },
    },
  }, async () => ({ items: await options.authService.listUsers() }));
};
