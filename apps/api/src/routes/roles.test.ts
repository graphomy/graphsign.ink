import { describe, it, expect, beforeEach } from 'vitest';
import { createRoleRoutes } from './roles.js';

describe('Role Routes Integration Tests (INK-61 & INK-65)', () => {
  let app: any;

  beforeEach(() => {
    app = createRoleRoutes({ prisma: {} as any });
  });

  it('GET /default should return 7 core default roles', async () => {
    const res = await app.request('/default');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveLength(7);
    expect(body.map((r: any) => r.id)).toContain('super_admin');
  });

  it('GET /permissions should return atomic permissions registry', async () => {
    const res = await app.request('/permissions');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.permissions['DOCUMENTS_READ']).toBe('documents:read');
    expect(body.permissions['SUPER_ADMIN_MANAGE']).toBe('super_admin:manage');
  });
});
