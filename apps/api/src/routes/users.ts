import { Hono } from 'hono';
import { z } from 'zod';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { RbacService } from '../services/rbac-service.js';
import type { AuditService } from '../services/audit-service.js';
import { PrismaAuditService } from '../services/audit-service.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { BadRequestError } from '../utils/errors.js';
import type { Env } from '../index.js';

export interface UserDeps {
  prisma?: PrismaClient;
  audit?: AuditService;
}

const updateRoleSchema = z.object({
  role: z.string().min(1, 'Role is required'),
  organisationId: z.string().uuid('Invalid organisation ID').optional(),
});

export function createUserRoutes(deps?: UserDeps) {
  const users = new Hono<{ Bindings: Env }>();

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

  // PUT /api/v1/users/:id/role (INK-62 & INK-64)
  users.put('/:id/role', jwtAuth(), async (c) => {
    const { rbacService } = getServices(c);
    const targetUserId = c.req.param('id');
    const userPayload = c.get('userPayload') as any;
    const actorUserId = userPayload?.sub || 'unknown';
    const actorEmail = userPayload?.email || 'unknown@domain.com';
    const orgId = userPayload?.orgId || 'default-org-id';

    const body = await c.req.json().catch(() => null);
    const parsed = updateRoleSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestError(parsed.error.errors[0]?.message || 'Invalid role update payload');
    }

    const result = await rbacService.assignUserRole({
      actorUserId,
      actorEmail,
      targetUserId,
      orgId: parsed.data.organisationId || orgId,
      newRole: parsed.data.role,
    });

    return c.json(result, 200);
  });

  return users;
}
