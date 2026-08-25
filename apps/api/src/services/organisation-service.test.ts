import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrganisationService } from './organisation-service.js';
import type { AuditService } from './audit-service.js';
import type { MailerService } from './mailer-service.js';
import { ConflictError, ForbiddenError } from '../utils/errors.js';

describe('OrganisationService', () => {
  let mockPrisma: any;
  let mockAuditService: AuditService;
  let mockMailerService: MailerService;
  let service: OrganisationService;

  beforeEach(() => {
    mockPrisma = {
      organisation: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      user: {
        findFirst: vi.fn(),
        create: vi.fn(),
        count: vi.fn(),
      },
      organisationInvitation: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
    };

    mockAuditService = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    mockMailerService = {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
      sendEmailChangeVerificationEmail: vi.fn().mockResolvedValue(undefined),
      sendOrganisationInvitationEmail: vi.fn().mockResolvedValue(undefined),
      sendReviewRequestEmail: vi.fn().mockResolvedValue(undefined),
      sendReviewDecisionEmail: vi.fn().mockResolvedValue(undefined),
      sendSigningInvitationEmail: vi.fn().mockResolvedValue(undefined),
      sendReminderEmail: vi.fn().mockResolvedValue(undefined),
      sendAgreementCompletedEmail: vi.fn().mockResolvedValue(undefined),
      sendAgreementDeclinedEmail: vi.fn().mockResolvedValue(undefined),
      sendAgreementCancelledEmail: vi.fn().mockResolvedValue(undefined),
      sendExpiryWarningEmail: vi.fn().mockResolvedValue(undefined),
      sendAgreementExpiredEmail: vi.fn().mockResolvedValue(undefined),
    };

    service = new OrganisationService(mockPrisma, mockAuditService, mockMailerService);
  });

  describe('createOrganisation', () => {
    it('creates a new organisation and logs audit event', async () => {
      mockPrisma.organisation.findUnique.mockResolvedValue(null);
      mockPrisma.organisation.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...data, createdAt: new Date(), updatedAt: new Date() }),
      );

      const result = await service.createOrganisation(
        { name: 'Acme Inc', slug: 'acme-inc' },
        'user-123',
      );

      expect(result.name).toBe('Acme Inc');
      expect(result.slug).toBe('acme-inc');
      expect(result.status).toBe('active');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORGANISATION_CREATED',
          userId: 'user-123',
        }),
      );
    });

    it('throws ConflictError if slug is already taken', async () => {
      mockPrisma.organisation.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.createOrganisation({ name: 'Acme Inc', slug: 'acme-inc' }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('updateSettings', () => {
    it('updates organisation session timeout and logs audit event', async () => {
      const mockOrg = { id: 'org-1', name: 'Acme Inc', status: 'active' };
      mockPrisma.organisation.findUnique.mockResolvedValue(mockOrg);
      mockPrisma.organisation.update.mockResolvedValue({
        ...mockOrg,
        sessionTimeoutMinutes: 30,
      });

      const result = await service.updateSettings('org-1', 'user-1', {
        sessionTimeoutMinutes: 30,
      });

      expect(result.sessionTimeoutMinutes).toBe(30);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORGANISATION_SETTINGS_UPDATED',
        }),
      );
    });
  });

  describe('updateBranding', () => {
    it('updates branding properties and logs audit event', async () => {
      const mockOrg = { id: 'org-1', name: 'Acme Inc' };
      mockPrisma.organisation.findUnique.mockResolvedValue(mockOrg);
      mockPrisma.organisation.update.mockResolvedValue({
        ...mockOrg,
        primaryColor: '#0055ff',
      });

      const result = await service.updateBranding('org-1', 'user-1', {
        primaryColor: '#0055ff',
      });

      expect(result.primaryColor).toBe('#0055ff');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORGANISATION_BRANDING_UPDATED',
        }),
      );
    });
  });

  describe('getUsageSummary', () => {
    it('calculates metrics and percentage thresholds', async () => {
      const mockOrg = {
        id: 'org-1',
        name: 'Acme Inc',
        storageQuotaBytes: 1000n,
        storageUsedBytes: 850n,
        maxDocuments: 100,
        documentCount: 50,
        maxUsers: 50,
      };

      mockPrisma.organisation.findUnique.mockResolvedValue(mockOrg);
      mockPrisma.user.count.mockResolvedValue(5);
      mockPrisma.organisationInvitation.count.mockResolvedValue(2);

      const summary = await service.getUsageSummary('org-1');

      expect(summary.storageUsagePercent).toBe(85);
      expect(summary.isStorageNearLimit).toBe(true);
      expect(summary.isStorageLimitReached).toBe(false);
      expect(summary.activeUsersCount).toBe(5);
      expect(summary.pendingInvitationsCount).toBe(2);
    });
  });

  describe('inviteMember', () => {
    it('creates an invitation and dispatches an invitation email', async () => {
      mockPrisma.organisation.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme Inc' });
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.organisationInvitation.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.organisationInvitation.create.mockImplementation(({ data }: any) =>
        Promise.resolve(data),
      );

      const invitation = await service.inviteMember('org-1', 'admin-1', {
        email: 'newuser@example.com',
        role: 'author',
      });

      expect(invitation.email).toBe('newuser@example.com');
      expect(invitation.role).toBe('author');
      expect(mockMailerService.sendOrganisationInvitationEmail).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ORGANISATION_MEMBER_INVITED' }),
      );
    });

    it('throws ConflictError if user is already a member', async () => {
      mockPrisma.organisation.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme Inc' });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing-user-id' });

      await expect(
        service.inviteMember('org-1', 'admin-1', { email: 'existing@example.com', role: 'user' }),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('suspendOrganisation & restoreOrganisation', () => {
    it('suspends an active organisation', async () => {
      mockPrisma.organisation.findUnique.mockResolvedValue({ id: 'org-1', status: 'active' });
      mockPrisma.organisation.update.mockResolvedValue({ id: 'org-1', status: 'suspended' });

      const result = await service.suspendOrganisation('org-1', 'super-admin', 'Violation of TOC');
      expect(result.status).toBe('suspended');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ORGANISATION_SUSPENDED' }),
      );
    });

    it('restores a suspended organisation', async () => {
      mockPrisma.organisation.findUnique.mockResolvedValue({ id: 'org-1', status: 'suspended' });
      mockPrisma.organisation.update.mockResolvedValue({ id: 'org-1', status: 'active' });

      const result = await service.restoreOrganisation('org-1', 'super-admin');
      expect(result.status).toBe('active');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ORGANISATION_RESTORED' }),
      );
    });
  });

  describe('checkStorageQuota', () => {
    it('allows upload when within quota limit', async () => {
      mockPrisma.organisation.findUnique.mockResolvedValue({
        id: 'org-1',
        storageQuotaBytes: 1000n,
        storageUsedBytes: 500n,
      });

      await expect(service.checkStorageQuota('org-1', 200)).resolves.not.toThrow();
    });

    it('throws ForbiddenError when upload would exceed storage quota', async () => {
      mockPrisma.organisation.findUnique.mockResolvedValue({
        id: 'org-1',
        storageQuotaBytes: 1000n,
        storageUsedBytes: 900n,
      });

      await expect(service.checkStorageQuota('org-1', 200)).rejects.toThrow(ForbiddenError);
    });
  });
});
