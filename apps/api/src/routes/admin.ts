import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { requireRole } from '../middleware/rbac-middleware.js';
import { createRateLimiter } from '../middleware/rate-limiter.js';
import { PlatformConfigService } from '../services/platform-config-service.js';
import { PlatformHealthService } from '../services/health-service.js';
import { PlatformMaintenanceService } from '../services/maintenance-service.js';
import { FeatureFlagService } from '../services/feature-flag-service.js';
import type { AuditService } from '../services/audit-service.js';
import { PrismaAuditService } from '../services/audit-service.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import {
  updatePlatformConfigSchema,
  queryAdminUsersSchema,
  queryAdminOrganisationsSchema,
  overrideOrganisationLimitsSchema,
  createFeatureFlagSchema,
  updateFeatureFlagSchema,
  setTenantFeatureFlagOverrideSchema,
  setMaintenanceModeSchema,
} from '../validators/admin-validators.js';
import type { Env } from '../index.js';

export interface AdminDeps {
  prisma?: PrismaClient;
  audit?: AuditService;
  configService?: PlatformConfigService;
  healthService?: PlatformHealthService;
  maintenanceService?: PlatformMaintenanceService;
  featureFlagService?: FeatureFlagService;
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
    const healthService = deps?.healthService || new PlatformHealthService(prisma);
    const maintenanceService = deps?.maintenanceService || new PlatformMaintenanceService(prisma, audit);
    const featureFlagService = deps?.featureFlagService || new FeatureFlagService(prisma, audit);

