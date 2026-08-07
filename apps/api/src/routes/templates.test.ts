import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createTemplateRoutes } from './templates.js';
import { signJwt } from '../utils/jwt.js';
import { errorHandler } from '../middleware/error-handler.js';

describe('Template Routes Integration Tests (Epic INK-11)', () => {
  let mockTemplateService: any;
  let app: Hono;
  let adminToken: string;
  let senderToken: string;

  beforeEach(async () => {
    mockTemplateService = {
      createTemplate: vi.fn(),
      convertAgreementToTemplate: vi.fn(),
      getTemplateById: vi.fn(),
      updateTemplateDraft: vi.fn(),
      archiveTemplate: vi.fn(),
      createTemplateVersion: vi.fn(),
      listVersions: vi.fn(),
      shareTemplate: vi.fn(),
      listShares: vi.fn(),
      removeShare: vi.fn(),
      publishTemplate: vi.fn(),
      instantiateTemplate: vi.fn(),
      listTemplates: vi.fn(),
    };

    adminToken = await signJwt({
      sub: 'admin-123',
      email: 'admin@acme.com',
      orgId: 'org-123',
      role: 'org_admin',
    });

    senderToken = await signJwt({
      sub: 'sender-123',
      email: 'sender@acme.com',
      orgId: 'org-123',
      role: 'sender',
    });

    app = new Hono();
    app.onError(errorHandler);
    app.route('/api/v1/templates', createTemplateRoutes({ templateService: mockTemplateService }));
  });

  it('GET /api/v1/templates/:id - returns template details (INK-77)', async () => {
    mockTemplateService.getTemplateById.mockResolvedValue({
      id: 'tpl-1',
      title: 'Detailed Template',
      fields: [{ id: 'f1' }],
    });

    const res = await app.request('/api/v1/templates/tpl-1', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.title).toBe('Detailed Template');
  });

  it('DELETE /api/v1/templates/:id - archives template (INK-77)', async () => {
    mockTemplateService.archiveTemplate.mockResolvedValue({
      id: 'tpl-1',
      isArchived: true,
    });

    const res = await app.request('/api/v1/templates/tpl-1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.isArchived).toBe(true);
  });

  it('POST /api/v1/templates/:id/publish - allows org_admin to publish (INK-76)', async () => {
    mockTemplateService.publishTemplate.mockResolvedValue({
      id: 'tpl-1',
      isPublished: true,
    });

    const res = await app.request('/api/v1/templates/tpl-1/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ isPublished: true }),
    });

    expect(res.status).toBe(200);
  });

  it('POST /api/v1/templates/:id/publish - rejects regular sender role from publishing (INK-76)', async () => {
    const res = await app.request('/api/v1/templates/tpl-1/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${senderToken}`,
      },
      body: JSON.stringify({ isPublished: true }),
    });

    expect(res.status).toBe(403);
  });
});
