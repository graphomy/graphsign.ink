import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { TsaTrustService } from '../services/tsa-trust-service.js';
import { TsaService } from '../services/tsa-service.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { requirePermission } from '../middleware/rbac-middleware.js';
import { addTrustEntrySchema } from '../validators/certificate-validators.js';
import { ValidationError } from '../utils/errors.js';
import type { Env } from '../index.js';

export interface TrustStoreDeps {
  prisma?: PrismaClient;
  tsa?: TsaService;
}

export function createTrustStoreRoutes(deps?: TrustStoreDeps) {
  const trustStore = new Hono<{ Bindings: Env }>();

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

    const tsa = deps?.tsa || new TsaService({
      primaryUrl: c.env?.TSA_PRIMARY_URL || process.env.TSA_PRIMARY_URL,
      fallbackUrl: c.env?.TSA_FALLBACK_URL || process.env.TSA_FALLBACK_URL,
      fallback2Url: c.env?.TSA_FALLBACK2_URL || process.env.TSA_FALLBACK2_URL,
    });

    const trustService = new TsaTrustService(prisma, tsa);
    return { trustService };
  }

  // GET /api/v1/admin/trust-store
  trustStore.get('/', jwtAuth(), requirePermission('compliance:manage'), async (c) => {
    const { trustService } = getServices(c);
    const list = await trustService.listTrustEntries();
    return c.json(list, 200);
  });

  // POST /api/v1/admin/trust-store/refresh
  trustStore.post('/refresh', jwtAuth(), requirePermission('compliance:manage'), async (c) => {
    const { trustService } = getServices(c);
    const results = await trustService.healthCheckAll();
    return c.json(results, 200);
  });

  // POST /api/v1/admin/trust-store/custom
  trustStore.post('/custom', jwtAuth(), requirePermission('compliance:manage'), async (c) => {
    const { trustService } = getServices(c);
    const body = await c.req.json().catch(() => ({}));
    const parseResult = addTrustEntrySchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError(
        parseResult.error.errors.map((e) => e.message).join(', '),
      );
    }

    const entry = await trustService.addCustomTrustEntry(parseResult.data);
    return c.json(entry, 201);
  });

  // PATCH /api/v1/admin/trust-store/:id/toggle
  trustStore.patch('/:id/toggle', jwtAuth(), requirePermission('compliance:manage'), async (c) => {
    const { trustService } = getServices(c);
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const isActive = body.isActive !== false;

    const entry = await trustService.toggleTrustEntry(id, isActive);
    return c.json(entry, 200);
  });

  return trustStore;
}
