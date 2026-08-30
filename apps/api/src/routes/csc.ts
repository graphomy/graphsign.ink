import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { CscService } from '../services/csc-service.js';
import { KeyCustodyService } from '../services/key-custody-service.js';
import { TsaService } from '../services/tsa-service.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { requirePermission } from '../middleware/rbac-middleware.js';
import type { Env } from '../index.js';

export interface CscDeps {
  prisma?: PrismaClient;
  keyCustody?: KeyCustodyService;
  tsa?: TsaService;
}

export function createCscRoutes(deps?: CscDeps) {
  const csc = new Hono<{ Bindings: Env }>();

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

    const keyCustody = deps?.keyCustody || new KeyCustodyService();
    const tsa =
      deps?.tsa ||
      new TsaService({
        primaryUrl: c.env?.TSA_PRIMARY_URL || process.env.TSA_PRIMARY_URL,
        fallbackUrl: c.env?.TSA_FALLBACK_URL || process.env.TSA_FALLBACK_URL,
        fallback2Url: c.env?.TSA_FALLBACK2_URL || process.env.TSA_FALLBACK2_URL,
      });

    const cscService = new CscService(prisma, keyCustody, tsa);
    return { cscService };
  }

  // POST /csc/v2/info (CSC §8.1)
  csc.post('/info', async (c) => {
    const { cscService } = getServices(c);
    const info = await cscService.getInfo();
    return c.json(info, 200);
  });

  // POST /csc/v2/credentials/list (CSC §11.4)
  csc.post('/credentials/list', jwtAuth(), requirePermission('certificates:read'), async (c) => {
    const { cscService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const orgId = userPayload?.orgId;
    const body = await c.req.json().catch(() => ({}));
    const result = await cscService.listCredentials(orgId, body);
    return c.json(result, 200);
  });

  // POST /csc/v2/credentials/info (CSC §11.5)
  csc.post('/credentials/info', jwtAuth(), requirePermission('certificates:read'), async (c) => {
    const { cscService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const orgId = userPayload?.orgId;
    const body = await c.req.json().catch(() => ({}));
    const result = await cscService.getCredentialInfo(orgId, body);
    return c.json(result, 200);
  });

  // POST /csc/v2/credentials/authorize (CSC §11.6)
  csc.post('/credentials/authorize', jwtAuth(), requirePermission('signatures:sign'), async (c) => {
    const { cscService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const orgId = userPayload?.orgId;
    const body = await c.req.json().catch(() => ({}));
    const result = await cscService.authorizeCredential(orgId, body);
    return c.json(result, 200);
  });

  // POST /csc/v2/signatures/signHash (CSC §11.9)
  csc.post('/signatures/signHash', jwtAuth(), requirePermission('signatures:sign'), async (c) => {
    const { cscService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const orgId = userPayload?.orgId;
    const body = await c.req.json().catch(() => ({}));
    const result = await cscService.signHash(orgId, body);
    return c.json(result, 200);
  });

  // POST /csc/v2/signatures/timestamp (CSC §11.10)
  csc.post('/signatures/timestamp', async (c) => {
    const { cscService } = getServices(c);
    const body = await c.req.json().catch(() => ({}));
    const result = await cscService.timestamp(body);
    return c.json(result, 200);
  });

  return csc;
}
