import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { PadesSealingService } from '../services/pades-sealing-service.js';
import { KeyCustodyService } from '../services/key-custody-service.js';
import { TsaService } from '../services/tsa-service.js';
import { VerificationService } from '../services/verification-service.js';
import { PrismaAuditService } from '../services/audit-service.js';
import type { AuditService } from '../services/audit-service.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { requirePermission } from '../middleware/rbac-middleware.js';
import {
  sealAgreementSchema,
  batchSealSchema,
} from '../validators/certificate-validators.js';
import { ValidationError, BadRequestError } from '../utils/errors.js';
import type { Env } from '../index.js';

export interface SigningDeps {
  prisma?: PrismaClient;
  audit?: AuditService;
  keyCustody?: KeyCustodyService;
  tsa?: TsaService;
}

export function createSigningRoutes(deps?: SigningDeps) {
  const signing = new Hono<{ Bindings: Env }>();

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
    const keyCustody = deps?.keyCustody || new KeyCustodyService();
    const tsa = deps?.tsa || new TsaService({
      primaryUrl: c.env?.TSA_PRIMARY_URL || process.env.TSA_PRIMARY_URL,
      fallbackUrl: c.env?.TSA_FALLBACK_URL || process.env.TSA_FALLBACK_URL,
      fallback2Url: c.env?.TSA_FALLBACK2_URL || process.env.TSA_FALLBACK2_URL,
    });

    const sealingService = new PadesSealingService(prisma, keyCustody, tsa, audit);
    const verificationService = new VerificationService(prisma);

    return { sealingService, verificationService };
  }

  // POST /api/v1/signing/seal/:agreementId (FR-012.004)
  signing.post('/seal/:agreementId', jwtAuth(), requirePermission('signatures:sign'), async (c) => {
    const { sealingService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const orgId = userPayload?.orgId;
    const userId = userPayload?.sub;
    const agreementId = c.req.param('agreementId');
    const body = await c.req.json().catch(() => ({}));
    const parseResult = sealAgreementSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError(
        parseResult.error.errors.map((e) => e.message).join(', '),
      );
    }

    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip');
    const userAgent = c.req.header('user-agent');

    const result = await sealingService.sealAgreement({
      agreementId,
      organisationId: orgId,
      userId,
      certificateId: parseResult.data.certificateId,
      pdfData: parseResult.data.pdfData,
      ipAddress: ip,
      userAgent,
    });

    return c.json(result, 200);
  });

  // POST /api/v1/signing/batch (FR-012 Stories / INK-132)
  signing.post('/batch', jwtAuth(), requirePermission('signatures:sign'), async (c) => {
    const { sealingService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const orgId = userPayload?.orgId;
    const userId = userPayload?.sub;
    const body = await c.req.json().catch(() => ({}));
    const parseResult = batchSealSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError(
        parseResult.error.errors.map((e) => e.message).join(', '),
      );
    }

    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip');
    const userAgent = c.req.header('user-agent');

    const result = await sealingService.batchSeal(
      orgId,
      userId,
      parseResult.data.agreementIds,
      parseResult.data.certificateId,
      ip,
      userAgent,
    );

    return c.json(result, 200);
  });

  // POST /api/v1/signing/verify (FR-012.005 / INK-130)
  signing.post('/verify', jwtAuth(), async (c) => {
    const { verificationService } = getServices(c);
    const body = await c.req.json().catch(() => ({}));

    if (body.token) {
      const report = await verificationService.verifyByToken(body.token);
      return c.json(report, 200);
    }

    if (body.hash) {
      const report = await verificationService.verifyByHash(body.hash);
      return c.json(report, 200);
    }

    if (body.fileData) {
      const report = await verificationService.verifyUploadedFile(body.fileData);
      return c.json(report, 200);
    }

    throw new BadRequestError('Either token, hash, or fileData must be provided for verification.');
  });

  return signing;
}
