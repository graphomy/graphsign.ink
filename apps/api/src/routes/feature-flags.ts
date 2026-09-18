import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { getDbClient } from '../utils/db.js';
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

    const prisma = getDbClient(c, deps?.prisma);
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
