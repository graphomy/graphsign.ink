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
      auditLog: {
        findMany: vi.fn(),
      },
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(true),
    };

    service = new AgreementService(mockPrisma, mockAudit);
  });

  describe('uploadAgreementFile (INK-66)', () => {
    it('should create ACTIVE agreement at v1.0 when PDF is uploaded', async () => {
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
      expect(res.status).toBe('ACTIVE');
      expect(res.version).toBe('1.0');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AGREEMENT_UPLOADED' }),
      );
    });

    it('should create DRAFT agreement at v0.1 when Markdown file is uploaded', async () => {
      mockPrisma.agreement.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: data.id, ...data }),
      );

      const res = await service.uploadAgreementFile('org-1', 'user-1', {
        title: 'Draft Agreement',
        fileName: 'contract.md',
        fileSize: 5000,
        mimeType: 'text/markdown',
        markdownContent: '# Draft Contract\n\nTerms',
      });

      expect(res.title).toBe('Draft Agreement');
      expect(res.status).toBe('DRAFT');
      expect(res.version).toBe('0.1');
      expect(res.markdownContent).toBe('# Draft Contract\n\nTerms');
    });
  });

  describe('createFromScratch (INK-67)', () => {
    it('should create agreement draft at v0.1 from scratch Markdown', async () => {
      mockPrisma.agreement.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: data.id, ...data }),
      );

      const res = await service.createFromScratch('org-1', 'user-1', {
        title: 'Custom Agreement',
        markdownContent: '# Custom Agreement Terms\n\n- Term 1\n- Term 2',
      });

      expect(res.title).toBe('Custom Agreement');
      expect(res.version).toBe('0.1');
      expect(res.status).toBe('DRAFT');
      expect(res.markdownContent).toBe('# Custom Agreement Terms\n\n- Term 1\n- Term 2');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AGREEMENT_CREATED' }),
      );
    });
  });

  describe('saveDraft (INK-68)', () => {
    it('should update draft and bump minor version (0.1 -> 0.2)', async () => {
      mockPrisma.agreement.findFirst.mockResolvedValue({
        id: 'ag-1',
        organisationId: 'org-1',
        status: 'DRAFT',
        version: '0.1',
        title: 'Old Title',
        markdownContent: '# Old Content',
      });

      mockPrisma.agreement.update.mockResolvedValue({
        id: 'ag-1',
        title: 'New Title',
        status: 'DRAFT',
        version: '0.2',
        markdownContent: '# New Content',
      });

      const res = await service.saveDraft('org-1', 'user-1', 'ag-1', {
        title: 'New Title',
        markdownContent: '# New Content',
      });

      expect(res.title).toBe('New Title');
      expect(res.version).toBe('0.2');
      expect(mockPrisma.agreementVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            version: '0.2',
            changeSummary: 'Draft updated to v0.2',
          }),
        }),
      );
    });

    it('should throw ForbiddenError if status is not DRAFT', async () => {
      mockPrisma.agreement.findFirst.mockResolvedValue({
        id: 'ag-1',
        organisationId: 'org-1',
        status: 'ACTIVE',
        version: '1.0',
      });

      await expect(
        service.saveDraft('org-1', 'user-1', 'ag-1', { title: 'New Title' }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('activateAgreement', () => {
    it('should transition draft to ACTIVE and bump to major version (0.2 -> 1.0)', async () => {
      mockPrisma.agreement.findFirst.mockResolvedValue({
        id: 'ag-1',
        organisationId: 'org-1',
        status: 'DRAFT',
        version: '0.2',
        title: 'Final NDA',
      });

      mockPrisma.agreement.update.mockResolvedValue({
        id: 'ag-1',
        title: 'Final NDA',
        status: 'ACTIVE',
        version: '1.0',
      });

      const res = await service.activateAgreement('org-1', 'user-1', 'ag-1', {
        comment: 'Ready for signatures',
      });

      expect(res.status).toBe('ACTIVE');
      expect(res.version).toBe('1.0');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AGREEMENT_ACTIVATED',
          metadata: expect.objectContaining({ version: '1.0', prevVersion: '0.2' }),
        }),
      );
    });
  });

  describe('getAgreementHistory', () => {
    it('should return concise formatted history entries', async () => {
      mockPrisma.agreement.findFirst.mockResolvedValue({
        id: 'ag-1',
        organisationId: 'org-1',
        title: 'NDA Agreement',
      });

      mockPrisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-3',
          action: 'AGREEMENT_ACTIVATED',
          metadata: { version: '1.0' },
          createdAt: new Date('2026-08-14T00:00:00Z'),
          user: { id: 'u-1', name: 'Alice Smith', email: 'alice@graphsign.ink' },
        },
        {
          id: 'log-2',
          action: 'AGREEMENT_DRAFT_UPDATED',
          metadata: { version: '0.2' },
          createdAt: new Date('2026-08-13T23:30:00Z'),
          user: { id: 'u-1', name: 'Alice Smith', email: 'alice@graphsign.ink' },
        },
        {
          id: 'log-1',
          action: 'AGREEMENT_CREATED',
          metadata: { version: '0.1' },
          createdAt: new Date('2026-08-13T23:00:00Z'),
          user: { id: 'u-1', name: 'Alice Smith', email: 'alice@graphsign.ink' },
        },
      ]);

      const history = await service.getAgreementHistory('org-1', 'ag-1');
      expect(history).toHaveLength(3);
      expect(history[0]?.summary).toBe('Moved to active (v1.0)');
      expect(history[1]?.summary).toBe('Updated to v0.2');
      expect(history[2]?.summary).toBe('Created draft v0.1');
    });
  });

  describe('cloneAgreement (INK-70)', () => {
    it('should clone existing agreement into a new draft at v0.1', async () => {
      mockPrisma.agreement.findFirst.mockResolvedValue({
        id: 'ag-orig',
        organisationId: 'org-1',
        title: 'Standard Agreement',
        fileUrl: 'https://storage/orig.pdf',
        markdownContent: '# Standard Terms',
      });

      mockPrisma.agreement.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: data.id, ...data }),
      );

      const res = await service.cloneAgreement('org-1', 'user-1', 'ag-orig');
      expect(res.title).toBe('[Copy] Standard Agreement');
      expect(res.status).toBe('DRAFT');
      expect(res.version).toBe('0.1');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'AGREEMENT_CLONED' }),
      );
    });
  });

  describe('Privacy & Data Isolation (INK-248)', () => {
    it('listAgreements - restricts regular users to their own authored agreements', async () => {
      mockPrisma.agreement.findMany.mockResolvedValue([
        { id: 'ag-1', title: 'My Agreement', authorId: 'user-1' },
      ]);
      mockPrisma.agreement.count.mockResolvedValue(1);

      const res = await service.listAgreements(
        'org-1',
        { page: 1, limit: 20 },
        'user-1',
        'user',
      );

      expect(res.items).toHaveLength(1);
      expect(mockPrisma.agreement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organisationId: 'org-1',
            authorId: 'user-1',
          }),
        }),
      );
    });

    it('listAgreements - allows org_admin to view all organisation agreements without author scoping', async () => {
      mockPrisma.agreement.findMany.mockResolvedValue([
        { id: 'ag-1', title: 'User 1 Agreement', authorId: 'user-1' },
        { id: 'ag-2', title: 'User 2 Agreement', authorId: 'user-2' },
      ]);
      mockPrisma.agreement.count.mockResolvedValue(2);

      const res = await service.listAgreements(
        'org-1',
        { page: 1, limit: 20 },
        'admin-user',
        'org_admin',
      );

      expect(res.items).toHaveLength(2);
      expect(mockPrisma.agreement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            authorId: expect.anything(),
          }),
        }),
      );
    });

    it('getAgreementById - allows author to access their own agreement', async () => {
      mockPrisma.agreement.findFirst.mockResolvedValue({
        id: 'ag-1',
        organisationId: 'org-1',
        authorId: 'user-1',
        title: 'User 1 Document',
      });

      const res = await service.getAgreementById('org-1', 'ag-1', 'user-1', 'user');
      expect(res.id).toBe('ag-1');
    });

    it('getAgreementById - throws ForbiddenError when non-admin accesses another user agreement', async () => {
      mockPrisma.agreement.findFirst.mockResolvedValue({
        id: 'ag-1',
        organisationId: 'org-1',
        authorId: 'user-1',
        title: 'User 1 Document',
      });

      await expect(
        service.getAgreementById('org-1', 'ag-1', 'user-2', 'user'),
      ).rejects.toThrow(ForbiddenError);
    });

    it('saveDraft - throws ForbiddenError when non-admin edits another user draft', async () => {
      mockPrisma.agreement.findFirst.mockResolvedValue({
        id: 'ag-1',
        organisationId: 'org-1',
        authorId: 'user-1',
        status: 'DRAFT',
        version: '0.1',
      });

      await expect(
        service.saveDraft(
          'org-1',
          'user-2',
          'ag-1',
          { title: 'Hacked Title' },
          'user',
        ),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
