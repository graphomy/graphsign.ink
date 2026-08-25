import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { SearchService } from '../services/search-service.js';
import type { AuditService } from '../services/audit-service.js';
import { PrismaAuditService } from '../services/audit-service.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { createRateLimiter } from '../middleware/rate-limiter.js';
import { enforceTenantActiveStatus } from '../middleware/tenant-status-middleware.js';
import type { UserContext } from '../services/search-service.js';
import {
  searchAgreementsSchema,
  searchTemplatesSchema,
  globalSearchSchema,
  createFilterPresetSchema,
} from '../validators/search-validators.js';
import type { Env } from '../index.js';

export interface SearchDeps {
  prisma?: PrismaClient;
  audit?: AuditService;
  searchService?: SearchService;
}

export function createSearchRoutes(deps?: SearchDeps) {
  const searchRouter = new Hono<{ Bindings: Env }>();

  searchRouter.use('/*', createRateLimiter(100, 60_000));

  function getServices(c: any) {
    if (deps?.searchService) return { service: deps.searchService };

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
    const service = new SearchService(prisma, audit);
    return { service };
  }

  // Helper to extract UserContext from request
  function getUserContext(c: any): UserContext {
    const userPayload = (c.get('userPayload') || c.get('jwtPayload')) as any;
    return {
      userId: userPayload?.sub || 'unknown',
      userEmail: userPayload?.email || '',
      userName: userPayload?.name || '',
      organisationId: userPayload?.orgId || 'default-org-id',
      role: userPayload?.role || 'user',
      ipAddress:
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
        c.req.header('x-real-ip') ||
        '127.0.0.1',
      userAgent: c.req.header('user-agent'),
    };
  }

  /**
   * GET /api/v1/search/agreements
   * Multi-facet keyword search and filtering for agreements (INK-117, INK-118, INK-119, INK-121, INK-122)
   */
  searchRouter.get('/agreements', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const query = c.req.query();
    const parsed = searchAgreementsSchema.safeParse(query);

    if (!parsed.success) {
      return c.json(
        {
          success: false,
          message: 'Invalid search parameters',
          errors: parsed.error.format(),
        },
        400,
      );
    }

    const { service } = getServices(c);
    const ctx = getUserContext(c);
    const result = await service.searchAgreements(ctx, parsed.data);

    return c.json({
      success: true,
      ...result,
    });
  });

  /**
   * GET /api/v1/search/templates
   * Search templates library (FR-010.008)
   */
  searchRouter.get('/templates', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const query = c.req.query();
    const parsed = searchTemplatesSchema.safeParse(query);

    if (!parsed.success) {
      return c.json(
        {
          success: false,
          message: 'Invalid template search parameters',
          errors: parsed.error.format(),
        },
        400,
      );
    }

    const { service } = getServices(c);
    const ctx = getUserContext(c);
    const result = await service.searchTemplates(ctx, parsed.data);

    return c.json({
      success: true,
      ...result,
    });
  });

  /**
   * GET /api/v1/search/presets
   * List saved search & filter presets for user (INK-120)
   */
  searchRouter.get('/presets', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const entityType = c.req.query('entityType');
    const { service } = getServices(c);
    const ctx = getUserContext(c);
    const presets = await service.listFilterPresets(ctx, entityType);

    return c.json({
      success: true,
      data: presets,
    });
  });

  /**
   * POST /api/v1/search/presets
   * Create custom saved filter preset (INK-120)
   */
  searchRouter.post('/presets', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = createFilterPresetSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          success: false,
          message: 'Validation failed',
          errors: parsed.error.format(),
        },
        400,
      );
    }

    const { service } = getServices(c);
    const ctx = getUserContext(c);
    const preset = await service.createFilterPreset(ctx, parsed.data);

    return c.json(
      {
        success: true,
        message: 'Filter preset saved successfully',
        data: preset,
      },
      201,
    );
  });

  /**
   * DELETE /api/v1/search/presets/:id
   * Delete custom saved filter preset (INK-120)
   */
  searchRouter.delete('/presets/:id', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const presetId = c.req.param('id');
    const { service } = getServices(c);
    const ctx = getUserContext(c);
    const result = await service.deleteFilterPreset(ctx, presetId);

    return c.json({
      success: true,
      message: result.message,
    });
  });

  /**
   * PATCH /api/v1/search/presets/:id/default
   * Set filter preset as default (INK-120)
   */
  searchRouter.patch('/presets/:id/default', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const presetId = c.req.param('id');
    const { service } = getServices(c);
    const ctx = getUserContext(c);
    const updated = await service.setDefaultFilterPreset(ctx, presetId);

    return c.json({
      success: true,
      message: 'Default filter preset updated',
      data: updated,
    });
  });

  /**
   * GET /api/v1/search
   * Unified global multi-entity search (INK-117, INK-122)
   */
  searchRouter.get('/', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const query = c.req.query();
    const parsed = globalSearchSchema.safeParse(query);

    if (!parsed.success) {
      return c.json(
        {
          success: false,
          message: 'Invalid global search parameters',
          errors: parsed.error.format(),
        },
        400,
      );
    }

    const { service } = getServices(c);
    const ctx = getUserContext(c);
    const result = await service.searchGlobal(ctx, parsed.data);

    return c.json({
      success: true,
      ...result,
    });
  });

  return searchRouter;
}
