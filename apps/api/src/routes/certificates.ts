import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { CertificateService } from '../services/certificate-service.js';
import { KeyCustodyService } from '../services/key-custody-service.js';
import { PrismaAuditService } from '../services/audit-service.js';
import type { AuditService } from '../services/audit-service.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { requirePermission } from '../middleware/rbac-middleware.js';
import {
  generateSelfSignedSchema,
  uploadByoCertificateSchema,
} from '../validators/certificate-validators.js';
import { ValidationError } from '../utils/errors.js';
import type { Env } from '../index.js';

export interface CertificateDeps {
  prisma?: PrismaClient;
  audit?: AuditService;
  keyCustody?: KeyCustodyService;
}

export function createCertificateRoutes(deps?: CertificateDeps) {
  const certs = new Hono<{ Bindings: Env }>();

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
    const certService = new CertificateService(prisma, keyCustody, audit);
    return { prisma, certService };
  }

  async function resolveOrg(prisma: PrismaClient, userPayload: any): Promise<string> {
    if (userPayload?.orgId) return userPayload.orgId;
    if (userPayload?.organisationId) return userPayload.organisationId;
    if (userPayload?.sub) {
      const user = await prisma.user.findUnique({
        where: { id: userPayload.sub },
        select: { organisationId: true },
      });
      if (user?.organisationId) return user.organisationId;
    }
    const firstOrg = await prisma.organisation.findFirst({ select: { id: true } });
    return firstOrg?.id || 'default-org-id';
  }

  // GET /api/v1/certificates (FR-012.001, FR-012.002)
  certs.get('/', jwtAuth(), requirePermission('certificates:read'), async (c) => {
    const { prisma, certService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const orgId = await resolveOrg(prisma, userPayload);
    const list = await certService.listCertificates(orgId);
    return c.json(list, 200);
  });

  // GET /api/v1/certificates/default
  certs.get('/default', jwtAuth(), requirePermission('certificates:read'), async (c) => {
    const { prisma, certService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const orgId = await resolveOrg(prisma, userPayload);
    const userId = userPayload?.sub || 'system';
    const cert = await certService.getOrCreateDefaultCertificate(orgId, userId);
    return c.json(cert, 200);
  });

  // POST /api/v1/certificates/generate (FR-012.002)
  certs.post('/generate', jwtAuth(), requirePermission('certificates:manage'), async (c) => {
    const { prisma, certService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const orgId = await resolveOrg(prisma, userPayload);
    const userId = userPayload?.sub || 'system';
    const body = await c.req.json().catch(() => ({}));
    const parseResult = generateSelfSignedSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError(
        parseResult.error.errors.map((e) => e.message).join(', '),
      );
    }

    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip');
    const userAgent = c.req.header('user-agent');

    const result = await certService.generateSelfSigned(
      orgId,
      userId,
      parseResult.data,
      ip,
      userAgent,
    );

    return c.json(result, 201);
  });

  // POST /api/v1/certificates/upload (FR-012.001)
  certs.post('/upload', jwtAuth(), requirePermission('certificates:manage'), async (c) => {
    const { prisma, certService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const orgId = await resolveOrg(prisma, userPayload);
    const userId = userPayload?.sub || 'system';
    const body = await c.req.json().catch(() => ({}));
    const parseResult = uploadByoCertificateSchema.safeParse(body);

    if (!parseResult.success) {
      throw new ValidationError(
        parseResult.error.errors.map((e) => e.message).join(', '),
      );
    }

    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip');
    const userAgent = c.req.header('user-agent');

    const cert = await certService.uploadByoCertificate(
      orgId,
      userId,
      parseResult.data,
      ip,
      userAgent,
    );

    return c.json(cert, 201);
  });

  // GET /api/v1/certificates/:id
  certs.get('/:id', jwtAuth(), requirePermission('certificates:read'), async (c) => {
    const { certService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const orgId = userPayload?.orgId;
    const certId = c.req.param('id');
    const cert = await certService.getCertificate(orgId, certId);
    return c.json(cert, 200);
  });

  // PUT /api/v1/certificates/:id/default
  certs.put('/:id/default', jwtAuth(), requirePermission('certificates:manage'), async (c) => {
    const { certService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const orgId = userPayload?.orgId;
    const userId = userPayload?.sub;
    const certId = c.req.param('id');
    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip');
    const userAgent = c.req.header('user-agent');

    const cert = await certService.setDefaultCertificate(
      orgId,
      userId,
      certId,
      ip,
      userAgent,
    );

    return c.json(cert, 200);
  });

  // DELETE /api/v1/certificates/:id
  certs.delete('/:id', jwtAuth(), requirePermission('certificates:manage'), async (c) => {
    const { certService } = getServices(c);
    const userPayload = c.get('userPayload') as any;
    const orgId = userPayload?.orgId;
    const userId = userPayload?.sub;
    const certId = c.req.param('id');
    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip');
    const userAgent = c.req.header('user-agent');

    const result = await certService.deleteCertificate(
      orgId,
      userId,
      certId,
      ip,
      userAgent,
    );

    return c.json(result, 200);
  });

  return certs;
}
