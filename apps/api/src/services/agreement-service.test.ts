import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgreementService } from './agreement-service.js';
import { ForbiddenError } from '../utils/errors.js';

describe('AgreementService Unit Tests (Epic INK-8)', () => {
  let mockPrisma: any;
  let mockAudit: any;
  let service: AgreementService;

  beforeEach(() => {
    mockPrisma = {
      agreement: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      agreementVersion: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(true),
    };

    service = new AgreementService(mockPrisma, mockAudit);
  });

  describe('uploadAgreementFile (INK-66)', () => {
    it('should create agreement draft from file upload and log audit event', async () => {
      mockPrisma.agreement.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: data.id, ...data }),
      );

      const res = await service.uploadAgreementFile('org-1', 'user-1', {
        title: 'Vendor Contract',
        fileName: 'vendor.pdf',
        fileSize: 500000,
        mimeType: 'application/pdf',
      });

      expect(res.title).toBe('Vendor Contract');
      expect(res.status).toBe('DRAFT');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AGREEMENT_UPLOADED' }),
      );
    });
  });

  describe('createFromScratch (INK-67)', () => {
    it('should create agreement draft from scratch HTML', async () => {
      mockPrisma.agreement.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: data.id, ...data }),
      );

      const res = await service.createFromScratch('org-1', 'user-1', {
        title: 'Custom Agreement',
        htmlContent: '<p>Custom agreement terms</p>',
      });

      expect(res.title).toBe('Custom Agreement');
      expect(res.htmlContent).toBe('<p>Custom agreement terms</p>');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AGREEMENT_CREATED' }),
      );
    });
  });

  describe('saveDraft (INK-68)', () => {
    it('should update draft if status is DRAFT', async () => {
      mockPrisma.agreement.findFirst.mockResolvedValue({
        id: 'ag-1',
        organisationId: 'org-1',
        status: 'DRAFT',
        title: 'Old Title',
      });

      mockPrisma.agreement.update.mockResolvedValue({
        id: 'ag-1',
        title: 'New Title',
        status: 'DRAFT',
      });

      const res = await service.saveDraft('org-1', 'user-1', 'ag-1', { title: 'New Title' });
      expect(res.title).toBe('New Title');
    });

    it('should throw ForbiddenError if status is not DRAFT', async () => {
      mockPrisma.agreement.findFirst.mockResolvedValue({
        id: 'ag-1',
        organisationId: 'org-1',
        status: 'COMPLETED',
      });

      await expect(
        service.saveDraft('org-1', 'user-1', 'ag-1', { title: 'New Title' }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('cloneAgreement (INK-70)', () => {
    it('should clone existing agreement into a new draft', async () => {
      mockPrisma.agreement.findFirst.mockResolvedValue({
        id: 'ag-orig',
        organisationId: 'org-1',
        title: 'Standard Agreement',
        fileUrl: 'https://storage/orig.pdf',
      });

      mockPrisma.agreement.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: data.id, ...data }),
      );

      const res = await service.cloneAgreement('org-1', 'user-1', 'ag-orig');
      expect(res.title).toBe('[Copy] Standard Agreement');
      expect(res.status).toBe('DRAFT');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AGREEMENT_CLONED' }),
      );
    });
  });

  describe('setArchiveStatus (INK-71)', () => {
    it('should archive agreement', async () => {
      mockPrisma.agreement.findFirst.mockResolvedValue({
        id: 'ag-1',
        organisationId: 'org-1',
      });

      mockPrisma.agreement.update.mockResolvedValue({
        id: 'ag-1',
        isArchived: true,
      });

      const res = await service.setArchiveStatus('org-1', 'user-1', 'ag-1', true);
      expect(res.isArchived).toBe(true);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AGREEMENT_ARCHIVED' }),
      );
    });
  });
});
