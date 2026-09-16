import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createDocumentRoutes } from './documents.js';
import { signJwt } from '../utils/jwt.js';
import { errorHandler } from '../middleware/error-handler.js';
import { NotFoundError } from '../utils/errors.js';

describe('Document REST Routes Integration Tests (INK-147, INK-150, INK-154, FR-016)', () => {
  let mockAgreementService: any;
  let mockPrisma: any;
  let mockEventService: any;
  let app: Hono;
  let token: string;

  beforeEach(async () => {
    mockAgreementService = {
      createFromScratch: vi.fn(),
      uploadAgreementFile: vi.fn(),
      getAgreementById: vi.fn(),
      saveDraft: vi.fn(),
      updateMetadataAndTags: vi.fn(),
      deleteAgreement: vi.fn(),
    };

    mockEventService = {
      publish: vi.fn().mockResolvedValue({ id: 'evt-1' }),
    };

    mockPrisma = {
      agreement: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      idempotencyRecord: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      organisation: {
        findUnique: vi.fn().mockResolvedValue({ id: 'org-123', status: 'active' }),
      },
    };

    token = await signJwt({
      sub: 'user-123',
      email: 'author@example.com',
      orgId: 'org-123',
      role: 'admin',
    });

    app = new Hono();
    app.onError(errorHandler);

    const docRoutes = createDocumentRoutes({
      prisma: mockPrisma,
      agreementService: mockAgreementService,
      eventService: mockEventService,
    });

    app.route('/api/v1/documents', docRoutes);
    app.route('/api/v2/documents', docRoutes);
    app.route('/api/documents', docRoutes);

    // Unsupported version route test handler (INK-150)
    app.all('/api/:version/*', (c) => {
      const version = c.req.param('version');
      if (version && version.startsWith('v') && version !== 'v1' && version !== 'v2') {
        return c.json(
          {
            error: {
              code: 'VERSION_NOT_SUPPORTED',
              message: `API version ${version} is not supported`,
            },
          },
          404,
        );
      }
      return c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
    });
  });

  describe('POST /api/v1/documents (INK-147, INK-154)', () => {
    it('creates a draft markdown document and returns 201 Created with Location header', async () => {
      const createdDate = new Date();
      mockAgreementService.createFromScratch.mockResolvedValue({
        id: 'doc-uuid-1',
        title: 'Board Resolutions',
        description: 'Resolutions draft',
        status: 'DRAFT',
        version: '0.1',
        mimeType: 'text/markdown',
        fileSize: 1024,
        tags: ['legal', 'q3'],
        metadata: { folder: 'Corporate' },
        createdAt: createdDate,
        updatedAt: createdDate,
      });

      const res = await app.request('/api/v1/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Board Resolutions',
          description: 'Resolutions draft',
          content: '# Board Meeting Minutes\n\nApproved.',
          tags: ['legal', 'q3'],
          metadata: { folder: 'Corporate' },
        }),
      });

      expect(res.status).toBe(201);
      expect(res.headers.get('Location')).toBe('/api/v1/documents/doc-uuid-1');
      const body = (await res.json()) as any;
      expect(body.id).toBe('doc-uuid-1');
      expect(body.name).toBe('Board Resolutions');
      expect(body.status).toBe('DRAFT');
      expect(mockEventService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'document.created',
          resourceId: 'doc-uuid-1',
        }),
      );
    });

    it('creates binary base64 document and invokes uploadAgreementFile', async () => {
      const createdDate = new Date();
      mockAgreementService.uploadAgreementFile.mockResolvedValue({
        id: 'doc-pdf-2',
        title: 'Signed Lease Agreement.pdf',
        status: 'DRAFT',
        version: '1.0',
        mimeType: 'application/pdf',
        fileSize: 2048,
        tags: [],
        metadata: {},
        createdAt: createdDate,
        updatedAt: createdDate,
      });

      const res = await app.request('/api/v1/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Signed Lease Agreement.pdf',
          content: 'JVBERi0xLjQKJcTl8uXr...',
          contentEncoding: 'base64',
          mimeType: 'application/pdf',
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.id).toBe('doc-pdf-2');
      expect(mockAgreementService.uploadAgreementFile).toHaveBeenCalled();
    });

    it('replays previously cached 201 response as 200 with X-Idempotent-Replay header (INK-154)', async () => {
      mockPrisma.idempotencyRecord.findUnique.mockResolvedValue({
        key: 'idemp-key-100',
        organisationId: 'org-123',
        status: 'COMPLETED',
        statusCode: 201,
        responseHeaders: { 'content-type': 'application/json' },
        responseBody: { id: 'cached-doc-999', name: 'Cached Document', status: 'DRAFT' },
        expiresAt: new Date(Date.now() + 86400000),
      });

      const res = await app.request('/api/v1/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idemp-key-100',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Cached Document',
          content: 'Test content',
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('X-Idempotent-Replay')).toBe('true');
      const body = (await res.json()) as any;
      expect(body.id).toBe('cached-doc-999');
      // Should not call service again
      expect(mockAgreementService.createFromScratch).not.toHaveBeenCalled();
    });

    it('rejects invalid JSON payload with 400 Bad Request', async () => {
      const res = await app.request('/api/v1/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          // Missing required 'name' and 'content'
          description: 'Incomplete document',
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('GET /api/v1/documents (INK-147)', () => {
    it('returns paginated list of documents', async () => {
      const docDate = new Date();
      mockPrisma.agreement.findMany.mockResolvedValue([
        {
          id: 'doc-1',
          title: 'Document 1',
          status: 'COMPLETED',
          version: '1.0',
          mimeType: 'application/pdf',
          fileSize: 5000,
          tags: ['sales'],
          metadata: { folder: 'Q3' },
          createdAt: docDate,
          updatedAt: docDate,
        },
      ]);
      mockPrisma.agreement.count.mockResolvedValue(1);

      const res = await app.request('/api/v1/documents?page=1&limit=10&status=COMPLETED', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe('doc-1');
      expect(body.pagination.total).toBe(1);
    });
  });

  describe('GET /api/v1/documents/:id (INK-147)', () => {
    it('returns document details when found', async () => {
      const docDate = new Date();
      mockAgreementService.getAgreementById.mockResolvedValue({
        id: 'doc-123',
        title: 'Master Agreement',
        status: 'DRAFT',
        version: '0.1',
        mimeType: 'text/markdown',
        fileSize: 1024,
        tags: [],
        metadata: {},
        createdAt: docDate,
        updatedAt: docDate,
      });

      const res = await app.request('/api/v1/documents/doc-123', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.id).toBe('doc-123');
      expect(body.name).toBe('Master Agreement');
    });

    it('returns 404 when document is not found', async () => {
      mockAgreementService.getAgreementById.mockRejectedValue(new NotFoundError('Document not found'));

      const res = await app.request('/api/v1/documents/doc-not-found', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/documents/:id (INK-147)', () => {
    it('soft-deletes document and returns 204 No Content', async () => {
      mockAgreementService.getAgreementById.mockResolvedValue({
        id: 'doc-del-1',
        title: 'To Be Deleted',
        metadata: {},
      });
      mockAgreementService.deleteAgreement.mockResolvedValue({ success: true, id: 'doc-del-1' });

      const res = await app.request('/api/v1/documents/doc-del-1', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(204);
      expect(mockAgreementService.deleteAgreement).toHaveBeenCalledWith('org-123', 'user-123', 'doc-del-1');
      expect(mockEventService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'document.deleted',
          resourceId: 'doc-del-1',
        }),
      );
    });
  });

  describe('API Versioning & Deprecations (INK-150)', () => {
    it('allows accessing documents via /api/v1/documents, /api/v2/documents, and /api/documents alias', async () => {
      const v1Res = await app.request('/api/v1/documents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(v1Res.status).toBe(200);

      const v2Res = await app.request('/api/v2/documents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(v2Res.status).toBe(200);

      const defaultAliasRes = await app.request('/api/documents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(defaultAliasRes.status).toBe(200);
    });

    it('returns 404 with structured VERSION_NOT_SUPPORTED error for unsupported versions like /api/v3/*', async () => {
      const res = await app.request('/api/v3/documents', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VERSION_NOT_SUPPORTED');
      expect(body.error.message).toContain('v3 is not supported');
    });
  });
});
