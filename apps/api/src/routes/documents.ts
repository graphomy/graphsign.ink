import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { AgreementService } from '../services/agreement-service.js';
import { PrismaAuditService, type AuditService } from '../services/audit-service.js';
import { DomainEventService } from '../services/domain-event-service.js';
import { apiAuth, requireScopes } from '../middleware/api-auth.js';
import { idempotency } from '../middleware/idempotency.js';
import {
  createDocumentSchema,
  replaceDocumentSchema,
  patchDocumentSchema,
  documentQuerySchema,
  toDocumentDto,
} from '../contracts/document-contracts.js';
import { BadRequestError, NotFoundError, ValidationError } from '../utils/errors.js';
import { API_SCOPES } from '../types/principal.js';
import type { Env } from '../index.js';

export interface DocumentDeps {
  prisma?: PrismaClient;
  audit?: AuditService;
  agreementService?: AgreementService;
  eventService?: DomainEventService;
}

export function createDocumentRoutes(deps?: DocumentDeps) {
  const router = new Hono<{ Bindings: Env }>();

  function getServices(c: any) {
    let prisma = deps?.prisma;
    if (!prisma) {
      const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL;
      const isValidUrl =
        dbUrl &&
        typeof dbUrl === 'string' &&
        dbUrl.trim() !== '' &&
        (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'));
      prisma = isValidUrl ? createPrismaClient(dbUrl) : getLegacyPrisma();
    }

    const audit = deps?.audit || new PrismaAuditService(prisma);
    const agreementService = deps?.agreementService || new AgreementService(prisma, audit);
    const eventService = deps?.eventService || new DomainEventService(prisma);

    return { prisma, audit, agreementService, eventService };
  }

  router.use('/*', async (c, next) => {
    const { prisma } = getServices(c);
    (c as any).prisma = prisma;
    await next();
  });

  // All endpoints require authentication and active tenant status
  router.use('/*', apiAuth({ prisma: deps?.prisma }));

  /**
   * POST /api/v1/documents
   * INK-147, INK-154: Create new document with idempotency and audit trail
   */
  router.post(
    '/',
    requireScopes(API_SCOPES.DOCUMENTS_CREATE),
    idempotency({ operation: 'DOCUMENT_CREATE' }),
    async (c) => {
      const { agreementService, eventService } = getServices(c);
      const principal = c.get('principal');

      let body: any;
      try {
        body = await c.req.json();
      } catch {
        throw new BadRequestError('Malformed JSON payload');
      }

      const parseResult = createDocumentSchema.safeParse(body);
      if (!parseResult.success) {
        throw new BadRequestError(parseResult.error.issues.map((i) => i.message).join(', '));
      }

      const input = parseResult.data;
      const authorId = principal.userId || principal.id;
      let createdAgreement: any;

      const isBase64 = input.contentEncoding === 'base64';
      const resolvedMimeType = input.mimeType || (isBase64 ? 'application/pdf' : 'text/markdown');
      const isPdf = resolvedMimeType === 'application/pdf';

      if (isPdf || isBase64) {
        // PDF or binary upload representation
        createdAgreement = await agreementService.uploadAgreementFile(
          principal.organisationId,
          authorId,
          {
            title: input.name,
            fileName: input.name,
            fileSize: input.content ? Buffer.byteLength(input.content, 'utf8') : 1024,
            mimeType: resolvedMimeType,
            fileBase64: isBase64 ? input.content : undefined,
            markdownContent: !isBase64 ? input.content : undefined,
            description: input.description,
            metadata: input.metadata,
            tags: input.tags,
          },
        );
      } else {
        // Text / markdown scratch representation
        createdAgreement = await agreementService.createFromScratch(
          principal.organisationId,
          authorId,
          {
            title: input.name,
            markdownContent: input.content,
            description: input.description,
            metadata: input.metadata,
            tags: input.tags,
          },
        );
      }

      // Emit document.created domain event (INK-151, INK-158)
      await eventService.publish({
        organisationId: principal.organisationId,
        eventType: 'document.created',
        resourceType: 'agreement',
        resourceId: createdAgreement.id,
        actorKind: principal.kind,
        actorId: principal.id,
        dedupeKey: `document.created:${createdAgreement.id}:1`,
        data: {
          document_id: createdAgreement.id,
          document_name: createdAgreement.title,
          status: createdAgreement.status,
          folder: (input.metadata as any)?.folder,
          mime_type: createdAgreement.mimeType,
          file_size: createdAgreement.fileSize,
        },
      });

      const dto = toDocumentDto(createdAgreement);
      c.header('Location', `/api/v1/documents/${dto.id}`);
      return c.json(dto, 201);
    },
  );

  /**
   * GET /api/v1/documents
   * INK-147: List documents with pagination and filtering
   */
  router.get('/', requireScopes(API_SCOPES.DOCUMENTS_READ), async (c) => {
    const { prisma } = getServices(c);
    const principal = c.get('principal');

    const queryParams = c.req.query();
    const parseResult = documentQuerySchema.safeParse(queryParams);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues.map((i) => i.message).join(', '));
    }

    const { page = 1, limit = 20, cursor, status, folder, search, from, to } = parseResult.data;

    const where: any = {
      organisationId: principal.organisationId,
      deletedAt: null,
    };

    if (status) where.status = status;
    if (folder) {
      where.metadata = { path: ['folder'], equals: folder };
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const isCursor = cursor !== undefined;
    let agreements: any[] = [];
    let total: number | undefined;

    if (isCursor) {
      agreements = await prisma.agreement.findMany({
        where,
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    } else {
      [agreements, total] = await Promise.all([
        prisma.agreement.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit + 1,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        prisma.agreement.count({ where }),
      ]);
    }

    const hasMore = agreements.length > limit;
    const items = hasMore ? agreements.slice(0, limit) : agreements;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return c.json({
      data: items.map(toDocumentDto),
      pagination: {
        page: isCursor ? undefined : page,
        total: isCursor ? undefined : total,
        limit,
        hasMore,
        nextCursor,
      },
    });
  });

  /**
   * GET /api/v1/documents/:id
   * INK-147: Retrieve document detail
   */
  router.get('/:id', requireScopes(API_SCOPES.DOCUMENTS_READ), async (c) => {
    const { agreementService } = getServices(c);
    const principal = c.get('principal');
    const id = c.req.param('id');

    try {
      const agreement = await agreementService.getAgreementById(principal.organisationId, id);
      return c.json(toDocumentDto(agreement));
    } catch (err: any) {
      if (err instanceof NotFoundError || err?.statusCode === 404) {
        throw new NotFoundError('Document not found');
      }
      throw err;
    }
  });

  /**
   * PUT /api/v1/documents/:id
   * INK-147: Full editable representation replacement with revision lock
   */
  router.put('/:id', requireScopes(API_SCOPES.DOCUMENTS_UPDATE), async (c) => {
    const { agreementService, eventService } = getServices(c);
    const principal = c.get('principal');
    const id = c.req.param('id');
    const authorId = principal.userId || principal.id;

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      throw new BadRequestError('Malformed JSON payload');
    }

    const parseResult = replaceDocumentSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues.map((i) => i.message).join(', '));
    }

    const input = parseResult.data;
    const existing = await agreementService.getAgreementById(principal.organisationId, id);

    if (existing.status !== 'DRAFT') {
      throw new ValidationError(`Cannot update a document in ${existing.status} status.`);
    }

    let updated: any = await agreementService.saveDraft(principal.organisationId, authorId, id, {
      title: input.name,
      description: input.description,
      markdownContent: input.content || existing.markdownContent || undefined,
    });

    if (input.tags || input.metadata) {
      updated = await agreementService.updateMetadataAndTags(
        principal.organisationId,
        authorId,
        id,
        {
          tags:
            input.tags ?? (Array.isArray(existing.tags) ? (existing.tags as string[]) : undefined),
          metadata: {
            ...((existing.metadata as any) || {}),
            ...input.metadata,
          },
        },
      );
    }

    // Emit document.updated event
    await eventService.publish({
      organisationId: principal.organisationId,
      eventType: 'document.updated',
      resourceType: 'agreement',
      resourceId: updated.id,
      actorKind: principal.kind,
      actorId: principal.id,
      dedupeKey: `document.updated:${updated.id}:${updated.version}:${Date.now()}`,
      data: {
        document_id: updated.id,
        document_name: updated.title,
        status: updated.status,
        version: updated.version,
        folder: (input.metadata as any)?.folder,
      },
    });

    return c.json(toDocumentDto(updated));
  });

  /**
   * PATCH /api/v1/documents/:id
   * INK-147: Partial update of editable document fields
   */
  router.patch('/:id', requireScopes(API_SCOPES.DOCUMENTS_UPDATE), async (c) => {
    const { agreementService, eventService } = getServices(c);
    const principal = c.get('principal');
    const id = c.req.param('id');
    const authorId = principal.userId || principal.id;

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      throw new BadRequestError('Malformed JSON payload');
    }

    const parseResult = patchDocumentSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues.map((i) => i.message).join(', '));
    }

    const input = parseResult.data;
    const existing = await agreementService.getAgreementById(principal.organisationId, id);

    if (existing.status !== 'DRAFT') {
      throw new ValidationError(`Cannot update a document in ${existing.status} status.`);
    }

    let updated: any = existing;
    if (input.name || input.description) {
      updated = await agreementService.saveDraft(principal.organisationId, authorId, id, {
        title: input.name ?? existing.title,
        description: input.description ?? (existing.description || undefined),
      });
    }

    if (input.tags !== undefined || input.metadata !== undefined) {
      updated = await agreementService.updateMetadataAndTags(
        principal.organisationId,
        authorId,
        id,
        {
          tags:
            input.tags ?? (Array.isArray(existing.tags) ? (existing.tags as string[]) : undefined),
          metadata: input.metadata
            ? { ...((existing.metadata as any) || {}), ...input.metadata }
            : undefined,
        },
      );
    }

    await eventService.publish({
      organisationId: principal.organisationId,
      eventType: 'document.updated',
      resourceType: 'agreement',
      resourceId: updated.id,
      actorKind: principal.kind,
      actorId: principal.id,
      dedupeKey: `document.updated:${updated.id}:${updated.version}:${Date.now()}`,
      data: {
        document_id: updated.id,
        document_name: updated.title,
        status: updated.status,
        version: updated.version,
        folder: (input.metadata as any)?.folder,
      },
    });

    return c.json(toDocumentDto(updated));
  });

  /**
   * DELETE /api/v1/documents/:id
   * INK-147: Soft delete document with 204 No Content
   */
  router.delete('/:id', requireScopes(API_SCOPES.DOCUMENTS_DELETE), async (c) => {
    const { agreementService, eventService } = getServices(c);
    const principal = c.get('principal');
    const id = c.req.param('id');
    const authorId = principal.userId || principal.id;

    try {
      const existing = await agreementService.getAgreementById(principal.organisationId, id);
      await agreementService.deleteAgreement(principal.organisationId, authorId, id);

      // Emit document.deleted
      await eventService.publish({
        organisationId: principal.organisationId,
        eventType: 'document.deleted',
        resourceType: 'agreement',
        resourceId: id,
        actorKind: principal.kind,
        actorId: principal.id,
        dedupeKey: `document.deleted:${id}:1`,
        data: {
          document_id: id,
          document_name: existing.title,
          folder: (existing.metadata as any)?.folder,
        },
      });

      return c.body(null, 204);
    } catch (err: any) {
      if (err instanceof NotFoundError || err?.statusCode === 404) {
        throw new NotFoundError('Document not found');
      }
      throw err;
    }
  });

  return router;
}
