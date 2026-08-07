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
      status: 'DRAFT',
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
  });

  it('POST /api/v1/agreements/scratch - creates agreement from scratch HTML (INK-67)', async () => {
    mockAgreementService.createFromScratch.mockResolvedValue({
      id: 'ag-2',
      title: 'Scratch Agreement',
      status: 'DRAFT',
      htmlContent: '<h1>NDA</h1>',
    });

    const res = await app.request('/api/v1/agreements/scratch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'Scratch Agreement',
        htmlContent: '<h1>NDA</h1>',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.title).toBe('Scratch Agreement');
  });

  it('POST /api/v1/agreements/:id/clone - clones agreement (INK-70)', async () => {
    mockAgreementService.cloneAgreement.mockResolvedValue({
      id: 'ag-cloned',
      title: '[Copy] Original Agreement',
      status: 'DRAFT',
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
});
