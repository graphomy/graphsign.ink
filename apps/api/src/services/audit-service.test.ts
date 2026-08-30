import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaAuditService } from './audit-service.js';

describe('PrismaAuditService Unit Tests (Security & Compliance)', () => {
  let auditService: PrismaAuditService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    };
    auditService = new PrismaAuditService(mockPrisma as any);
  });

  it('creates genesis audit event when no prior events exist for the organisation', async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValueOnce(null);
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    await auditService.log({
      organisationId: 'org-genesis',
      userId: 'usr-1',
      action: 'agreement.created',
      resourceType: 'agreement',
      resourceId: 'agr-1',
      metadata: { title: 'NDA' },
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    });

    expect(mockPrisma.auditLog.findFirst).toHaveBeenCalledWith({
      where: { organisationId: 'org-genesis' },
      orderBy: { createdAt: 'desc' },
      select: { currentHash: true },
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organisationId: 'org-genesis',
        userId: 'usr-1',
        action: 'agreement.created',
        resourceType: 'agreement',
        resourceId: 'agr-1',
        previousHash: null,
        currentHash: expect.any(String),
      }),
    });
  });

  it('chains previous hash when prior audit events exist for the organisation', async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValueOnce({
      currentHash: 'previous-sha256-hash',
    });
    mockPrisma.auditLog.create.mockResolvedValueOnce({});

    await auditService.log({
      organisationId: 'org-chained',
      userId: 'usr-2',
      action: 'agreement.signed',
      resourceType: 'agreement',
      resourceId: 'agr-2',
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organisationId: 'org-chained',
        previousHash: 'previous-sha256-hash',
        currentHash: expect.any(String),
      }),
    });
  });
});
