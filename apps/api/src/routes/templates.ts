import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { TemplateService } from '../services/template-service.js';
import type { AuditService } from '../services/audit-service.js';
import { PrismaAuditService } from '../services/audit-service.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { enforceTenantActiveStatus } from '../middleware/tenant-status-middleware.js';
import { requirePermission } from '../middleware/rbac-middleware.js';
import { createRateLimiter } from '../middleware/rate-limiter.js';
import {
  createTemplateSchema,
  convertAgreementToTemplateSchema,
  updateTemplateDraftSchema,
  createTemplateVersionSchema,
  shareTemplateSchema,
  publishTemplateSchema,
  instantiateTemplateSchema,
  queryTemplatesSchema,
} from '../validators/template-validators.js';
import { BadRequestError } from '../utils/errors.js';
import type { Env } from '../index.js';

export interface TemplateDeps {
  prisma?: PrismaClient;
  audit?: AuditService;
  templateService?: TemplateService;
}

export function createTemplateRoutes(deps?: TemplateDeps) {
  const templates = new Hono<{ Bindings: Env }>();

  templates.use('/*', createRateLimiter(100, 60_000));

  function getServices(c: any) {
    if (deps?.templateService) return { service: deps.templateService };

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
    const service = new TemplateService(prisma, audit);
    return { service };
  }

  // GET /api/v1/templates (FR-005.005 / INK-77 List & Search Template Library)
  templates.get(
    '/',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('templates:read'),
    async (c) => {
      const { service } = getServices(c);
      const userPayload = c.get('userPayload') as any;
      const userId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const queryParams = {
        page: c.req.query('page'),
        limit: c.req.query('limit'),
        search: c.req.query('search'),
        tag: c.req.query('tag'),
        isPublished: c.req.query('isPublished'),
        isArchived: c.req.query('isArchived'),
        view: c.req.query('view'),
      };

      const parsed = queryTemplatesSchema.safeParse(queryParams);
      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Invalid query parameters');
      }

      const result = await service.listTemplates(orgId, userId, parsed.data);
      return c.json(result, 200);
    },
  );

  // GET /api/v1/templates/:id (FR-005.005 / INK-77 Get Template Details)
  templates.get(
    '/:id',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('templates:read'),
    async (c) => {
      const { service } = getServices(c);
      const templateId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const userId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const template = await service.getTemplateById(orgId, userId, templateId);
      return c.json(template, 200);
    },
  );

  // POST /api/v1/templates (FR-005.001 / INK-73 Create Reusable Template)
  templates.post(
    '/',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('templates:manage'),
    async (c) => {
      const { service } = getServices(c);
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const body = await c.req.json().catch(() => null);
      const parsed = createTemplateSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(
          parsed.error.errors[0]?.message || 'Invalid template creation payload',
        );
      }

      const template = await service.createTemplate(orgId, authorId, parsed.data);
      return c.json(template, 201);
    },
  );

  // POST /api/v1/templates/from-agreement (FR-005.001 / INK-73 Convert Agreement to Template)
  templates.post(
    '/from-agreement',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('templates:manage'),
    async (c) => {
      const { service } = getServices(c);
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const body = await c.req.json().catch(() => null);
      const parsed = convertAgreementToTemplateSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Invalid conversion payload');
      }

      const template = await service.convertAgreementToTemplate(orgId, authorId, parsed.data);
      return c.json(template, 201);
    },
  );

  // PATCH /api/v1/templates/:id (FR-005.001 / INK-73 Update Template Draft)
  templates.patch(
    '/:id',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('templates:manage'),
    async (c) => {
      const { service } = getServices(c);
      const templateId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const body = await c.req.json().catch(() => null);
      const parsed = updateTemplateDraftSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Invalid update payload');
      }

      const updated = await service.updateTemplateDraft(orgId, authorId, templateId, parsed.data);
      return c.json(updated, 200);
    },
  );

  // DELETE /api/v1/templates/:id (FR-005.005 / INK-77 Archive Template)
  templates.delete(
    '/:id',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('templates:manage'),
    async (c) => {
      const { service } = getServices(c);
      const templateId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const updated = await service.archiveTemplate(orgId, authorId, templateId);
      return c.json(updated, 200);
    },
  );

  // POST /api/v1/templates/:id/versions (FR-005.002 / INK-74 Create Template Version)
  templates.post(
    '/:id/versions',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('templates:manage'),
    async (c) => {
      const { service } = getServices(c);
      const templateId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const body = await c.req.json().catch(() => ({}));
      const parsed = createTemplateVersionSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Invalid version payload');
      }

      const version = await service.createTemplateVersion(orgId, authorId, templateId, parsed.data);
      return c.json(version, 201);
    },
  );

  // GET /api/v1/templates/:id/versions (FR-005.002 / INK-74 List Template Versions)
  templates.get(
    '/:id/versions',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('templates:read'),
    async (c) => {
      const { service } = getServices(c);
      const templateId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const userId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const versions = await service.listVersions(orgId, userId, templateId);
      return c.json(versions, 200);
    },
  );

  // POST /api/v1/templates/:id/shares (FR-005.003 / INK-75 Share Template ACL)
  templates.post(
    '/:id/shares',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('templates:manage'),
    async (c) => {
      const { service } = getServices(c);
      const templateId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const body = await c.req.json().catch(() => null);
      const parsed = shareTemplateSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Invalid share payload');
      }

      const share = await service.shareTemplate(orgId, authorId, templateId, parsed.data);
      return c.json(share, 201);
    },
  );

  // GET /api/v1/templates/:id/shares (FR-005.003 / INK-75 List Template Shares)
  templates.get(
    '/:id/shares',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('templates:read'),
    async (c) => {
      const { service } = getServices(c);
      const templateId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const userId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const shares = await service.listShares(orgId, userId, templateId);
      return c.json(shares, 200);
    },
  );

  // DELETE /api/v1/templates/:id/shares/:shareId (FR-005.003 / INK-75 Revoke Share)
  templates.delete(
    '/:id/shares/:shareId',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('templates:manage'),
    async (c) => {
      const { service } = getServices(c);
      const templateId = c.req.param('id');
      const shareId = c.req.param('shareId');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const result = await service.removeShare(orgId, authorId, templateId, shareId);
      return c.json(result, 200);
    },
  );

  // POST /api/v1/templates/:id/publish (FR-005.004 / INK-76 Publish Template - Org Admin only)
  templates.post(
    '/:id/publish',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('templates:publish'),
    async (c) => {
      const { service } = getServices(c);
      const templateId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const authorId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const body = await c.req.json().catch(() => ({ isPublished: true }));
      const parsed = publishTemplateSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(parsed.error.errors[0]?.message || 'Invalid publish payload');
      }

      const updated = await service.publishTemplate(
        orgId,
        authorId,
        templateId,
        parsed.data.isPublished,
      );
      return c.json(updated, 200);
    },
  );

  // POST /api/v1/templates/:id/instantiate (FR-005.005 / INK-77 Instantiate Agreement from Template)
  templates.post(
    '/:id/instantiate',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('documents:create'),
    async (c) => {
      const { service } = getServices(c);
      const templateId = c.req.param('id');
      const userPayload = c.get('userPayload') as any;
      const userId = userPayload?.sub || 'unknown';
      const orgId = userPayload?.orgId || 'default-org-id';

      const body = await c.req.json().catch(() => ({}));
      const parsed = instantiateTemplateSchema.safeParse(body);

      if (!parsed.success) {
        throw new BadRequestError(
          parsed.error.errors[0]?.message || 'Invalid instantiation payload',
        );
      }

      const agreement = await service.instantiateTemplate(orgId, userId, templateId, parsed.data);
      return c.json(agreement, 201);
    },
  );

  return templates;
}
