import { describe, it, expect, beforeEach } from 'vitest';
import { createRoleRoutes } from './roles.js';
import { signJwt } from '../utils/jwt.js';

describe('Role Routes Integration Tests (INK-61 & INK-65)', () => {
  let app: any;
  let token: string;

  beforeEach(async () => {
    token = await signJwt({
      sub: 'user-123',
      email: 'admin@acme.com',
      orgId: 'org-123',
      role: 'org_admin',
    });
    app = createRoleRoutes({ prisma: {} as any });
  });

  it('GET /default should return 8 core default roles', async () => {
    const res = await app.request('/default', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveLength(8);
    expect(body.map((r: any) => r.id)).toContain('super_admin');
    expect(body.map((r: any) => r.id)).toContain('user');
  });

  it('GET /permissions should return atomic permissions registry', async () => {
    const res = await app.request('/permissions', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.permissions['DOCUMENTS_READ']).toBe('documents:read');
    expect(body.permissions['SUPER_ADMIN_MANAGE']).toBe('super_admin:manage');
  });
});
