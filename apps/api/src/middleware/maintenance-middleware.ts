import type { MiddlewareHandler } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { getDbClient } from '../utils/db.js';
import { PlatformMaintenanceService } from '../services/maintenance-service.js';

export interface MaintenanceMiddlewareOptions {
  prisma?: PrismaClient;
  maintenanceService?: PlatformMaintenanceService;
}

/**
 * Middleware that guards write operations when platform maintenance is active.
 * Super admin users and administrative endpoints are exempted.
 */
export function maintenanceMiddleware(options?: MaintenanceMiddlewareOptions): MiddlewareHandler {
  return async (c, next) => {
    const path = c.req.path;

    // Exempt admin, health, auth checks, and static routes
    if (
      path.startsWith('/api/v1/admin') ||
      path.startsWith('/api/v1/health') ||
      path === '/api/v1/auth/login' ||
      path === '/api/v1/auth/logout' ||
      path === '/api/v1/auth/me' ||
      path === '/api/v1/feature-flags'
    ) {
      return next();
    }

    let service = options?.maintenanceService;
    if (!service) {
      let prisma = options?.prisma || (c as any).get('prisma');
      if (!prisma) {
        try {
          prisma = getDbClient(c);
        } catch {
          // DB not available
        }
      }
      if (prisma) {
        service = new PlatformMaintenanceService(prisma);
      }
    }

    if (!service) {
      return next();
    }

    try {
      const state = await service.getMaintenanceState();
      if (!state.isActive) {
        return next();
      }

      // Check if user is super_admin
      const userPayload = (c as any).get('userPayload');
      if (userPayload?.role === 'super_admin') {
        c.header('X-Maintenance-Mode', 'superadmin-bypass');
        return next();
      }

      // Read-only operations are permitted with maintenance header
      if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') {
        c.header('X-Maintenance-Mode', 'active');
        return next();
      }

      // State-mutating operations are blocked with 503
      return c.json(
        {
          error: {
            code: 'MAINTENANCE_MODE',
            message:
              state.message ||
              'System maintenance in progress. State-changing actions are temporarily blocked.',
            scope: state.scope,
          },
        },
        503,
      );
    } catch {
      // In case of error querying maintenance, fail open to avoid catastrophic outage
      return next();
    }
  };
}
