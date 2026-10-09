import type { FastifyRequest } from 'fastify';
import type { PermissionCode } from './permissions.js';
import type { AuthContext, AuthService, RequestMetadata } from './service.js';
import { AppError } from '../errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    authContext: AuthContext | null;
  }
}

export function requestMetadata(request: FastifyRequest): RequestMetadata {
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

export function authenticateWith(authService: AuthService) {
  return async (request: FastifyRequest): Promise<void> => {
    request.authContext = await authService.authenticate(bearerToken(request));
  };
}

export function requirePermission(authService: AuthService, permission: PermissionCode) {
  return async (request: FastifyRequest): Promise<void> => {
    const context = request.authContext;
    if (!context) throw new AppError(401, 'SESSION_INVALID', 'Authentication required');
    if (context.mustChangePassword) {
      throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change the demo password before using protected operations');
    }
    if (!context.permissions.includes(permission)) {
      await authService.auditDenied(context, permission, requestMetadata(request));
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action');
    }
  };
}