    return { prisma, audit, configService, healthService, maintenanceService, featureFlagService };
  }

  // Enforce super_admin role for all /admin routes
  admin.use('/*', jwtAuth(), requireRole(['super_admin']));

  /**
   * GET /api/v1/admin/health (FR-015.001)
   * Real-time operational platform health check with DB latency and memory telemetry.
   */
  admin.get('/health', async (c) => {
    const { healthService } = getServices(c);
    const health = await healthService.checkHealth();
    return c.json(health, 200);
  });

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
      throw new BadRequestError(parsed.error.issues[0]?.message || 'Invalid query parameters');
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
   * GET /api/v1/admin/organisations (FR-015.002)
   * Lists all workspace tenants with plan, status, storage, member count, and document quota.
   */
  admin.get('/organisations', async (c) => {
    const { prisma } = getServices(c);

    const queryParams = {
      page: c.req.query('page'),
      limit: c.req.query('limit'),
      search: c.req.query('search'),
      planType: c.req.query('planType'),
      status: c.req.query('status'),
    };

    const parsed = queryAdminOrganisationsSchema.safeParse(queryParams);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0]?.message || 'Invalid query parameters');
    }

    const page = parsed.data.page;
    const limit = parsed.data.limit;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };

    if (parsed.data.planType) {
      where.planType = parsed.data.planType;
    }

    if (parsed.data.status) {
      where.status = parsed.data.status;
    }

    if (parsed.data.search) {
      where.OR = [
        { name: { contains: parsed.data.search, mode: 'insensitive' } },
        { slug: { contains: parsed.data.search, mode: 'insensitive' } },
      ];
    }

    const [orgs, total] = await Promise.all([
      prisma.organisation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              users: { where: { deletedAt: null } },
              agreements: { where: { deletedAt: null } },
            },
          },
        },
      }),
      prisma.organisation.count({ where }),
    ]);

    const formattedOrgs = orgs.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      planType: org.planType,
      storageQuotaBytes: org.storageQuotaBytes ? org.storageQuotaBytes.toString() : '0',
      storageUsedBytes: org.storageUsedBytes ? org.storageUsedBytes.toString() : '0',
      maxDocuments: org.maxDocuments,
      documentCount: org.documentCount,
      maxUsers: org.maxUsers,
      activeUsersCount: org._count.users,
      totalAgreements: org._count.agreements,
      sessionTimeoutMinutes: org.sessionTimeoutMinutes,
      mfaRequired: org.mfaRequired,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    }));

    return c.json(
      {
        items: formattedOrgs,
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
   * GET /api/v1/admin/organisations/:id (FR-015.002)
   * Inspect a single workspace tenant.
   */
  admin.get('/organisations/:id', async (c) => {
    const { prisma } = getServices(c);
    const orgId = c.req.param('id');

    const org = await prisma.organisation.findUnique({
      where: { id: orgId },
      include: {
        _count: {
          select: {
            users: { where: { deletedAt: null } },
            agreements: { where: { deletedAt: null } },
            domains: true,
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundError(`Organisation '${orgId}' not found.`);
    }

    return c.json(
      {
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        planType: org.planType,
        storageQuotaBytes: org.storageQuotaBytes.toString(),
        storageUsedBytes: org.storageUsedBytes.toString(),
        maxDocuments: org.maxDocuments,
        documentCount: org.documentCount,
        maxUsers: org.maxUsers,
        activeUsersCount: org._count.users,
        totalAgreements: org._count.agreements,
        domainsCount: org._count.domains,
        sessionTimeoutMinutes: org.sessionTimeoutMinutes,
        mfaRequired: org.mfaRequired,
        createdAt: org.createdAt.toISOString(),
        updatedAt: org.updatedAt.toISOString(),
      },
      200,
    );
  });

  /**
   * POST /api/v1/admin/organisations/:id/override (FR-015.009)
   * Super Admin override of workspace limits, quota, or tier with audit logging.
   */
  admin.post('/organisations/:id/override', async (c) => {
    const { prisma, audit } = getServices(c);
    const orgId = c.req.param('id');
    const userPayload = c.get('userPayload') as any;
    const actorUserId = userPayload?.sub;

    const body = await c.req.json().catch(() => null);
    const parsed = overrideOrganisationLimitsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0]?.message || 'Invalid override payload');
    }

    const org = await prisma.organisation.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundError(`Organisation '${orgId}' not found.`);
    }

    const updateData: any = {};
    const changes: Record<string, any> = {};

    if (parsed.data.storageQuotaBytes) {
      const newQuota = BigInt(parsed.data.storageQuotaBytes);
      updateData.storageQuotaBytes = newQuota;
      changes.storageQuotaBytes = {
        from: org.storageQuotaBytes.toString(),
        to: newQuota.toString(),
      };
    }

    if (parsed.data.maxDocuments !== undefined) {
      updateData.maxDocuments = parsed.data.maxDocuments;
      changes.maxDocuments = { from: org.maxDocuments, to: parsed.data.maxDocuments };
    }

    if (parsed.data.maxUsers !== undefined) {
      updateData.maxUsers = parsed.data.maxUsers;
      changes.maxUsers = { from: org.maxUsers, to: parsed.data.maxUsers };
    }

    if (parsed.data.planType !== undefined) {
      updateData.planType = parsed.data.planType;
      changes.planType = { from: org.planType, to: parsed.data.planType };
    }

    const updated = await prisma.organisation.update({
      where: { id: orgId },
      data: updateData,
    });

    await audit.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'SUPER_ADMIN_ORGANISATION_LIMITS_OVERRIDE',
      resourceType: 'Organisation',
      resourceId: orgId,
      metadata: {
        reason: parsed.data.reason,
        changes,
      },
    });

    return c.json(
      {
        message: `Limits for organisation '${org.name}' overridden successfully.`,
        organisation: {
          id: updated.id,
          name: updated.name,
          planType: updated.planType,
          storageQuotaBytes: updated.storageQuotaBytes ? updated.storageQuotaBytes.toString() : '0',
          maxDocuments: updated.maxDocuments,
          maxUsers: updated.maxUsers,
        },
      },
      200,
    );
  });

  /**
   * POST /api/v1/admin/organisations/:id/suspend (FR-015.008)
   * Suspend an abusive or non-compliant tenant.
   */
  admin.post('/organisations/:id/suspend', async (c) => {
    const { prisma, audit } = getServices(c);
    const orgId = c.req.param('id');
    const userPayload = c.get('userPayload') as any;
    const actorUserId = userPayload?.sub;

    const org = await prisma.organisation.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundError(`Organisation '${orgId}' not found.`);
    }

    const updated = await prisma.organisation.update({
      where: { id: orgId },
      data: { status: 'suspended' },
    });

    await audit.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'SUPER_ADMIN_TENANT_SUSPENDED',
      resourceType: 'Organisation',
      resourceId: orgId,
      metadata: { previousStatus: org.status },
    });

    return c.json(
      {
        message: `Organisation '${org.name}' has been suspended.`,
        status: updated.status,
      },
      200,
    );
  });

  /**
   * POST /api/v1/admin/organisations/:id/restore (FR-015.008)
   * Restore a suspended tenant to active status.
   */
  admin.post('/organisations/:id/restore', async (c) => {
    const { prisma, audit } = getServices(c);
    const orgId = c.req.param('id');
    const userPayload = c.get('userPayload') as any;
    const actorUserId = userPayload?.sub;

    const org = await prisma.organisation.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundError(`Organisation '${orgId}' not found.`);
    }

    const updated = await prisma.organisation.update({
      where: { id: orgId },
      data: { status: 'active' },
    });

    await audit.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'SUPER_ADMIN_TENANT_RESTORED',
      resourceType: 'Organisation',
      resourceId: orgId,
      metadata: { previousStatus: org.status },
    });

    return c.json(
      {
        message: `Organisation '${org.name}' has been restored to active status.`,
        status: updated.status,
      },
      200,
    );
  });

  /**
   * GET /api/v1/admin/maintenance (FR-015.005 / .006)
   * Retrieves active maintenance mode status and notice banner text.
   */
  admin.get('/maintenance', async (c) => {
    const { maintenanceService } = getServices(c);
    const state = await maintenanceService.getMaintenanceState();
    return c.json(state, 200);
  });

  /**
   * POST /api/v1/admin/maintenance (FR-015.005 / .006)
   * Enable or disable platform maintenance mode.
   */
  admin.post('/maintenance', async (c) => {
    const { maintenanceService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const actorUserId = userPayload?.sub;

    const body = await c.req.json().catch(() => null);
    const parsed = setMaintenanceModeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0]?.message || 'Invalid maintenance payload');
    }

    const state = await maintenanceService.setMaintenanceState(parsed.data, actorUserId);
    return c.json(state, 200);
  });

  /**
   * GET /api/v1/admin/feature-flags (FR-015.007)
   * Lists all feature flags.
   */
  admin.get('/feature-flags', async (c) => {
    const { featureFlagService } = getServices(c);
    const flags = await featureFlagService.listFlags();
    return c.json({ flags }, 200);
  });

  /**
   * POST /api/v1/admin/feature-flags (FR-015.007)
   * Creates a new feature flag.
   */
  admin.post('/feature-flags', async (c) => {
    const { featureFlagService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const actorUserId = userPayload?.sub;

    const body = await c.req.json().catch(() => null);
    const parsed = createFeatureFlagSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0]?.message || 'Invalid feature flag payload');
    }

    const flag = await featureFlagService.createFlag(parsed.data, actorUserId);
    return c.json(flag, 201);
  });

  /**
   * PATCH /api/v1/admin/feature-flags/:key (FR-015.007)
   * Updates an existing feature flag.
   */
  admin.patch('/feature-flags/:key', async (c) => {
    const { featureFlagService } = getServices(c);
    const key = c.req.param('key');
    const userPayload = c.get('userPayload') as any;
    const actorUserId = userPayload?.sub;

    const body = await c.req.json().catch(() => null);
    const parsed = updateFeatureFlagSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0]?.message || 'Invalid update payload');
    }

    const flag = await featureFlagService.updateFlag(key, parsed.data, actorUserId);
    return c.json(flag, 200);
  });

  /**
   * DELETE /api/v1/admin/feature-flags/:key (FR-015.007)
   * Deletes a feature flag.
   */
  admin.delete('/feature-flags/:key', async (c) => {
    const { featureFlagService } = getServices(c);
    const key = c.req.param('key');
    const userPayload = c.get('userPayload') as any;
    const actorUserId = userPayload?.sub;

    await featureFlagService.deleteFlag(key, actorUserId);
    return c.json({ message: `Feature flag '${key}' deleted.` }, 200);
  });

  /**
   * POST /api/v1/admin/feature-flags/:key/override (FR-015.007)
   * Sets or clears a tenant override for a feature flag.
   */
  admin.post('/feature-flags/:key/override', async (c) => {
    const { featureFlagService } = getServices(c);
    const key = c.req.param('key');
    const userPayload = c.get('userPayload') as any;
    const actorUserId = userPayload?.sub;

    const body = await c.req.json().catch(() => null);
    const parsed = setTenantFeatureFlagOverrideSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.issues[0]?.message || 'Invalid override payload');
    }

    const flag = await featureFlagService.setTenantOverride(
      key,
      parsed.data.organisationId,
      parsed.data.isEnabled,
      actorUserId,
    );
    return c.json(flag, 200);
  });

  /**
   * GET /api/v1/admin/audit-logs (FR-015.010)
   * Privileged super admin audit trail query.
   */
  admin.get('/audit-logs', async (c) => {
    const { prisma } = getServices(c);
    const page = Math.max(1, Number(c.req.query('page') || '1'));
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || '20')));
    const skip = (page - 1) * limit;
    const action = c.req.query('action');
    const search = c.req.query('search');

    const where: any = {};
    if (action) {
      where.action = { contains: action, mode: 'insensitive' };
    }
    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { resourceType: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          organisation: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return c.json(
      {
        items: logs.map((l) => ({
          id: l.id,
          action: l.action,
          resourceType: l.resourceType,
          resourceId: l.resourceId,
          metadata: l.metadata,
          ipAddress: l.ipAddress,
          createdAt: l.createdAt.toISOString(),
          user: l.user,
          organisation: l.organisation,
        })),
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
      throw new BadRequestError(parsed.error.issues[0]?.message || 'Invalid config update payload');
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
