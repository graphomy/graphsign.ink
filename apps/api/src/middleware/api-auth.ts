import type { MiddlewareHandler } from 'hono';
import { verifyJwt, type JwtPayload } from '../utils/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import type { RequestPrincipal } from '../types/principal.js';
import { API_SCOPES } from '../types/principal.js';
import type { PrismaClient } from '@graphsign/db';
import { getLegacyPrisma } from '@graphsign/db';

declare module 'hono' {
  interface ContextVariableMap {
    principal: RequestPrincipal;
    userPayload: JwtPayload;
    userId: string;
    userEmail: string;
    userRole: string;
    orgId: string;
    requestId: string;
  }
}

/** Standard role-to-scopes mapping. */
function getScopesForRole(role: string): string[] {
  switch (role?.toLowerCase()) {
    case 'superadmin':
    case 'admin':
      return Object.values(API_SCOPES);
    case 'editor':
      return [
        API_SCOPES.DOCUMENTS_READ,
        API_SCOPES.DOCUMENTS_CREATE,
        API_SCOPES.DOCUMENTS_UPDATE,
        API_SCOPES.TEMPLATES_READ,
        API_SCOPES.WEBHOOKS_READ,
      ];
    case 'viewer':
      return [
        API_SCOPES.DOCUMENTS_READ,
        API_SCOPES.TEMPLATES_READ,
        API_SCOPES.WEBHOOKS_READ,
      ];
    case 'user':
    default:
      return [
        API_SCOPES.DOCUMENTS_READ,
        API_SCOPES.DOCUMENTS_CREATE,
        API_SCOPES.DOCUMENTS_UPDATE,
        API_SCOPES.DOCUMENTS_DELETE,
        API_SCOPES.TEMPLATES_READ,
        API_SCOPES.WEBHOOKS_READ,
        API_SCOPES.WEBHOOKS_MANAGE,
      ];
  }
}

export interface ApiAuthOptions {
  prisma?: PrismaClient;
  requiredScopes?: string[];
  requiredRoles?: string[];
}

/**
 * Unified Authentication & Authorization Middleware (INK-148, FR-016.006, FR-016.007).
 * Supports User JWTs and Machine-to-Machine OAuth2 Client Bindings.
 * Preserves downstream status codes by keeping await next() outside the auth try/catch.
 */
export function apiAuth(options?: ApiAuthOptions): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header('authorization');
    const cookieHeader = c.req.header('cookie');
    const queryToken = c.req.query('token');

    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (queryToken) {
      token = queryToken.trim();
    } else if (cookieHeader) {
      const match =
        cookieHeader.match(/graphsign_session=([^;]+)/) ||
        cookieHeader.match(/graphsign_session_token=([^;]+)/);
      if (match && match[1]) {
        token = match[1];
      }
    }

    if (!token) {
      throw new UnauthorizedError('Authentication token is required.');
    }

    let principal: RequestPrincipal;
    const prisma: PrismaClient = options?.prisma || (c as any).prisma || getLegacyPrisma();
    const requestId = c.get('requestId') || c.req.header('x-request-id') || crypto.randomUUID();

    try {
      const secret = (c.env as any)?.JWT_SECRET || process.env.JWT_SECRET;
      const payload = await verifyJwt(token, secret);

      // Check durable revocation list if jti is present
      if (payload.jti && prisma?.revokedAccessToken?.findUnique) {
        const isRevoked = await prisma.revokedAccessToken.findUnique({
          where: { jti: payload.jti },
        });
        if (isRevoked) {
          throw new Error('Token has been revoked.');
        }
      }

      const orgId = payload.orgId as string;
      const sub = payload.sub as string;
      const role = (payload.role as string) || 'user';
      const email = payload.email as string | undefined;
      const issuer = (payload.iss as string) || 'graphsign-local';

      // Check if machine client binding
      if (payload.client_id || payload.isClient) {
        const clientId = (payload.client_id as string) || sub;
        const binding = await prisma.apiClientBinding?.findFirst?.({
          where: {
            clientId,
            organisationId: orgId,
            status: 'active',
            deletedAt: null,
          },
        });

        if (!binding) {
          throw new Error('API Client Binding is not found or inactive.');
        }

        const bindingScopes = Array.isArray(binding.scopes) ? (binding.scopes as string[]) : [];

        principal = {
          kind: 'service',
          id: clientId,
          organisationId: orgId,
          userId: binding.actingUserId ?? undefined,
          roles: ['service_client'],
          scopes: bindingScopes,
          issuer,
          requestId,
          clientBindingId: binding.id,
        };
      } else {
        // User session principal
        const userScopes = getScopesForRole(role);

        principal = {
          kind: 'user',
          id: sub,
          userId: sub,
          organisationId: orgId,
          email,
          roles: [role],
          scopes: userScopes,
          issuer,
          requestId,
        };
      }

      // Legacy context variable compatibility
      c.set('principal', principal);
      c.set('userPayload', payload);
      c.set('userId', principal.userId || principal.id);
      if (principal.email) c.set('userEmail', principal.email);
      c.set('userRole', principal.roles[0] || 'user');
      c.set('orgId', principal.organisationId);
    } catch (err: any) {
      const msg = err?.message || 'Invalid or expired authentication token.';
      if (msg.includes('expired')) {
        throw new UnauthorizedError('token_expired');
      }
      throw new UnauthorizedError(msg);
    }

    // Permission / scope enforcement
    if (options?.requiredScopes && options.requiredScopes.length > 0) {
      const hasAllScopes = options.requiredScopes.every((s) => principal.scopes.includes(s));
      if (!hasAllScopes && !principal.roles.includes('superadmin') && !principal.roles.includes('admin')) {
        throw new ForbiddenError(
          `Insufficient scope. Required: ${options.requiredScopes.join(', ')}`,
        );
      }
    }

    if (options?.requiredRoles && options.requiredRoles.length > 0) {
      const hasRole = options.requiredRoles.some((r) => principal.roles.includes(r));
      if (!hasRole && !principal.roles.includes('superadmin')) {
        throw new ForbiddenError(
          `Insufficient role. Required: ${options.requiredRoles.join(', ')}`,
        );
      }
    }

    // Safe invocation of downstream handlers outside of auth catch block
    await next();
  };
}

/**
 * Middleware factory requiring specific API scopes.
 */
export function requireScopes(...scopes: string[]): MiddlewareHandler {
  return async (c, next) => {
    const principal = c.get('principal');
    if (!principal) {
      throw new UnauthorizedError('Authentication required.');
    }
    if (principal.roles.includes('superadmin') || principal.roles.includes('admin')) {
      return await next();
    }
    const missing = scopes.filter((s) => !principal.scopes.includes(s));
    if (missing.length > 0) {
      throw new ForbiddenError(`Missing required permission: ${missing.join(', ')}`);
    }
    await next();
  };
}
