import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createApiClientRoutes } from './api-clients.js';
import { signJwt } from '../utils/jwt.js';
import { errorHandler } from '../middleware/error-handler.js';

describe('API Client Routes & Authentication Tests (INK-148, FR-016.006)', () => {
  let mockPrisma: any;
  let app: Hono;

  beforeEach(() => {
    mockPrisma = {
      apiClientBinding: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'client-1',
            organisationId: 'org-123',
            clientId: 'service-account-abc',
            name: 'ERP Invoicing Daemon',
            status: 'active',
            scopes: ['documents:read', 'documents:create'],
            createdAt: new Date().toISOString(),
          },
        ]),
        findFirst: vi.fn(),
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'client-new',
            ...data,
            createdAt: new Date().toISOString(),
          }),
        ),
        update: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'client-1',
            ...data,
          }),
        ),
      },
    };

    app = new Hono();
    app.onError(errorHandler);
    app.route('/api/v1/organisations/me/api-clients', createApiClientRoutes({ prisma: mockPrisma }));
  });

  it('allows org_admin to list client bindings', async () => {
    const orgAdminToken = await signJwt({
      sub: 'user-admin',
      email: 'admin@example.com',
      orgId: 'org-123',
      role: 'org_admin',
    });

    const res = await app.request('/api/v1/organisations/me/api-clients', {
      headers: { Authorization: `Bearer ${orgAdminToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('ERP Invoicing Daemon');
  });

  it('allows super_admin to register new client binding', async () => {
    const superAdminToken = await signJwt({
      sub: 'user-super',
      email: 'super@example.com',
      orgId: 'org-123',
      role: 'super_admin',
    });

    const res = await app.request('/api/v1/organisations/me/api-clients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        name: 'New M2M Sync Service',
        clientId: 'client-sync-001',
        scopes: ['documents:read'],
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.name).toBe('New M2M Sync Service');
    expect(body.clientId).toBe('client-sync-001');
  });

  it('forbids viewer without api_clients:manage scope', async () => {
    const viewerToken = await signJwt({
      sub: 'user-viewer',
      email: 'viewer@example.com',
      orgId: 'org-123',
      role: 'viewer',
    });

    const res = await app.request('/api/v1/organisations/me/api-clients', {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });

    expect(res.status).toBe(403);
  });

  it('allows org_admin to delete (revoke) client binding', async () => {
    mockPrisma.apiClientBinding.findFirst.mockResolvedValue({
      id: 'client-1',
      organisationId: 'org-123',
      name: 'ERP Invoicing Daemon',
    });

    const orgAdminToken = await signJwt({
      sub: 'user-admin',
      email: 'admin@example.com',
      orgId: 'org-123',
      role: 'org_admin',
    });

    const res = await app.request('/api/v1/organisations/me/api-clients/client-1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${orgAdminToken}` },
    });

    expect(res.status).toBe(204);
    expect(mockPrisma.apiClientBinding.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'client-1' },
        data: expect.objectContaining({ status: 'revoked' }),
      }),
    );
  });
});

