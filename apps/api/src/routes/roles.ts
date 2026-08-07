import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { RbacService } from '../services/rbac-service.js';
import type { AuditService } from '../services/audit-service.js';
import { PrismaAuditService } from '../services/audit-service.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { requirePermission } from '../middleware/rbac-middleware.js';
import type { Env } from '../index.js';

export interface RoleDeps {
  prisma?: PrismaClient;
  audit?: AuditService;
}

export function createRoleRoutes(deps?: RoleDeps) {
  const roles = new Hono<{ Bindings: Env }>();

  function getServices(c: any) {
    let prisma = deps?.prisma;
    if (!prisma) {
      const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL;
      const isValidUrl =
        dbUrl &&
        typeof dbUrl === 'string' &&
        dbUrl.trim() !== '' &&
        (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'));

      if (isValidUrl) {
        prisma = createPrismaClient(dbUrl);
      } else {
        prisma = getLegacyPrisma();
      }
    }
    const audit = deps?.audit || new PrismaAuditService(prisma);
    const rbacService = new RbacService(prisma, audit);
    return { rbacService };
  }

  // GET /api/v1/roles/default (INK-61)
  roles.get('/default', jwtAuth(), requirePermission('roles:read'), async (c) => {
    const { rbacService } = getServices(c);
    const defaultRoles = await rbacService.listDefaultRoles();
    return c.json(defaultRoles, 200);
  });

  // GET /api/v1/roles/permissions (INK-65)
  roles.get('/permissions', jwtAuth(), requirePermission('roles:read'), async (c) => {
    const { rbacService } = getServices(c);
    const permissions = rbacService.getPermissionRegistry();
    return c.json({ permissions }, 200);
  });

  return roles;
}
