import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createTemplateRoutes } from './templates.js';
import { signJwt } from '../utils/jwt.js';

describe('Template Routes Integration Tests (Epic INK-11)', () => {
  let mockTemplateService: any;
  let app: Hono;
  let token: string;

  beforeEach(async () => {
    mockTemplateService = {
      createTemplate: vi.fn(),
      convertAgreementToTemplate: vi.fn(),
      updateTemplateDraft: vi.fn(),
      createTemplateVersion: vi.fn(),
      listVersions: vi.fn(),
      shareTemplate: vi.fn(),
      listShares: vi.fn(),
      removeShare: vi.fn(),
      publishTemplate: vi.fn(),
      instantiateTemplate: vi.fn(),
      listTemplates: vi.fn(),
    };

    token = await signJwt({
      sub: 'user-123',
      email: 'admin@acme.com',
      orgId: 'org-123',
      role: 'org_admin',
    });

    app = new Hono();
    app.route('/api/v1/templates', createTemplateRoutes({ templateService: mockTemplateService }));
  });

  it('POST /api/v1/templates - creates a new template (INK-73)', async () => {
    mockTemplateService.createTemplate.mockResolvedValue({
      id: 'tpl-1',
      title: 'Vendor Agreement Template',
      version: 1,
    });

    const res = await app.request('/api/v1/templates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: 'Vendor Agreement Template',
        description: 'Standard vendor contract template',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.title).toBe('Vendor Agreement Template');
  });

  it('POST /api/v1/templates/:id/versions - creates a new version (INK-74)', async () => {
    mockTemplateService.createTemplateVersion.mockResolvedValue({
      id: 'ver-2',
      version: 2,
      changeSummary: 'Updated clauses',
    });

    const res = await app.request('/api/v1/templates/tpl-1/versions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        changeSummary: 'Updated clauses',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.version).toBe(2);
  });

  it('POST /api/v1/templates/:id/shares - shares template with target (INK-75)', async () => {
    mockTemplateService.shareTemplate.mockResolvedValue({
      id: 'share-1',
      targetType: 'user',
      targetId: '00000000-0000-7000-8000-000000000001',
      accessLevel: 'USE',
    });

    const res = await app.request('/api/v1/templates/tpl-1/shares', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        targetType: 'user',
        targetId: '00000000-0000-7000-8000-000000000001',
        accessLevel: 'USE',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.accessLevel).toBe('USE');
  });

  it('POST /api/v1/templates/:id/publish - publishes template (INK-76)', async () => {
    mockTemplateService.publishTemplate.mockResolvedValue({
      id: 'tpl-1',
      isPublished: true,
    });

    const res = await app.request('/api/v1/templates/tpl-1/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ isPublished: true }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.isPublished).toBe(true);
  });

  it('POST /api/v1/templates/:id/instantiate - creates agreement from template (INK-77)', async () => {
    mockTemplateService.instantiateTemplate.mockResolvedValue({
      id: 'ag-instantiated',
      title: 'Custom Agreement from Template',
      status: 'DRAFT',
    });

    const res = await app.request('/api/v1/templates/tpl-1/instantiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: 'Custom Agreement from Template' }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.status).toBe('DRAFT');
  });
});
