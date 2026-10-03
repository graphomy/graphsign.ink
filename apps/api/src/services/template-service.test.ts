import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateService } from './template-service.js';
import { ForbiddenError } from '../utils/errors.js';

describe('TemplateService Unit Tests (Epic INK-11)', () => {
  let mockPrisma: any;
  let mockAudit: any;
  let service: TemplateService;

  beforeEach(() => {
    mockPrisma = {
      template: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      templateVersion: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
      templateShare: {
        upsert: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        delete: vi.fn(),
      },
      userOrganisation: {
        findFirst: vi.fn(),
      },
      teamMember: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      agreement: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(true),
    };

    service = new TemplateService(mockPrisma, mockAudit);
  });

  describe('createTemplate (INK-73)', () => {
    it('should create template draft and record audit log', async () => {
      mockPrisma.template.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: data.id, ...data }),
      );

      const res = await service.createTemplate('org-1', 'user-1', {
        title: 'Master Service Template',
        description: 'Reusable master services agreement',
        htmlContent: '<h1>MSA Template</h1>',
        fields: [{ id: 'sig-1', type: 'signature', page: 1 }],
      });

      expect(res.title).toBe('Master Service Template');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'TEMPLATE_CREATED' }),
      );
    });
  });

  describe('convertAgreementToTemplate (INK-73)', () => {
    it('should convert existing agreement to reusable template preserving fields', async () => {
      mockPrisma.agreement.findFirst.mockResolvedValue({
        id: 'ag-1',
        organisationId: 'org-1',
        title: 'Original Agreement',
        htmlContent: '<p>Agreement terms</p>',
        fields: [{ id: 'field-1', type: 'signature' }],
      });

      mockPrisma.template.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: data.id, ...data }),
      );

      const res = await service.convertAgreementToTemplate('org-1', 'user-1', {
        agreementId: 'ag-1',
        title: 'New Reusable Template',
      });

      expect(res.title).toBe('New Reusable Template');
      expect(res.fields).toEqual([{ id: 'field-1', type: 'signature' }]);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AGREEMENT_CONVERTED_TO_TEMPLATE' }),
      );
    });
  });

  describe('checkTemplateAccess (ACL & Security)', () => {
    it('should throw ForbiddenError when non-author without share tries to update draft', async () => {
      mockPrisma.template.findFirst.mockResolvedValue({
        id: 'tpl-1',
        organisationId: 'org-1',
        authorId: 'author-user',
        isPublished: false,
        shares: [],
      });
      mockPrisma.userOrganisation.findFirst.mockResolvedValue({ role: 'user' });

      await expect(
        service.updateTemplateDraft('org-1', 'unauthorized-user', 'tpl-1', {
          title: 'Hacked Title',
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError when user belongs to no team (INK-305)', async () => {
      mockPrisma.template.findFirst.mockResolvedValue({
        id: 'tpl-1',
        organisationId: 'org-1',
        authorId: 'author-user',
        shares: [],
      });
      mockPrisma.teamMember.findMany.mockResolvedValue([]);

      await expect(service.getTemplateById('org-1', 'viewer-user', 'tpl-1')).rejects.toThrow(
        'Access denied. You can only view templates shared within a team you belong to.',
      );
    });

    it('should throw ForbiddenError when user does not share a team with author (INK-305)', async () => {
      mockPrisma.template.findFirst.mockResolvedValue({
        id: 'tpl-1',
        organisationId: 'org-1',
        authorId: 'author-user',
        shares: [],
      });
      // User is in team-1, Author is in team-2
      mockPrisma.teamMember.findMany
        .mockResolvedValueOnce([{ teamId: 'team-1' }])
        .mockResolvedValueOnce([{ teamId: 'team-2' }]);

      await expect(service.getTemplateById('org-1', 'viewer-user', 'tpl-1')).rejects.toThrow(
        'Access denied. You can only view templates of authors who share a team with you.',
      );
    });

    it('should allow access when users share a team AND template is shared with that team (INK-305)', async () => {
      mockPrisma.template.findFirst.mockResolvedValue({
        id: 'tpl-1',
        organisationId: 'org-1',
        authorId: 'author-user',
        shares: [{ targetType: 'team', targetId: 'team-shared', accessLevel: 'READ' }],
      });
      mockPrisma.template.findUnique.mockResolvedValue({
        id: 'tpl-1',
        organisationId: 'org-1',
        title: 'Shared Template',
      });
      // Both in team-shared
      mockPrisma.teamMember.findMany
        .mockResolvedValueOnce([{ teamId: 'team-shared' }])
        .mockResolvedValueOnce([{ teamId: 'team-shared' }]);

      const res = await service.getTemplateById('org-1', 'viewer-user', 'tpl-1');
      expect(res?.id).toBe('tpl-1');
    });

    it('shareTemplate - throws ForbiddenError when sharing with team author does not belong to (INK-305)', async () => {
      mockPrisma.template.findFirst.mockResolvedValue({
        id: 'tpl-1',
        organisationId: 'org-1',
        authorId: 'author-user',
        shares: [],
      });
      // Author only in team-1
      mockPrisma.teamMember.findMany.mockResolvedValueOnce([{ teamId: 'team-1' }]);

      await expect(
        service.shareTemplate('org-1', 'author-user', 'tpl-1', {
          targetType: 'team',
          targetId: 'team-other',
          accessLevel: 'USE',
        }),
      ).rejects.toThrow('You can only share templates with teams you are a member of.');
    });
  });

  describe('instantiateTemplate (INK-77)', () => {
    it('should create new agreement draft preserving template fields layout and linking templateId', async () => {
      mockPrisma.template.findFirst.mockResolvedValue({
        id: 'tpl-1',
        organisationId: 'org-1',
        authorId: 'user-1',
        title: 'Vendor NDA Template',
        version: 1,
        htmlContent: '<p>Vendor terms</p>',
        fields: [{ id: 'sig-box', type: 'signature' }],
        shares: [],
      });

      mockPrisma.agreement.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: data.id, ...data }),
      );

      const res = await service.instantiateTemplate('org-1', 'user-1', 'tpl-1', {
        title: 'ACME Vendor NDA',
      });

      expect(res.title).toBe('ACME Vendor NDA');
      expect(res.templateId).toBe('tpl-1');
      expect(res.fields).toEqual([{ id: 'sig-box', type: 'signature' }]);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'TEMPLATE_INSTANTIATED' }),
      );
    });
  });
});
