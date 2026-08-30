import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchService, UserContext } from './search-service';

describe('SearchService Unit Tests (INK-117 to INK-122)', () => {
  let mockPrisma: any;
  let mockAudit: any;
  let service: SearchService;

  const mockAdminCtx: UserContext = {
    userId: 'admin-1',
    userEmail: 'admin@example.com',
    userName: 'Admin Alice',
    organisationId: 'org-1',
    role: 'org_admin',
    ipAddress: '127.0.0.1',
    userAgent: 'vitest-search-test',
  };

  const mockMemberCtx: UserContext = {
    userId: 'user-2',
    userEmail: 'bob@example.com',
    userName: 'Bob Member',
    organisationId: 'org-1',
    role: 'member',
    ipAddress: '127.0.0.1',
    userAgent: 'vitest-search-test',
  };

  const sampleAgreements = [
    {
      id: 'ag-1',
      organisationId: 'org-1',
      authorId: 'user-2',
      title: 'Employment Agreement 2026',
      description: 'Standard full-time employment contract',
      status: 'ACTIVE',
      fileUrl: 'https://files.com/contract.pdf',
      fileName: 'contract.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      markdownContent: null,
      version: '1.0',
      signingOrder: 'SEQUENTIAL',
      currentStep: 1,
      expiresAt: new Date(Date.now() + 86400000),
      isArchived: false,
      tags: ['hr', 'legal'],
      reviewerId: null,
      rejectionReason: null,
      createdAt: new Date('2026-01-15T10:00:00Z'),
      updatedAt: new Date('2026-01-20T12:00:00Z'),
      fields: null,
      author: { id: 'user-2', name: 'Bob Member', email: 'bob@example.com' },
      reviewer: null,
      recipients: [
        {
          id: 'recip-1',
          email: 'candidate@example.com',
          name: 'Jane Doe',
          role: 'SIGNER',
          status: 'PENDING',
          routingOrder: 1,
          viewedAt: null,
          signedAt: null,
        },
      ],
    },
    {
      id: 'ag-2',
      organisationId: 'org-1',
      authorId: 'admin-1',
      title: 'Vendor Master Agreement',
      description: 'Annual vendor procurement terms and SLA',
      status: 'SENT',
      fileUrl: null,
      fileName: 'vendor-agreement.md',
      fileSize: 512,
      mimeType: 'text/markdown',
      markdownContent: '# Vendor Terms',
      version: '1.0',
      signingOrder: 'PARALLEL',
      currentStep: 1,
      expiresAt: null,
      isArchived: false,
      tags: ['procurement', 'vendor'],
      reviewerId: null,
      rejectionReason: null,
      createdAt: new Date('2026-02-01T08:00:00Z'),
      updatedAt: new Date('2026-02-05T09:00:00Z'),
      fields: null,
      author: { id: 'admin-1', name: 'Admin Alice', email: 'admin@example.com' },
      reviewer: null,
      recipients: [
        {
          id: 'recip-2',
          email: 'vendor@supplier.com',
          name: 'Supplier Rep',
          role: 'SIGNER',
          status: 'VIEWED',
          routingOrder: 1,
          viewedAt: new Date(),
          signedAt: null,
        },
      ],
    },
  ];

  beforeEach(() => {
    mockPrisma = {
      agreement: {
        findMany: vi.fn().mockResolvedValue([...sampleAgreements]),
        count: vi.fn().mockResolvedValue(sampleAgreements.length),
      },
      template: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'tmpl-1',
            organisationId: 'org-1',
            title: 'NDA Template',
            description: 'Mutual non-disclosure agreement',
            version: 1,
            isPublished: true,
            isArchived: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            author: { id: 'admin-1', name: 'Admin Alice', email: 'admin@example.com' },
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
      searchFilterPreset: {
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...data,
            id: 'preset-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          id: 'preset-1',
          organisationId: 'org-1',
          userId: 'user-2',
          name: 'My Active PDFs',
          entityType: 'AGREEMENT',
          filters: { status: 'ACTIVE', documentType: 'pdf' },
          isDefault: false,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'preset-1', ...data })),
        delete: vi.fn().mockResolvedValue({ id: 'preset-1' }),
      },
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue({ id: 'audit-log-1' }),
    };

    service = new SearchService(mockPrisma, mockAudit);
  });

  describe('INK-117: Basic Search for Documents', () => {
    it('searches agreements with keyword across title, description, fileName, and content', async () => {
      const result = await service.searchAgreements(mockAdminCtx, {
        q: 'Employment',
        page: 1,
        limit: 20,
      });

      expect(mockPrisma.agreement.findMany).toHaveBeenCalled();
      const callArgs = mockPrisma.agreement.findMany.mock.calls[0][0];
      expect(callArgs.where.organisationId).toBe('org-1');
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.where.OR).toEqual(
        expect.arrayContaining([
          { title: { contains: 'Employment', mode: 'insensitive' } },
          { description: { contains: 'Employment', mode: 'insensitive' } },
          { fileName: { contains: 'Employment', mode: 'insensitive' } },
          { markdownContent: { contains: 'Employment', mode: 'insensitive' } },
        ]),
      );
      expect(result.data.length).toBe(2);
      expect(result.pagination.total).toBe(2);
      expect(result.queryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('logs search query to audit trail when keyword is provided (INK-122)', async () => {
      await service.searchAgreements(mockAdminCtx, { q: 'Procurement' });

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SEARCH_EXECUTED',
          resourceType: 'SEARCH',
          metadata: expect.objectContaining({
            keyword: 'Procurement',
            totalResults: 2,
          }),
        }),
      );
    });
  });

  describe('INK-118: Metadata Filters', () => {
    it('applies status filter for active agreements', async () => {
      await service.searchAgreements(mockAdminCtx, { status: 'ACTIVE' });
      const callArgs = mockPrisma.agreement.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toEqual({
        notIn: [
          'DRAFT',
          'IN_REVIEW',
          'REJECTED',
          'CANCELLED',
          'COMPLETED',
          'SEALED',
          'SIGNED',
          'VOIDED',
        ],
      });
    });

    it('applies status filter for draft agreements', async () => {
      await service.searchAgreements(mockAdminCtx, { status: 'DRAFT' });
      const callArgs = mockPrisma.agreement.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toEqual({
        in: ['DRAFT', 'IN_REVIEW', 'REJECTED', 'CANCELLED'],
      });
    });

    it('applies status filter for signed agreements (INK-271)', async () => {
      await service.searchAgreements(mockAdminCtx, { status: 'SIGNED' });
      const callArgs = mockPrisma.agreement.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toEqual({
        in: ['COMPLETED', 'SEALED', 'SIGNED'],
      });
    });

    it('applies datePreset filter (last_7_days)', async () => {
      await service.searchAgreements(mockAdminCtx, { datePreset: 'last_7_days' });
      const callArgs = mockPrisma.agreement.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt).toBeDefined();
      expect(callArgs.where.createdAt.gte).toBeInstanceOf(Date);
    });

    it('applies author filter by email/name', async () => {
      await service.searchAgreements(mockAdminCtx, { authorEmail: 'bob@example.com' });
      const callArgs = mockPrisma.agreement.findMany.mock.calls[0][0];
      expect(callArgs.where.author).toBeDefined();
    });

    it('applies recipient filter by email/name', async () => {
      await service.searchAgreements(mockAdminCtx, { recipientEmail: 'candidate@example.com' });
      const callArgs = mockPrisma.agreement.findMany.mock.calls[0][0];
      expect(callArgs.where.recipients).toBeDefined();
    });

    it('applies tags filter with JSON array contains', async () => {
      await service.searchAgreements(mockAdminCtx, { tag: 'legal' });
      const callArgs = mockPrisma.agreement.findMany.mock.calls[0][0];
      expect(callArgs.where.tags).toEqual({ array_contains: ['legal'] });
    });

    it('applies documentType filter for PDF', async () => {
      await service.searchAgreements(mockAdminCtx, { documentType: 'pdf' });
      const callArgs = mockPrisma.agreement.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeDefined();
    });
  });

  describe('INK-119: Combined Search & Strict Tenant Scoping', () => {
    it('scopes non-admin user queries to authored, reviewable, or recipient documents', async () => {
      await service.searchAgreements(mockMemberCtx, { q: 'Agreement', status: 'ACTIVE' });
      const callArgs = mockPrisma.agreement.findMany.mock.calls[0][0];

      expect(callArgs.where.organisationId).toBe('org-1');
      // Must have AND wrapping the RBAC OR and the keyword search OR
      expect(callArgs.where.AND).toBeDefined();
      expect(callArgs.where.AND.length).toBe(2);
    });

    it('allows admin users full workspace access without restricting to authorId', async () => {
      await service.searchAgreements(mockAdminCtx, { q: 'Agreement' });
      const callArgs = mockPrisma.agreement.findMany.mock.calls[0][0];
      expect(callArgs.where.organisationId).toBe('org-1');
      // No authorId/reviewerId restriction
      expect(callArgs.where.AND).toBeUndefined();
    });
  });

  describe('INK-120: Custom Filter Presets', () => {
    it('creates a custom filter preset for the user', async () => {
      const preset = await service.createFilterPreset(mockMemberCtx, {
        name: 'Pending Legal Reviews',
        entityType: 'AGREEMENT',
        filters: { status: 'IN_REVIEW', tag: 'legal' },
        isDefault: true,
      });

      expect(mockPrisma.searchFilterPreset.create).toHaveBeenCalled();
      expect(preset.name).toBe('Pending Legal Reviews');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SEARCH_PRESET_CREATED' }),
      );
    });

    it('lists saved filter presets for the user', async () => {
      mockPrisma.searchFilterPreset.findMany.mockResolvedValueOnce([
        { id: 'p-1', name: 'Preset 1', isDefault: true },
      ]);
      const presets = await service.listFilterPresets(mockMemberCtx, 'AGREEMENT');
      expect(presets.length).toBe(1);
    });

    it('deletes custom filter preset', async () => {
      const res = await service.deleteFilterPreset(mockMemberCtx, 'preset-1');
      expect(res.success).toBe(true);
      expect(mockPrisma.searchFilterPreset.delete).toHaveBeenCalledWith({
        where: { id: 'preset-1' },
      });
    });

    it('sets a filter preset as default', async () => {
      const updated = await service.setDefaultFilterPreset(mockMemberCtx, 'preset-1');
      expect(mockPrisma.searchFilterPreset.updateMany).toHaveBeenCalled();
      expect(updated.isDefault).toBe(true);
    });
  });

  describe('INK-121: Sorting Options', () => {
    it('sorts by title ascending', async () => {
      await service.searchAgreements(mockAdminCtx, {
        sortBy: 'title',
        sortOrder: 'asc',
      });
      const callArgs = mockPrisma.agreement.findMany.mock.calls[0][0];
      expect(callArgs.orderBy).toEqual({ title: 'asc' });
    });

    it('ranks results by relevance when sortBy=relevance and keyword is present', async () => {
      const res = await service.searchAgreements(mockAdminCtx, {
        q: 'Employment',
        sortBy: 'relevance',
      });
      // 'Employment Agreement 2026' has title match -> higher score
      expect(res.data[0]?.title).toContain('Employment');
    });
  });

  describe('INK-122: Suggestions, Empty States & Templates Search', () => {
    it('provides fuzzy "did you mean" suggestion on 0 results with typo keyword', async () => {
      mockPrisma.agreement.findMany
        .mockResolvedValueOnce([]) // 0 search results
        .mockResolvedValueOnce([{ title: 'Employment Agreement 2026' }]); // candidate query
      mockPrisma.agreement.count.mockResolvedValueOnce(0);

      const res = await service.searchAgreements(mockAdminCtx, {
        q: 'Employmnt', // typo
      });

      expect(res.pagination.total).toBe(0);
      expect(res.suggestion).toBe('employment');
    });

    it('searches templates library (FR-010.008)', async () => {
      const res = await service.searchTemplates(mockAdminCtx, {
        q: 'NDA',
        isPublished: true,
      });

      expect(mockPrisma.template.findMany).toHaveBeenCalled();
      expect(res.data.length).toBe(1);
    });

    it('performs global unified search across agreements and templates', async () => {
      const res = await service.searchGlobal(mockAdminCtx, {
        q: 'Agreement',
        entityType: 'all',
      });

      expect(res.agreements).toBeDefined();
      expect(res.templates).toBeDefined();
      expect(res.totalCount).toBeGreaterThan(0);
    });
  });
});
