import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createAgreementRoutes } from './agreements.js';
import { signJwt } from '../utils/jwt.js';

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
});
