import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { maintenanceMiddleware } from './maintenance-middleware.js';

describe('Maintenance Mode Middleware (FR-015.005 / .006)', () => {
  it('allows all requests when maintenance mode is inactive', async () => {
    const mockService: any = {
      getMaintenanceState: vi.fn().mockResolvedValue({ isActive: false }),
    };

    const app = new Hono();
    app.use('/api/v1/*', maintenanceMiddleware({ maintenanceService: mockService }));
    app.post('/api/v1/documents', (c) => c.json({ ok: true }));

    const res = await app.request('/api/v1/documents', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('allows read-only GET requests with header during active maintenance', async () => {
    const mockService: any = {
      getMaintenanceState: vi.fn().mockResolvedValue({
        isActive: true,
        message: 'System upgrade in progress',
      }),
    };

    const app = new Hono();
    app.use('/api/v1/*', maintenanceMiddleware({ maintenanceService: mockService }));
    app.get('/api/v1/documents', (c) => c.json({ items: [] }));

    const res = await app.request('/api/v1/documents', { method: 'GET' });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Maintenance-Mode')).toBe('active');
  });

  it('blocks state-mutating POST/PATCH/DELETE requests with 503 during active maintenance', async () => {
    const mockService: any = {
      getMaintenanceState: vi.fn().mockResolvedValue({
        isActive: true,
        message: 'Platform scheduled maintenance',
      }),
    };

    const app = new Hono();
    app.use('/api/v1/*', maintenanceMiddleware({ maintenanceService: mockService }));
    app.post('/api/v1/agreements', (c) => c.json({ ok: true }));

    const res = await app.request('/api/v1/agreements', { method: 'POST' });
    expect(res.status).toBe(503);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('MAINTENANCE_MODE');
    expect(body.error.message).toContain('Platform scheduled maintenance');
  });

  it('exempts super_admin users from maintenance blocks', async () => {
    const mockService: any = {
      getMaintenanceState: vi.fn().mockResolvedValue({
        isActive: true,
        message: 'Platform scheduled maintenance',
      }),
    };

    const app = new Hono();
    // Simulate setting super_admin userPayload
    app.use('/api/v1/*', async (c, next) => {
      c.set('userPayload' as any, { role: 'super_admin' });
      await next();
    });
    app.use('/api/v1/*', maintenanceMiddleware({ maintenanceService: mockService }));
    app.post('/api/v1/agreements', (c) => c.json({ created: true }));

    const res = await app.request('/api/v1/agreements', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Maintenance-Mode')).toBe('superadmin-bypass');
  });
});
