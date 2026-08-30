import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createAdminRoutes } from './admin.js';
import { errorHandler } from '../middleware/error-handler.js';
import { signJwt } from '../utils/jwt.js';

describe('Admin Routes Integration Tests (Epic INK-61 & INK-65)', () => {
  let app: Hono;
  let superAdminToken: string;
  let regularUserToken: string;

  const mockPrisma: any = {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    organisation: {
      count: vi.fn(),
    },
    agreement: {
      count: vi.fn(),
    },
  };

  const mockConfigService: any = {
    getAllConfigs: vi.fn(),
    updateConfig: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    superAdminToken = await signJwt({
      sub: 'super-admin-1',
      email: 'root@graphsign.ink',
      orgId: 'system-org',
      role: 'super_admin',
    });

    regularUserToken = await signJwt({
      sub: 'user-1',
      email: 'user@acme.com',
      orgId: 'acme-org',
      role: 'user',
    });

    app = new Hono();
    app.onError(errorHandler);
    app.route(
      '/api/v1/admin',
      createAdminRoutes({
        prisma: mockPrisma,
        configService: mockConfigService,
      }),
    );
  });

  it('rejects access from non-super_admin with 403 Forbidden', async () => {
    const res = await app.request('/api/v1/admin/stats', {
      headers: { Authorization: `Bearer ${regularUserToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('GET /stats returns platform overview statistics', async () => {
    mockPrisma.user.count.mockResolvedValueOnce(42);
    mockPrisma.organisation.count.mockResolvedValueOnce(5);
    mockPrisma.agreement.count.mockResolvedValueOnce(120);
    mockPrisma.user.aggregate.mockResolvedValueOnce({
      _sum: { storageUsedBytes: 104857600n },
    });

    const res = await app.request('/api/v1/admin/stats', {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.totalUsers).toBe(42);
    expect(body.totalOrgs).toBe(5);
    expect(body.totalAgreements).toBe(120);
  });

  it('GET /users returns paginated list of system users with agreement summaries', async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([
      {
        id: 'usr-1',
        email: 'alice@example.com',
        name: 'Alice',
        role: 'admin',
        isActive: true,
        createdAt: new Date('2026-01-01'),
        organisation: { id: 'org-1', name: 'Acme Corp' },
        agreements: [{ id: 'ag-1', status: 'ACTIVE', isArchived: false, fileSize: 1024 }],
      },
    ]);
    mockPrisma.user.count.mockResolvedValueOnce(1);

    const res = await app.request('/api/v1/admin/users?page=1&limit=10', {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].email).toBe('alice@example.com');
    expect(body.items[0].agreementsSummary.total).toBe(1);
  });

  it('GET /platform-config returns platform configuration settings', async () => {
    mockConfigService.getAllConfigs.mockResolvedValueOnce({
      MAX_FILE_SIZE_MB: '25',
      ENABLE_REGISTRATION: 'true',
    });

    const res = await app.request('/api/v1/admin/platform-config', {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.MAX_FILE_SIZE_MB).toBe('25');
  });

  it('PUT /platform-config/:key updates configuration setting', async () => {
    mockConfigService.updateConfig.mockResolvedValueOnce({
      key: 'MAX_FILE_SIZE_MB',
      value: '50',
    });

    const res = await app.request('/api/v1/admin/platform-config/MAX_FILE_SIZE_MB', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value: '50' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.key).toBe('MAX_FILE_SIZE_MB');
    expect(mockConfigService.updateConfig).toHaveBeenCalledWith(
      'MAX_FILE_SIZE_MB',
      '50',
      'super-admin-1',
    );
  });
});
