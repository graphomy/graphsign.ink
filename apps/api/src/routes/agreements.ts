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
import { saveDocumentFieldsSchema } from '../validators/field-validators.js';
import { BadRequestError, ForbiddenError } from '../utils/errors.js';
import { requirePermission } from '../middleware/rbac-middleware.js';
import { enforceTenantActiveStatus } from '../middleware/tenant-status-middleware.js';
import { createRateLimiter } from '../middleware/rate-limiter.js';
import { isSuperAdmin } from '../config/roles.js';
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

  // GET /api/v1/agreements (List & Search - INK-248 scoped for privacy)
  agreements.get(
    '/',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:read'),
    async (c) => {
      const { service } = getServices(c);
      const userPayload = c.get('userPayload') as any;
      const orgId = userPayload?.orgId || 'default-org-id';
      const userId = userPayload?.sub || 'unknown';
      const userRole = userPayload?.role || 'user';

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

      const result = await service.listAgreements(orgId, parsed.data, userId, userRole);
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
      const userId = userPayload?.sub || 'unknown';
      const userRole = userPayload?.role || 'user';

      const agreement = await service.getAgreementById(orgId, agreementId, userId, userRole);
      return c.json(agreement, 200);
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
      const userRole = userPayload?.role || 'user';

      const body = await c.req.json().catch(() => null);
      const parsed = updateDraftSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(
          parsed.error.errors[0]?.message || 'Invalid draft update payload',
        );
      }

      const updated = await service.saveDraft(orgId, authorId, agreementId, parsed.data, userRole);
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
      const userRole = userPayload?.role || 'user';

      const body = await c.req.json().catch(() => ({}));
      const parsed = activateAgreementSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Invalid activation payload');
      }

      const activated = await service.activateAgreement(
        orgId,
        authorId,
        agreementId,
        parsed.data,
        userRole,
      );
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
      const userId = userPayload?.sub || 'unknown';
      const userRole = userPayload?.role || 'user';

      const history = await service.getAgreementHistory(orgId, agreementId, userId, userRole);
      return c.json(history, 200);
    },
  );

  // GET /api/v1/agreements/:id/file (Stream original PDF / Markdown binary - INK-248 restricted for Super Admin)
  agreements.get(
    '/:id/file',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:read'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const userEmail = userPayload?.email;
      const userRole = userPayload?.role || 'user';
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      // INK-248: Super Admin is restricted to metadata only and cannot access private file contents
      if (isSuperAdmin(userEmail) || userRole === 'super_admin') {
        throw new ForbiddenError(
          'Super Admins are restricted to metadata only and cannot access private file contents.',
        );
      }

      const agreement = await service.getAgreementById(orgId, agreementId, authorId, userRole);
      const meta = (agreement.metadata as Record<string, unknown>) || {};
      const fileData =
        (meta.fileBase64 as string | undefined) || (meta.fileData as string | undefined);

      if (fileData) {
        const base64Content = fileData.includes(',') ? fileData.split(',')[1] : fileData;
        const binaryBuffer = Buffer.from(base64Content || '', 'base64');
        return c.body(binaryBuffer, 200, {
          'Content-Type': agreement.mimeType || 'application/pdf',
          'Content-Disposition': `inline; filename="${agreement.fileName || 'document.pdf'}"`,
        });
      }

      if (agreement.markdownContent) {
        return c.text(agreement.markdownContent, 200, {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `inline; filename="${agreement.fileName || 'agreement.md'}"`,
        });
      }

      // Fallback standard PDF structure if stored without raw binary in metadata
      const fallbackPdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF`;
      return c.body(fallbackPdf, 200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${agreement.fileName || 'document.pdf'}"`,
      });
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
      const userRole = userPayload?.role || 'user';

      const body = await c.req.json().catch(() => ({}));
      const version = await service.createVersion(
        orgId,
        authorId,
        agreementId,
        body?.changeSummary,
        userRole,
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
      const userId = userPayload?.sub || 'unknown';
      const userRole = userPayload?.role || 'user';

      const versions = await service.listVersions(orgId, agreementId, userId, userRole);
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
      const userRole = userPayload?.role || 'user';

      const cloned = await service.cloneAgreement(orgId, authorId, agreementId, userRole);
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
      const userRole = userPayload?.role || 'user';

      const archived = await service.setArchiveStatus(orgId, authorId, agreementId, true, userRole);
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
      const userRole = userPayload?.role || 'user';

      const unarchived = await service.setArchiveStatus(
        orgId,
        authorId,
        agreementId,
        false,
        userRole,
      );
      return c.json(unarchived, 200);
    },
  );

  // DELETE /api/v1/agreements/:id (INK-271 Delete agreement record)
  agreements.delete(
    '/:id',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:delete'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';
      const userRole = userPayload?.role || 'user';

      const deleted = await service.deleteAgreement(orgId, authorId, agreementId, userRole);
      return c.json(deleted, 200);
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
      const userRole = userPayload?.role || 'user';

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
        userRole,
      );
      return c.json(updated, 200);
    },
  );

  // GET /api/v1/agreements/:id/fields (Get document fields & recipients - INK-78 to INK-85)
  agreements.get(
    '/:id/fields',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:read'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const orgId = userPayload?.orgId || 'default-org-id';
      const userId = userPayload?.sub || 'unknown';
      const userRole = userPayload?.role || 'user';

      const result = await service.getAgreementFields(orgId, agreementId, userId, userRole);
      return c.json(result, 200);
    },
  );

  // PUT /api/v1/agreements/:id/fields (Save document fields & recipients - INK-78 to INK-85)
  agreements.put(
    '/:id/fields',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:update'),
    async (c) => {
      const { service } = getServices(c);
      const agreementId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';
      const userRole = userPayload?.role || 'user';

      const body = await c.req.json().catch(() => null);
      const parsed = saveDocumentFieldsSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(
          parsed.error.errors[0]?.message || 'Invalid document fields payload',
        );
      }

      const result = await service.saveAgreementFields(
        orgId,
        authorId,
        agreementId,
        parsed.data,
        userRole,
      );
      return c.json(result, 200);
    },
  );

  return agreements;
}
