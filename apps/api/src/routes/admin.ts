import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { requireRole } from '../middleware/rbac-middleware.js';
import { createRateLimiter } from '../middleware/rate-limiter.js';
import { PlatformConfigService } from '../services/platform-config-service.js';
import type { AuditService } from '../services/audit-service.js';
import { PrismaAuditService } from '../services/audit-service.js';
import { BadRequestError } from '../utils/errors.js';
import {
  updatePlatformConfigSchema,
  queryAdminUsersSchema,
} from '../validators/admin-validators.js';
import type { Env } from '../index.js';

export interface AdminDeps {
  prisma?: PrismaClient;
  audit?: AuditService;
  configService?: PlatformConfigService;
}

export function createAdminRoutes(deps?: AdminDeps) {
  const admin = new Hono<{ Bindings: Env }>();

  admin.use('/*', createRateLimiter(100, 60_000));

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
    const configService = deps?.configService || new PlatformConfigService(prisma, audit);
    return { prisma, audit, configService };
  }

  // Enforce super_admin role for all /admin routes
  admin.use('/*', jwtAuth(), requireRole(['super_admin']));

  /**
   * GET /api/v1/admin/users
   * Lists all registered users across organisations with metadata:
   * - agreement counts (draft / active / archive)
   * - space utilized & storage quota
   * - last login timestamp
   */
  admin.get('/users', async (c) => {
    const { prisma } = getServices(c);

    const queryParams = {
      page: c.req.query('page'),
      limit: c.req.query('limit'),
      search: c.req.query('search'),
      organisationId: c.req.query('organisationId'),
    };

    const parsed = queryAdminUsersSchema.safeParse(queryParams);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.errors[0]?.message || 'Invalid query parameters');
    }

    const page = parsed.data.page;
    const limit = parsed.data.limit;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };

    if (parsed.data.organisationId) {
      where.organisationId = parsed.data.organisationId;
    }

    if (parsed.data.search) {
      where.OR = [
        { name: { contains: parsed.data.search, mode: 'insensitive' } },
        { email: { contains: parsed.data.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          organisation: { select: { id: true, name: true, slug: true } },
          agreements: {
            where: { deletedAt: null },
            select: { id: true, status: true, isArchived: true, fileSize: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const formattedUsers = users.map((user) => {
      const draftCount = user.agreements.filter(
        (a) => a.status === 'DRAFT' && !a.isArchived,
      ).length;
      const activeCount = user.agreements.filter(
        (a) => a.status !== 'DRAFT' && !a.isArchived,
      ).length;
      const archiveCount = user.agreements.filter((a) => a.isArchived).length;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        timezone: user.timezone,
        organisation: user.organisation,
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
        storageQuotaBytes: (user.storageQuotaBytes ?? 262144000n).toString(),
        storageUsedBytes: (user.storageUsedBytes ?? 0n).toString(),
        agreementsSummary: {
          draft: draftCount,
          active: activeCount,
          archive: archiveCount,
          total: user.agreements.length,
        },
      };
    });

    return c.json(
      {
        items: formattedUsers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      200,
    );
  });

  /**
   * GET /api/v1/admin/platform-config
   * Retrieves all platform configuration limits and defaults.
   */
  admin.get('/platform-config', async (c) => {
    const { configService } = getServices(c);
    const configs = await configService.getAllConfigs();
    return c.json(configs, 200);
  });

  /**
   * PUT /api/v1/admin/platform-config/:key
   * Updates a platform configuration limit (e.g. user_storage_quota_bytes, max_upload_file_size_bytes).
   */
  admin.put('/platform-config/:key', async (c) => {
    const { configService } = getServices(c);
    const key = c.req.param('key');
    const userPayload = c.get('userPayload') as any;
    const actorUserId = userPayload?.sub;

    const body = await c.req.json().catch(() => null);
    const parsed = updatePlatformConfigSchema.safeParse({ key, value: body?.value });

    if (!parsed.success) {
      throw new BadRequestError(parsed.error.errors[0]?.message || 'Invalid config update payload');
    }

    const result = await configService.updateConfig(key, parsed.data.value, actorUserId);
    return c.json(result, 200);
  });

  /**
   * GET /api/v1/admin/stats
   * Overview platform statistics for superadmin dashboard header.
   */
  admin.get('/stats', async (c) => {
    const { prisma } = getServices(c);

    const [totalUsers, totalOrgs, totalAgreements, totalStorage] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.organisation.count({ where: { deletedAt: null } }),
      prisma.agreement.count({ where: { deletedAt: null } }),
      prisma.user.aggregate({
        _sum: { storageUsedBytes: true },
      }),
    ]);

    return c.json(
      {
        totalUsers,
        totalOrgs,
        totalAgreements,
        totalStorageUsedBytes: (totalStorage._sum.storageUsedBytes ?? 0n).toString(),
      },
      200,
    );
  });

  return admin;
}
