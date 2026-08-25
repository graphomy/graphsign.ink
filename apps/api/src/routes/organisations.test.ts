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
      deleteOrganisation: vi.fn(),
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
      createTeam: vi.fn(),
      listTeams: vi.fn(),
      addTeamMember: vi.fn(),
      removeTeamMember: vi.fn(),
      updateMemberRole: vi.fn(),
      createCustomRole: vi.fn(),
      listCustomRoles: vi.fn(),
      getAuditLogs: vi.fn(),
      getUserOrganisations: vi.fn(),
      addDomain: vi.fn(),
      verifyDomain: vi.fn(),
      listDomains: vi.fn(),
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

  describe('POST /api/v1/organisations (INK-49)', () => {
    it('creates an organisation for authenticated user', async () => {
      mockOrganisationService.createOrganisation.mockResolvedValue({
        id: '00000000-0000-7000-8000-000000000004',
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
      const json = (await res.json()) as any;
      expect(json.name).toBe('Globex Corp');
    });
  });

  describe('DELETE /api/v1/organisations/me (INK-51)', () => {
    it('soft deletes organisation', async () => {
      mockOrganisationService.deleteOrganisation.mockResolvedValue(undefined);

      const res = await app.request('/api/v1/organisations/me', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${validJwtToken}`,
        },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/v1/organisations/teams (INK-52 & INK-53)', () => {
    it('creates a team and lists teams', async () => {
      mockOrganisationService.createTeam.mockResolvedValue({
        id: '00000000-0000-7000-8000-000000000005',
        name: 'Engineering',
      });

      const res = await app.request('/api/v1/organisations/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validJwtToken}`,
        },
        body: JSON.stringify({
          name: 'Engineering',
          description: 'Dev team',
        }),
      });

      expect(res.status).toBe(201);
    });
  });

  describe('POST /api/v1/organisations/domains (INK-60)', () => {
    it('adds a custom domain for verification', async () => {
      mockOrganisationService.addDomain.mockResolvedValue({
        id: '00000000-0000-7000-8000-000000000006',
        domain: 'acme.graphomy.com',
        verificationToken: 'graphsign-verify=123',
        status: 'pending',
      });

      const res = await app.request('/api/v1/organisations/domains', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validJwtToken}`,
        },
        body: JSON.stringify({
          domain: 'acme.graphomy.com',
        }),
      });

      expect(res.status).toBe(201);
    });
  });

  describe('GET & PATCH /api/v1/organisations/me/notifications (INK-114)', () => {
    it('retrieves notification trigger settings', async () => {
      mockOrganisationService.getNotificationSettings = vi.fn().mockResolvedValue({
        sendReminders: true,
        reminderFrequencyDays: 3,
        sendExpiryWarnings: true,
        sendCompletionEmails: true,
        customFooterText: null,
      });

      const res = await app.request('/api/v1/organisations/me/notifications', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${validJwtToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.sendReminders).toBe(true);
      expect(data.reminderFrequencyDays).toBe(3);
    });

    it('updates notification trigger settings', async () => {
      mockOrganisationService.updateNotificationSettings = vi.fn().mockResolvedValue({
        sendReminders: false,
        reminderFrequencyDays: 5,
        sendExpiryWarnings: true,
        sendCompletionEmails: true,
        customFooterText: 'Official document from Acme',
      });

      const res = await app.request('/api/v1/organisations/me/notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validJwtToken}`,
        },
        body: JSON.stringify({
          sendReminders: false,
          reminderFrequencyDays: 5,
          customFooterText: 'Official document from Acme',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.sendReminders).toBe(false);
      expect(data.reminderFrequencyDays).toBe(5);
    });
  });
});
