import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createSearchRoutes } from './search.js';
import { signJwt } from '../utils/jwt.js';
import { errorHandler } from '../middleware/error-handler.js';

describe('Search Routes Integration Tests (INK-117 to INK-122)', () => {
  let app: Hono;
  let mockSearchService: any;
  let validToken: string;

  const mockUser = {
    id: '00000000-0000-7000-8000-000000000001',
    email: 'alice@example.com',
    name: 'Alice User',
    organisationId: '00000000-0000-7000-8000-000000000002',
    role: 'org_admin',
  };

  beforeEach(async () => {
    validToken = await signJwt({
      sub: mockUser.id,
      email: mockUser.email,
      orgId: mockUser.organisationId,
      role: mockUser.role,
      name: mockUser.name,
    });

    mockSearchService = {
      searchAgreements: vi.fn().mockResolvedValue({
        data: [{ id: 'ag-1', title: 'Service Contract', status: 'ACTIVE' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        suggestion: null,
        queryTimeMs: 12,
        activeFilters: { keyword: 'Service', status: 'ACTIVE' },
      }),
      searchTemplates: vi.fn().mockResolvedValue({
        data: [{ id: 'tmpl-1', title: 'NDA Template' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        queryTimeMs: 8,
      }),
      searchGlobal: vi.fn().mockResolvedValue({
        agreements: [{ id: 'ag-1', title: 'Service Contract' }],
        templates: [{ id: 'tmpl-1', title: 'NDA Template' }],
        totalCount: 2,
        queryTimeMs: 15,
      }),
      listFilterPresets: vi.fn().mockResolvedValue([
        {
          id: 'preset-1',
          name: 'Active PDFs',
          entityType: 'AGREEMENT',
          filters: { status: 'ACTIVE' },
          isDefault: true,
        },
      ]),
      createFilterPreset: vi.fn().mockResolvedValue({
        id: 'preset-1',
        name: 'Active PDFs',
        entityType: 'AGREEMENT',
        filters: { status: 'ACTIVE' },
        isDefault: true,
      }),
      deleteFilterPreset: vi.fn().mockResolvedValue({
        success: true,
        message: 'Filter preset deleted',
      }),
      setDefaultFilterPreset: vi.fn().mockResolvedValue({
        id: 'preset-1',
        name: 'Active PDFs',
        isDefault: true,
      }),
    };

    const mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ ...mockUser, status: 'active' }),
      },
      organisation: {
        findUnique: vi.fn().mockResolvedValue({ id: mockUser.organisationId, status: 'active' }),
      },
    };

    app = new Hono();
    app.onError(errorHandler);
    app.route(
      '/api/v1/search',
      createSearchRoutes({
        searchService: mockSearchService,
        prisma: mockPrisma as any,
      }),
    );
  });

  it('GET /api/v1/search/agreements searches documents with keyword and filters (INK-117, INK-118)', async () => {
    const res = await app.request(
      '/api/v1/search/agreements?q=Service&status=ACTIVE&sortBy=title&sortOrder=asc',
      {
        headers: { Authorization: `Bearer ${validToken}` },
      },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(mockSearchService.searchAgreements).toHaveBeenCalledWith(
      expect.objectContaining({ userId: mockUser.id }),
      expect.objectContaining({
        q: 'Service',
        status: 'ACTIVE',
        sortBy: 'title',
        sortOrder: 'asc',
      }),
    );
  });

  it('GET /api/v1/search/templates searches templates library (FR-010.008)', async () => {
    const res = await app.request('/api/v1/search/templates?q=NDA', {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(mockSearchService.searchTemplates).toHaveBeenCalled();
  });

  it('GET /api/v1/search executes global unified search (INK-117, INK-122)', async () => {
    const res = await app.request('/api/v1/search?q=Service', {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.agreements).toBeDefined();
    expect(body.templates).toBeDefined();
    expect(body.totalCount).toBe(2);
  });

  it('GET /api/v1/search/presets returns saved filter presets (INK-120)', async () => {
    const res = await app.request('/api/v1/search/presets?entityType=AGREEMENT', {
      headers: { Authorization: `Bearer ${validToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].name).toBe('Active PDFs');
  });

  it('POST /api/v1/search/presets creates a custom filter preset (INK-120)', async () => {
    const res = await app.request('/api/v1/search/presets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${validToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Active PDFs',
        entityType: 'AGREEMENT',
        filters: { status: 'ACTIVE', documentType: 'pdf' },
        isDefault: true,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(mockSearchService.createFilterPreset).toHaveBeenCalled();
  });

  it('DELETE /api/v1/search/presets/:id deletes saved filter preset (INK-120)', async () => {
    const res = await app.request('/api/v1/search/presets/preset-1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${validToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(mockSearchService.deleteFilterPreset).toHaveBeenCalledWith(
      expect.anything(),
      'preset-1',
    );
  });

  it('PATCH /api/v1/search/presets/:id/default sets preset as default (INK-120)', async () => {
    const res = await app.request('/api/v1/search/presets/preset-1/default', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${validToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(mockSearchService.setDefaultFilterPreset).toHaveBeenCalledWith(
      expect.anything(),
      'preset-1',
    );
  });
});
