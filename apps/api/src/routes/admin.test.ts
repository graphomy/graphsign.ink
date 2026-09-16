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

  const mockHealthService: any = {
    checkHealth: vi.fn(),
  };

  const mockMaintenanceService: any = {
    getMaintenanceState: vi.fn(),
    setMaintenanceState: vi.fn(),
  };

  const mockFeatureFlagService: any = {
    listFlags: vi.fn(),
    getFlag: vi.fn(),
    createFlag: vi.fn(),
    updateFlag: vi.fn(),
    deleteFlag: vi.fn(),
    setTenantOverride: vi.fn(),
    evaluateFlags: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockPrisma.organisation.findMany = vi.fn();
    mockPrisma.organisation.findUnique = vi.fn();
    mockPrisma.organisation.update = vi.fn();
    mockPrisma.auditLog = {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'log-1' }),
    };

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
        healthService: mockHealthService,
        maintenanceService: mockMaintenanceService,
        featureFlagService: mockFeatureFlagService,
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

  it('GET /health returns platform health status and metrics', async () => {
    mockHealthService.checkHealth.mockResolvedValueOnce({
      status: 'healthy',
      timestamp: '2026-09-16T12:00:00.000Z',
      database: { status: 'connected', latencyMs: 2 },
      uptimeSeconds: 3600,
      memory: { rssBytes: 100000000, heapUsedBytes: 50000000, heapTotalBytes: 80000000 },
    });

    const res = await app.request('/api/v1/admin/health', {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('healthy');
    expect(body.database.latencyMs).toBe(2);
  });

  it('GET /organisations returns paginated tenant directory', async () => {
    mockPrisma.organisation.findMany.mockResolvedValueOnce([
      {
        id: 'org-1',
        name: 'Acme Corp',
        slug: 'acme',
        status: 'ACTIVE',
        planType: 'teams',
        storageQuotaBytes: 1073741824n,
        storageUsedBytes: 10485760n,
        maxDocuments: 100,
        documentCount: 5,
        maxUsers: 50,
        sessionTimeoutMinutes: 60,
        mfaRequired: false,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        _count: { users: 10, agreements: 50 },
      },
    ]);
    mockPrisma.organisation.count.mockResolvedValueOnce(1);

    const res = await app.request('/api/v1/admin/organisations?page=1&limit=10', {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe('Acme Corp');
    expect(body.items[0].activeUsersCount).toBe(10);
  });

  it('POST /organisations/:id/override updates custom tenant limits', async () => {
    mockPrisma.organisation.findUnique.mockResolvedValueOnce({
      id: 'org-1',
      name: 'Acme Corp',
      maxUsers: 100,
    });
    mockPrisma.organisation.update.mockResolvedValueOnce({
      id: 'org-1',
      name: 'Acme Corp',
      maxUsers: 250,
    });

    const res = await app.request('/api/v1/admin/organisations/org-1/override', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        maxUsers: 250,
        reason: 'Upgrade enterprise quota',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.organisation.maxUsers).toBe(250);
  });

  it('POST /organisations/:id/suspend and /restore toggles suspension', async () => {
    mockPrisma.organisation.findUnique.mockResolvedValue({
      id: 'org-1',
      name: 'Acme Corp',
      status: 'ACTIVE',
    });
    mockPrisma.organisation.update.mockResolvedValue({
      id: 'org-1',
      name: 'Acme Corp',
      status: 'SUSPENDED',
    });

    const resSuspend = await app.request('/api/v1/admin/organisations/org-1/suspend', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Policy violation' }),
    });
    expect(resSuspend.status).toBe(200);
    expect(((await resSuspend.json()) as any).status).toBe('SUSPENDED');

    const resRestore = await app.request('/api/v1/admin/organisations/org-1/restore', {
      method: 'POST',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    expect(resRestore.status).toBe(200);
  });

  it('GET and POST /maintenance toggles platform maintenance mode', async () => {
    mockMaintenanceService.getMaintenanceState.mockResolvedValueOnce({
      isActive: false,
      message: null,
      scope: 'all',
      targetTenantId: null,
    });

    const resGet = await app.request('/api/v1/admin/maintenance', {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    expect(resGet.status).toBe(200);
    expect(((await resGet.json()) as any).isActive).toBe(false);

    mockMaintenanceService.setMaintenanceState.mockResolvedValueOnce({
      isActive: true,
      message: 'Scheduled maintenance',
      scope: 'all',
      targetTenantId: null,
      activatedBy: 'super-admin-1',
    });

    const resPost = await app.request('/api/v1/admin/maintenance', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        isActive: true,
        message: 'Scheduled maintenance',
        scope: 'all',
      }),
    });
    expect(resPost.status).toBe(200);
    expect(((await resPost.json()) as any).isActive).toBe(true);
  });

  it('Feature Flags API handles CRUD and tenant overrides', async () => {
    mockFeatureFlagService.listFlags.mockResolvedValueOnce([
      { key: 'qes_signatures', name: 'QES', isEnabled: true },
    ]);

    const resList = await app.request('/api/v1/admin/feature-flags', {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    expect(resList.status).toBe(200);
    expect(((await resList.json()) as any).flags).toHaveLength(1);

    mockFeatureFlagService.createFlag.mockResolvedValueOnce({
      key: 'test_flag',
      name: 'Test Flag',
      isEnabled: true,
    });

    const resCreate = await app.request('/api/v1/admin/feature-flags', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: 'test_flag',
        name: 'Test Flag',
        isEnabled: true,
      }),
    });
    expect(resCreate.status).toBe(201);

    mockFeatureFlagService.setTenantOverride.mockResolvedValueOnce({
      key: 'test_flag',
      tenantOverrides: { '00000000-0000-0000-0000-000000000001': false },
    });

    const resOverride = await app.request('/api/v1/admin/feature-flags/test_flag/override', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ organisationId: '00000000-0000-0000-0000-000000000001', isEnabled: false }),
    });
    expect(resOverride.status).toBe(200);
  });

  it('GET /audit-logs returns privileged platform audit logs', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValueOnce([
      {
        id: 'log-1',
        action: 'SUPER_ADMIN_MAINTENANCE_MODE_SET',
        resourceType: 'PlatformMaintenance',
        resourceId: 'maint-1',
        userId: 'super-admin-1',
        user: { email: 'root@graphsign.ink' },
        organisationId: '00000000-0000-0000-0000-000000000000',
        metadata: { isActive: true },
        createdAt: new Date('2026-09-16'),
      },
    ]);
    mockPrisma.auditLog.count.mockResolvedValueOnce(1);

    const res = await app.request('/api/v1/admin/audit-logs?page=1&limit=10', {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].action).toBe('SUPER_ADMIN_MAINTENANCE_MODE_SET');
  });
});
