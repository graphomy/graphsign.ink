import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplateService } from './template-service.js';

describe('TemplateService Unit Tests (Epic INK-11)', () => {
  let mockPrisma: any;
  let mockAudit: any;
  let service: TemplateService;

  beforeEach(() => {
    mockPrisma = {
      template: {
        create: vi.fn(),
        findFirst: vi.fn(),
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
      });

      expect(res.title).toBe('Master Service Template');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'TEMPLATE_CREATED' }),
      );
    });
  });

  describe('convertAgreementToTemplate (INK-73)', () => {
    it('should convert existing agreement to reusable template', async () => {
      mockPrisma.agreement.findFirst.mockResolvedValue({
        id: 'ag-1',
        organisationId: 'org-1',
        title: 'Original Agreement',
        htmlContent: '<p>Agreement terms</p>',
      });

      mockPrisma.template.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: data.id, ...data }),
      );

      const res = await service.convertAgreementToTemplate('org-1', 'user-1', {
        agreementId: 'ag-1',
        title: 'New Reusable Template',
      });

      expect(res.title).toBe('New Reusable Template');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AGREEMENT_CONVERTED_TO_TEMPLATE' }),
      );
    });
  });

  describe('createTemplateVersion (INK-74)', () => {
    it('should create new version revision and update template version number', async () => {
      mockPrisma.template.findFirst.mockResolvedValue({
        id: 'tpl-1',
        organisationId: 'org-1',
        version: 1,
        title: 'Employment Contract',
      });

      mockPrisma.templateVersion.create.mockResolvedValue({
        id: 'ver-2',
        templateId: 'tpl-1',
        version: 2,
        changeSummary: 'v2.0 revision',
      });

      mockPrisma.template.update.mockResolvedValue({
        id: 'tpl-1',
        version: 2,
      });

      const res = await service.createTemplateVersion('org-1', 'user-1', 'tpl-1', {
        changeSummary: 'Updated benefits section',
      });

      expect(res.version).toBe(2);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'TEMPLATE_VERSION_CREATED' }),
      );
    });
  });

  describe('shareTemplate (INK-75)', () => {
    it('should grant USE access to a target user or team', async () => {
      mockPrisma.template.findFirst.mockResolvedValue({
        id: 'tpl-1',
        organisationId: 'org-1',
      });

      mockPrisma.templateShare.upsert.mockResolvedValue({
        id: 'share-1',
        templateId: 'tpl-1',
        targetType: 'user',
        targetId: 'user-2',
        accessLevel: 'USE',
      });

      const res = await service.shareTemplate('org-1', 'user-1', 'tpl-1', {
        targetType: 'user',
        targetId: 'user-2',
        accessLevel: 'USE',
      });

      expect(res.accessLevel).toBe('USE');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'TEMPLATE_SHARED' }),
      );
    });
  });

  describe('publishTemplate (INK-76)', () => {
    it('should toggle isPublished flag to true', async () => {
      mockPrisma.template.findFirst.mockResolvedValue({
        id: 'tpl-1',
        organisationId: 'org-1',
      });

      mockPrisma.template.update.mockResolvedValue({
        id: 'tpl-1',
        isPublished: true,
      });

      const res = await service.publishTemplate('org-1', 'user-1', 'tpl-1', true);
      expect(res.isPublished).toBe(true);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'TEMPLATE_PUBLISHED' }),
      );
    });
  });

  describe('instantiateTemplate (INK-77)', () => {
    it('should create new agreement draft from template', async () => {
      mockPrisma.template.findFirst.mockResolvedValue({
        id: 'tpl-1',
        organisationId: 'org-1',
        title: 'Vendor NDA Template',
        version: 1,
        htmlContent: '<p>Vendor terms</p>',
      });

      mockPrisma.agreement.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: data.id, ...data }),
      );

      const res = await service.instantiateTemplate('org-1', 'user-1', 'tpl-1', {
        title: 'ACME Vendor NDA',
      });

      expect(res.title).toBe('ACME Vendor NDA');
      expect(res.status).toBe('DRAFT');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'TEMPLATE_INSTANTIATED' }),
      );
    });
  });
});
