import type { MiddlewareHandler } from 'hono';
import { SUPER_ADMIN_EMAIL } from '../config/roles.js';
import { hasPermission } from '../config/permissions.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export interface RbacContextVariables {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  orgId?: string;
}

/**
 * Middleware enforcing role-based access control (FR-003.003 / INK-63).
 * Requires the request to have a user role matching one of the allowed roles.
 */
export function requireRole(allowedRoles: string[]): MiddlewareHandler {
  return async (c, next) => {
    const userRole = c.get('userRole');
    const userEmail = c.get('userEmail');

    if (!userRole && !userEmail) {
      throw new UnauthorizedError('Authentication required to access this resource.');
    }

    // Super Admin override for kunal@graphomy.com
    if (userEmail === SUPER_ADMIN_EMAIL || userRole === 'super_admin') {
      await next();
      return;
    }

    if (!userRole || !allowedRoles.includes(userRole)) {
      throw new ForbiddenError(
        `Access denied. Requires one of the following roles: [${allowedRoles.join(', ')}]. Your role: '${userRole || 'none'}'.`,
      );
    }

    await next();
  };
}

/**
 * Middleware enforcing specific permission level (FR-003.003 & FR-003.005 / INK-63 & INK-65).
 */
export function requirePermission(permission: string): MiddlewareHandler {
  return async (c, next) => {
    const userRole = c.get('userRole') || 'user';
    const userEmail = c.get('userEmail');

    if (!userEmail) {
      throw new UnauthorizedError('Authentication required to access this resource.');
    }

    // Super Admin override for kunal@graphomy.com
    if (userEmail === SUPER_ADMIN_EMAIL || userRole === 'super_admin') {
      await next();
      return;
    }

    const permitted = hasPermission(userRole, permission);
    if (!permitted) {
      throw new ForbiddenError(`Access denied. Lacks required permission '${permission}'.`);
    }

    await next();
  };
}
