import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createOrganisationRoutes } from './organisations.js';
import { signJwt } from '../utils/jwt.js';

import { errorHandler } from '../middleware/error-handler.js';

describe('Organisation Routes', () => {
  let mockOrganisationService: any;
  let app: Hono;
  let validJwtToken: string;

  beforeEach(async () => {
    mockOrganisationService = {
      createOrganisation: vi.fn(),
      getOrganisationById: vi.fn(),
      updateSettings: vi.fn(),
      updateBranding: vi.fn(),
      updateComplianceSettings: vi.fn(),
      getUsageSummary: vi.fn(),
      inviteMember: vi.fn(),
      getInvitationDetails: vi.fn(),
      acceptInvitation: vi.fn(),
      listInvitations: vi.fn(),
      revokeInvitation: vi.fn(),
      suspendOrganisation: vi.fn(),
      restoreOrganisation: vi.fn(),
    };

    const routes = createOrganisationRoutes({
      organisationService: mockOrganisationService as any,
    });

    app = new Hono();
    app.onError(errorHandler);
    app.route('/api/v1/organisations', routes);

    validJwtToken = await signJwt({
      sub: '00000000-0000-7000-8000-000000000001',
      orgId: '00000000-0000-7000-8000-000000000002',
      email: 'admin@acme.com',
      role: 'org_admin',
      jti: '00000000-0000-7000-8000-000000000003',
    });
  });

  describe('POST /api/v1/organisations', () => {
    it('creates an organisation for authenticated user', async () => {
      mockOrganisationService.createOrganisation.mockResolvedValue({
        id: 'org-456',
        name: 'Globex Corp',
        slug: 'globex-corp',
        status: 'active',
        createdAt: new Date(),
      });

      const res = await app.request('/api/v1/organisations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validJwtToken}`,
        },
        body: JSON.stringify({
          name: 'Globex Corp',
          slug: 'globex-corp',
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.id).toBe('org-456');
      expect(json.name).toBe('Globex Corp');
    });

    it('rejects unauthenticated requests', async () => {
      const res = await app.request('/api/v1/organisations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Test Org' }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/organisations/me/usage', () => {
    it('returns usage summary and includes header warning if storage near limit', async () => {
      mockOrganisationService.getOrganisationById.mockResolvedValue({
        id: 'org-123',
        status: 'active',
      });
      mockOrganisationService.getUsageSummary.mockResolvedValue({
        organisationId: 'org-123',
        organisationName: 'Acme Inc',
        storageQuotaBytes: '1000',
        storageUsedBytes: '850',
        storageUsagePercent: 85,
        maxDocuments: 100,
        documentCount: 50,
        documentUsagePercent: 50,
        maxUsers: 50,
        activeUsersCount: 5,
        pendingInvitationsCount: 2,
        isStorageNearLimit: true,
        isStorageLimitReached: false,
        isDocumentLimitReached: false,
      });

      const res = await app.request('/api/v1/organisations/me/usage', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${validJwtToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('X-Quota-Warning')).toBeTruthy();
      const json = await res.json();
      expect(json.storageUsagePercent).toBe(85);
    });
  });

  describe('POST /api/v1/organisations/invitations', () => {
    it('sends member invitation', async () => {
      mockOrganisationService.getOrganisationById.mockResolvedValue({
        id: 'org-123',
        status: 'active',
      });
      mockOrganisationService.inviteMember.mockResolvedValue({
        id: 'inv-123',
        email: 'invited@example.com',
        role: 'author',
        status: 'pending',
        expiresAt: new Date(),
      });

      const res = await app.request('/api/v1/organisations/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validJwtToken}`,
        },
        body: JSON.stringify({
          email: 'invited@example.com',
          role: 'author',
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.id).toBe('inv-123');
      expect(json.email).toBe('invited@example.com');
    });
  });
});
