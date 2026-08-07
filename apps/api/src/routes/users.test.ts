import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createUserRoutes } from './users.js';
import { signJwt } from '../utils/jwt.js';

describe('User Role Assignment Routes Integration Tests (INK-62 & INK-64)', () => {
  let app: any;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      userOrganisation: {
        updateMany: vi.fn(),
      },
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(true),
    };

    app = createUserRoutes({ prisma: mockPrisma, audit: mockAudit });
  });

  it('PUT /:id/role should assign role and return 200', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'target-10',
      email: 'bob@acme.com',
      role: 'user',
    });
    mockPrisma.user.update.mockResolvedValue({
      id: 'target-10',
      email: 'bob@acme.com',
      role: 'sender',
    });

    const token = await signJwt(
      { sub: 'admin-1', email: 'admin@acme.com', role: 'org_admin' },
      'secret',
    );

    const res = await app.request('/target-10/role', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role: 'sender' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.role).toBe('sender');
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_ROLE_UPDATED',
        resourceId: 'target-10',
      }),
    );
  });

  it('PUT /:id/role should return 403 when non-kunal attempts to assign super_admin', async () => {
    const token = await signJwt(
      { sub: 'admin-1', email: 'imposter@acme.com', role: 'org_admin' },
      'secret',
    );

    const res = await app.request('/target-10/role', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role: 'super_admin' }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain('kunal@graphomy.com');
  });
});
