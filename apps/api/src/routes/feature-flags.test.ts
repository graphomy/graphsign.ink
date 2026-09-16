import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { createFeatureFlagRoutes } from './feature-flags.js';
import { signJwt } from '../utils/jwt.js';

describe('Feature Flags Route (FR-015.007)', () => {
  it('returns evaluated feature flags for requesting tenant', async () => {
    const token = await signJwt({
      sub: 'user-1',
      email: 'user@acme.com',
      orgId: 'org-123',
      role: 'user',
    });

    const mockService: any = {
      evaluateFlagsForTenant: vi.fn().mockResolvedValue({
        qes_signatures: true,
        custom_branding: false,
      }),
    };

    const app = new Hono();
    app.route(
      '/api/v1/feature-flags',
      createFeatureFlagRoutes({
        featureFlagService: mockService,
      }),
    );

    const res = await app.request('/api/v1/feature-flags', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.flags.qes_signatures).toBe(true);
    expect(mockService.evaluateFlagsForTenant).toHaveBeenCalledWith('org-123');
  });
});
