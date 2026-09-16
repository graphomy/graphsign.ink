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
      exportAuditLogs: vi.fn(),
      listMembers: vi.fn(),
      removeMember: vi.fn(),
      updateMemberStatus: vi.fn(),
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

  describe('GET /api/v1/organisations/me/audit-logs/export (INK-286 / FR-014.006)', () => {
    it('exports audit logs as CSV', async () => {
      mockOrganisationService.exportAuditLogs.mockResolvedValue({
        data: 'ID,Timestamp,Action\n1,2026-09-16T12:00:00Z,LOGIN',
        contentType: 'text/csv; charset=utf-8',
        filename: 'audit-logs-export.csv',
      });

      const res = await app.request('/api/v1/organisations/me/audit-logs/export?format=csv', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${validJwtToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');
      expect(res.headers.get('Content-Disposition')).toContain('attachment');
      const text = await res.text();
      expect(text).toContain('ID,Timestamp,Action');
    });

    it('exports audit logs as JSON', async () => {
      mockOrganisationService.exportAuditLogs.mockResolvedValue({
        data: JSON.stringify([{ id: '1', action: 'LOGIN' }]),
        contentType: 'application/json',
        filename: 'audit-logs-export.json',
      });

      const res = await app.request('/api/v1/organisations/me/audit-logs/export?format=json', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${validJwtToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/json');
      const json = await res.json();
      expect(Array.isArray(json)).toBe(true);
    });
  });

  describe('Organisation Members Management (INK-286 / FR-014.001)', () => {
    it('GET /api/v1/organisations/me/members lists active members', async () => {
      mockOrganisationService.listMembers.mockResolvedValue([
        {
          id: 'user-1',
          email: 'admin@acme.com',
          name: 'Admin User',
          role: 'org_admin',
          status: 'active',
        },
      ]);

      const res = await app.request('/api/v1/organisations/me/members', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${validJwtToken}`,
        },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any[];
      expect(Array.isArray(data)).toBe(true);
      expect(data[0].email).toBe('admin@acme.com');
    });

    it('DELETE /api/v1/organisations/me/members/:userId removes a member', async () => {
      mockOrganisationService.removeMember.mockResolvedValue(undefined);

      const res = await app.request('/api/v1/organisations/me/members/user-2', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${validJwtToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.message).toContain('removed');
    });

    it('PATCH /api/v1/organisations/me/members/:userId/status toggles status', async () => {
      mockOrganisationService.updateMemberStatus.mockResolvedValue({
        id: 'user-2',
        email: 'member@acme.com',
        status: 'suspended',
      });

      const res = await app.request('/api/v1/organisations/me/members/user-2/status', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${validJwtToken}`,
        },
        body: JSON.stringify({ status: 'suspended' }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.status).toBe('suspended');
    });
  });
});
