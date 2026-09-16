import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { FeatureFlagService } from '../services/feature-flag-service.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import type { Env } from '../index.js';

export interface FeatureFlagRouteDeps {
  prisma?: PrismaClient;
  featureFlagService?: FeatureFlagService;
}

export function createFeatureFlagRoutes(deps?: FeatureFlagRouteDeps) {
  const router = new Hono<{ Bindings: Env }>();

  function getServices(c: any) {
    if (deps?.featureFlagService) {
      return { service: deps.featureFlagService };
    }

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
    const service = new FeatureFlagService(prisma);
    return { service };
  }

  /**
   * GET /api/v1/feature-flags
   * Evaluates and returns active feature flags for the requesting user's organisation context.
   */
  router.get('/', jwtAuth(), async (c) => {
    const { service } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const orgId = userPayload?.orgId || userPayload?.organisationId;

    const flags = await service.evaluateFlagsForTenant(orgId);
    return c.json({ flags }, 200);
  });

  return router;
}
