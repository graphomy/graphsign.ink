import type { MiddlewareHandler } from 'hono';
import { isSuperAdmin } from '../config/roles.js';
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
    const userPayload = (c.get('userPayload') as any) ?? {};
    const userRole = c.get('userRole') || userPayload.role;
    const userEmail = c.get('userEmail') || userPayload.email;

    if (!userRole && !userEmail) {
      throw new UnauthorizedError('Authentication required to access this resource.');
    }

    // Super Admin override — strictly email-only, never trust role claim alone
    if (isSuperAdmin(userEmail)) {
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
    const userPayload = (c.get('userPayload') as any) ?? {};
    const userRole = c.get('userRole') || userPayload.role || 'user';
    const userEmail = c.get('userEmail') || userPayload.email;

    if (!userEmail) {
      throw new UnauthorizedError('Authentication required to access this resource.');
    }

    // Super Admin override — strictly email-only, never trust role claim alone
    if (isSuperAdmin(userEmail)) {
      await next();
      return;
    }

    let permitted = hasPermission(userRole, permission);

    // Organisation Admin override for organisation-scoped management permissions
    if (
      !permitted &&
      (userRole === 'org_admin' || userRole === 'admin' || userRole === 'super_admin')
    ) {
      permitted = true;
    }

    // Default permission allowances for active organisation members
    const allowedStandardPermissions = [
      'documents:read',
      'documents:create',
      'documents:update',
      'templates:read',
      'templates:manage',
      'agreements:send',
      'teams:manage',
    ];
    if (!permitted && allowedStandardPermissions.includes(permission) && userEmail) {
      permitted = true;
    }

    if (!permitted) {
      throw new ForbiddenError(`Access denied. Lacks required permission '${permission}'.`);
    }

    await next();
  };
}
