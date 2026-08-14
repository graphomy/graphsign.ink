import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { AgreementService } from '../services/agreement-service.js';
import type { AuditService } from '../services/audit-service.js';
import { PrismaAuditService } from '../services/audit-service.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import {
  createUploadAgreementSchema,
  createScratchAgreementSchema,
  updateDraftSchema,
  activateAgreementSchema,
  updateMetadataTagsSchema,
  queryAgreementsSchema,
} from '../validators/agreement-validators.js';
import { BadRequestError } from '../utils/errors.js';
import { requirePermission } from '../middleware/rbac-middleware.js';
import { enforceTenantActiveStatus } from '../middleware/tenant-status-middleware.js';
import { createRateLimiter } from '../middleware/rate-limiter.js';
import type { Env } from '../index.js';

export interface AgreementDeps {
  prisma?: PrismaClient;
  audit?: AuditService;
  agreementService?: AgreementService;
}

export function createAgreementRoutes(deps?: AgreementDeps) {
  const agreements = new Hono<{ Bindings: Env }>();

  agreements.use('/*', createRateLimiter(100, 60_000));

  function getServices(c: any) {
    if (deps?.agreementService) return { service: deps.agreementService };

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
    const service = new AgreementService(prisma, audit);
    return { service };
  }

  // GET /api/v1/agreements (List & Search)
  agreements.get(
    '/',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:read'),
    async (c) => {
      const { service } = getServices(c);
      const userPayload = c.get('userPayload') as any;
      const orgId = userPayload?.orgId || 'default-org-id';

      const queryParams = {
        page: c.req.query('page'),
        limit: c.req.query('limit'),
        status: c.req.query('status'),
        isArchived: c.req.query('isArchived'),
        tag: c.req.query('tag'),
        search: c.req.query('search'),
      };

      const parsed = queryAgreementsSchema.safeParse(queryParams);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Invalid query parameters');
      }

      const result = await service.listAgreements(orgId, parsed.data);
      return c.json(result, 200);
    },
  );

  // POST /api/v1/agreements/upload (INK-66 Upload PDF/DOCX/MD)
  agreements.post(
    '/upload',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:create'),
    async (c) => {
      const { service } = getServices(c);
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const body = await c.req.json().catch(() => null);
      const parsed = createUploadAgreementSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Invalid upload payload');
      }

      const agreement = await service.uploadAgreementFile(orgId, authorId, parsed.data);
      return c.json(agreement, 201);
    },
  );

  // POST /api/v1/agreements/scratch (INK-67 Create from scratch Markdown)
  agreements.post(
    '/scratch',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:create'),
    async (c) => {
      const { service } = getServices(c);
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const body = await c.req.json().catch(() => null);
      const parsed = createScratchAgreementSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(
          parsed.error.errors[0]?.message || 'Invalid scratch creation payload',
        );
      }

      const agreement = await service.createFromScratch(orgId, authorId, parsed.data);
      return c.json(agreement, 201);
    },
  );

  // GET /api/v1/agreements/:id (Get single agreement details)
  agreements.get(
    '/:id',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:read'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const orgId = userPayload?.orgId || 'default-org-id';

      const agreement = await service.getAgreementById(orgId, agreementId);
      return c.json(agreement, 200);
    },
  );

  // GET /api/v1/agreements/:id/file (Serve original PDF or markdown document)
  agreements.get(
    '/:id/file',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:read'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const orgId = userPayload?.orgId || 'default-org-id';

      const agreement = await service.getAgreementById(orgId, agreementId);
      const meta = (agreement.metadata as Record<string, any>) || {};
      const fileData = meta.fileData || meta.fileBase64;

      if (fileData && typeof fileData === 'string') {
        let mimeType = agreement.mimeType || 'application/pdf';
        let base64Content = fileData;

        if (fileData.startsWith('data:')) {
          const commaIdx = fileData.indexOf(',');
          if (commaIdx !== -1) {
            const mimeMatch = fileData.substring(0, commaIdx).match(/^data:([^;]+)/);
            if (mimeMatch && mimeMatch[1]) {
              mimeType = mimeMatch[1];
            }
            base64Content = fileData.substring(commaIdx + 1);
          }
        }

        const buffer = Buffer.from(base64Content, 'base64');
        const fileName = agreement.fileName || `${agreement.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;

        return new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
            'Content-Length': buffer.length.toString(),
            'Cache-Control': 'private, max-age=3600',
          },
        });
      }

      if (agreement.markdownContent) {
        return new Response(agreement.markdownContent, {
          status: 200,
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Content-Disposition': `inline; filename="${encodeURIComponent(agreement.fileName || `${agreement.title}.md`)}"`,
          },
        });
      }

      return c.json({ error: { message: 'Original file content not available.' } }, 404);
    },
  );

  // PATCH /api/v1/agreements/:id/draft (INK-68 Save draft & autosave, bump minor version)
  agreements.patch(
    '/:id/draft',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:update'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const body = await c.req.json().catch(() => null);
      const parsed = updateDraftSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(
          parsed.error.errors[0]?.message || 'Invalid draft update payload',
        );
      }

      const updated = await service.saveDraft(orgId, authorId, agreementId, parsed.data);
      return c.json(updated, 200);
    },
  );

  // POST /api/v1/agreements/:id/activate (Move draft to ACTIVE and bump to major version)
  agreements.post(
    '/:id/activate',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:update'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const body = await c.req.json().catch(() => ({}));
      const parsed = activateAgreementSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Invalid activation payload');
      }

      const activated = await service.activateAgreement(orgId, authorId, agreementId, parsed.data);
      return c.json(activated, 200);
    },
  );

  // GET /api/v1/agreements/:id/history (Get concise audit history timeline)
  agreements.get(
    '/:id/history',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:read'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const orgId = userPayload?.orgId || 'default-org-id';

      const history = await service.getAgreementHistory(orgId, agreementId);
      return c.json(history, 200);
    },
  );

  // POST /api/v1/agreements/:id/versions (INK-69 Create version)
  agreements.post(
    '/:id/versions',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:update'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const body = await c.req.json().catch(() => ({}));
      const version = await service.createVersion(
        orgId,
        authorId,
        agreementId,
        body?.changeSummary,
      );
      return c.json(version, 201);
    },
  );

  // GET /api/v1/agreements/:id/versions (INK-69 List versions)
  agreements.get(
    '/:id/versions',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:read'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const orgId = userPayload?.orgId || 'default-org-id';

      const versions = await service.listVersions(orgId, agreementId);
      return c.json(versions, 200);
    },
  );

  // POST /api/v1/agreements/:id/clone (INK-70 Clone agreement)
  agreements.post(
    '/:id/clone',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:create'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const cloned = await service.cloneAgreement(orgId, authorId, agreementId);
      return c.json(cloned, 201);
    },
  );

  // POST /api/v1/agreements/:id/archive & unarchive (INK-71)
  agreements.post(
    '/:id/archive',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:update'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const archived = await service.setArchiveStatus(orgId, authorId, agreementId, true);
      return c.json(archived, 200);
    },
  );

  agreements.post(
    '/:id/unarchive',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:update'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const unarchived = await service.setArchiveStatus(orgId, authorId, agreementId, false);
      return c.json(unarchived, 200);
    },
  );

  // PATCH /api/v1/agreements/:id/metadata (INK-72 Metadata & tags)
  agreements.patch(
    '/:id/metadata',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:update'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const body = await c.req.json().catch(() => null);
      const parsed = updateMetadataTagsSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Invalid metadata payload');
      }

      const updated = await service.updateMetadataAndTags(
        orgId,
        authorId,
        agreementId,
        parsed.data,
      );
      return c.json(updated, 200);
    },
  );

  return agreements;
}
