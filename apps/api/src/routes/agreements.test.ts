import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createAgreementRoutes } from './agreements.js';
import { signJwt } from '../utils/jwt.js';
import { errorHandler } from '../middleware/error-handler.js';

describe('Agreement Routes Integration Tests (Epic INK-8)', () => {
  let mockAgreementService: any;
  let app: Hono;
  let token: string;

  beforeEach(async () => {
    mockAgreementService = {
      uploadAgreementFile: vi.fn(),
      createFromScratch: vi.fn(),
      saveDraft: vi.fn(),
      activateAgreement: vi.fn(),
      getAgreementById: vi.fn(),
      getAgreementHistory: vi.fn(),
      createVersion: vi.fn(),
      listVersions: vi.fn(),
      cloneAgreement: vi.fn(),
      setArchiveStatus: vi.fn(),
      deleteAgreement: vi.fn(),
      updateMetadataAndTags: vi.fn(),
      listAgreements: vi.fn(),
    };

    token = await signJwt({
      sub: 'user-123',
      email: 'sender@graphomy.com',
      orgId: 'org-123',
      role: 'sender',
    });

    app = new Hono();
    app.onError(errorHandler);
    app.route(
      '/api/v1/agreements',
      createAgreementRoutes({ agreementService: mockAgreementService }),
    );
  });

  it('POST /api/v1/agreements/upload - uploads agreement file (INK-66)', async () => {
    mockAgreementService.uploadAgreementFile.mockResolvedValue({
      id: 'ag-1',
      title: 'Master Contract',
      status: 'ACTIVE',
      version: '1.0',
      fileUrl: 'https://storage/contract.pdf',
    });

    const res = await app.request('/api/v1/agreements/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'Master Contract',
        fileName: 'contract.pdf',
        fileSize: 102400,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.title).toBe('Master Contract');
    expect(body.version).toBe('1.0');
  });

  it('POST /api/v1/agreements/scratch - creates agreement from scratch Markdown (INK-67)', async () => {
    mockAgreementService.createFromScratch.mockResolvedValue({
      id: 'ag-2',
      title: 'Scratch Agreement',
      status: 'DRAFT',
      version: '0.1',
      markdownContent: '# NDA\n\n- Confidentiality',
    });

    const res = await app.request('/api/v1/agreements/scratch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'Scratch Agreement',
        markdownContent: '# NDA\n\n- Confidentiality',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.title).toBe('Scratch Agreement');
    expect(body.version).toBe('0.1');
  });

  it('GET /api/v1/agreements/:id - gets agreement by ID', async () => {
    mockAgreementService.getAgreementById.mockResolvedValue({
      id: 'ag-1',
      title: 'Service Agreement',
      status: 'DRAFT',
      version: '0.1',
    });

    const res = await app.request('/api/v1/agreements/ag-1', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.id).toBe('ag-1');
  });

  it('POST /api/v1/agreements/:id/activate - activates draft agreement', async () => {
    mockAgreementService.activateAgreement.mockResolvedValue({
      id: 'ag-1',
      title: 'Service Agreement',
      status: 'ACTIVE',
      version: '1.0',
    });

    const res = await app.request('/api/v1/agreements/ag-1/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ comment: 'Ready to sign' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('ACTIVE');
    expect(body.version).toBe('1.0');
  });

  it('GET /api/v1/agreements/:id/history - gets concise history timeline', async () => {
    mockAgreementService.getAgreementHistory.mockResolvedValue([
      {
        id: 'h-1',
        action: 'AGREEMENT_CREATED',
        summary: 'Created draft v0.1',
        user: { name: 'Alice', email: 'alice@graphsign.ink' },
        createdAt: '2026-08-14T00:00:00Z',
      },
    ]);

    const res = await app.request('/api/v1/agreements/ag-1/history', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toHaveLength(1);
    expect(body[0].summary).toBe('Created draft v0.1');
  });

  it('POST /api/v1/agreements/:id/clone - clones agreement (INK-70)', async () => {
    mockAgreementService.cloneAgreement.mockResolvedValue({
      id: 'ag-cloned',
      title: '[Copy] Original Agreement',
      status: 'DRAFT',
      version: '0.1',
    });

    const res = await app.request('/api/v1/agreements/ag-orig/clone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.title).toBe('[Copy] Original Agreement');
  });

  it('POST /api/v1/agreements/:id/archive - archives agreement (INK-71)', async () => {
    mockAgreementService.setArchiveStatus.mockResolvedValue({
      id: 'ag-1',
      isArchived: true,
    });

    const res = await app.request('/api/v1/agreements/ag-1/archive', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.isArchived).toBe(true);
  });

  it('GET /api/v1/agreements/:id/file - streams original PDF binary when base64 is stored', async () => {
    const sampleBase64 = Buffer.from('%PDF-1.4 sample pdf content').toString('base64');
    mockAgreementService.getAgreementById.mockResolvedValue({
      id: 'ag-pdf',
      title: 'Contract PDF',
      fileName: 'contract.pdf',
      mimeType: 'application/pdf',
      metadata: { fileData: `data:application/pdf;base64,${sampleBase64}` },
    });

    const res = await app.request('/api/v1/agreements/ag-pdf/file', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('contract.pdf');
    const text = await res.text();
    expect(text).toBe('%PDF-1.4 sample pdf content');
  });

  it('GET /api/v1/agreements/:id/file - streams markdown text when markdownContent exists', async () => {
    mockAgreementService.getAgreementById.mockResolvedValue({
      id: 'ag-md',
      title: 'Terms of Service',
      fileName: 'terms.md',
      markdownContent: '# Terms of Service\n\n1. Introduction',
      metadata: {},
    });

    const res = await app.request('/api/v1/agreements/ag-md/file', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/markdown');
    const text = await res.text();
    expect(text).toContain('# Terms of Service');
  });

  it('GET /api/v1/agreements/:id/file - streams file when token is passed in query parameter', async () => {
    mockAgreementService.getAgreementById.mockResolvedValue({
      id: 'ag-query-token',
      title: 'Query Token Document',
      fileName: 'doc.md',
      markdownContent: '# Document Content',
      metadata: {},
    });

    const res = await app.request(`/api/v1/agreements/ag-query-token/file?token=${token}`);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/markdown');
    const text = await res.text();
    expect(text).toContain('# Document Content');
  });

  it('GET /api/v1/agreements - passes authorId and userRole to service for privacy scoping (INK-248)', async () => {
    mockAgreementService.listAgreements.mockResolvedValue({
      items: [{ id: 'ag-1', title: 'My Private Agreement' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const res = await app.request('/api/v1/agreements?page=1&limit=20', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(mockAgreementService.listAgreements).toHaveBeenCalledWith(
      'org-123',
      expect.objectContaining({ page: 1, limit: 20 }),
      'user-123',
      'sender',
      'sender@graphomy.com',
    );
  });

  it('GET /api/v1/agreements/:id/file - blocks super admin from accessing private file payloads (INK-248)', async () => {
    const superAdminToken = await signJwt({
      sub: 'super-1',
      email: 'kunal@graphomy.com',
      orgId: 'org-123',
      role: 'super_admin',
    });

    const res = await app.request('/api/v1/agreements/ag-secret/file', {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error?.message).toContain('Super Admins are restricted to metadata only');
  });

  it('GET /api/v1/agreements/:id/fields - returns fields and recipients (INK-78 to INK-85)', async () => {
    mockAgreementService.getAgreementFields = vi.fn().mockResolvedValue({
      agreementId: 'ag-fields-1',
      fields: [
        {
          id: 'f-sig-1',
          type: 'SIGNATURE',
          pageNumber: 1,
          x: 20,
          y: 60,
          width: 30,
          height: 10,
          recipientId: 'r-1',
          isRequired: true,
        },
      ],
      recipients: [
        {
          id: 'r-1',
          name: 'Jane Signer',
          email: 'jane@example.com',
          role: 'signer',
          color: '#3B82F6',
        },
      ],
    });

    const res = await app.request('/api/v1/agreements/ag-fields-1/fields', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.agreementId).toBe('ag-fields-1');
    expect(body.fields).toHaveLength(1);
    expect(body.recipients).toHaveLength(1);
  });

  it('PUT /api/v1/agreements/:id/fields - saves document fields and recipients (INK-78 to INK-85)', async () => {
    mockAgreementService.saveAgreementFields = vi.fn().mockResolvedValue({
      agreementId: 'ag-fields-1',
      fields: [
        {
          id: 'f-1',
          type: 'TEXT',
          pageNumber: 1,
          x: 15,
          y: 25,
          width: 30,
          height: 6,
          label: 'Legal Name',
          recipientId: 'r-1',
          isRequired: true,
        },
      ],
      recipients: [
        {
          id: 'r-1',
          name: 'Jane Signer',
          email: 'jane@example.com',
          role: 'signer',
          color: '#3B82F6',
        },
      ],
    });

    const payload = {
      fields: [
        {
          id: 'f-1',
          type: 'TEXT',
          pageNumber: 1,
          x: 15,
          y: 25,
          width: 30,
          height: 6,
          label: 'Legal Name',
          recipientId: 'r-1',
          isRequired: true,
        },
      ],
      recipients: [
        {
          id: 'r-1',
          name: 'Jane Signer',
          email: 'jane@example.com',
          role: 'signer',
          color: '#3B82F6',
        },
      ],
    };

    const res = await app.request('/api/v1/agreements/ag-fields-1/fields', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.fields).toHaveLength(1);
    expect(mockAgreementService.saveAgreementFields).toHaveBeenCalledWith(
      'org-123',
      'user-123',
      'ag-fields-1',
      expect.objectContaining({ fields: expect.any(Array), recipients: expect.any(Array) }),
      'sender',
    );
  });

  it('DELETE /api/v1/agreements/:id - deletes agreement record (INK-271)', async () => {
    mockAgreementService.deleteAgreement.mockResolvedValue({
      success: true,
      id: 'ag-del-1',
    });

    const res = await app.request('/api/v1/agreements/ag-del-1', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(mockAgreementService.deleteAgreement).toHaveBeenCalledWith(
      'org-123',
      'user-123',
      'ag-del-1',
      'sender',
    );
  });
});
