import type { PrismaClient } from '@graphsign/db';
import { generateId } from '../utils/crypto.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
import type { AuditService } from './audit-service.js';
import type {
  CreateUploadAgreementInput,
  CreateScratchAgreementInput,
  UpdateDraftInput,
  UpdateMetadataTagsInput,
  QueryAgreementsInput,
} from '../validators/agreement-validators.js';

export class AgreementService {
  constructor(
    private prisma: PrismaClient,
    private audit?: AuditService,
  ) {}

  /**
   * Upload PDF/DOCX agreement file (FR-004.001 / INK-66)
   */
  async uploadAgreementFile(orgId: string, authorId: string, input: CreateUploadAgreementInput) {
    const agreementId = generateId();

    // Simulated storage URL (e.g. S3 / R2 Bucket)
    const fileUrl = `https://storage.graphsign.ink/${orgId}/agreements/${agreementId}-${input.fileName}`;

    const agreement = await this.prisma.agreement.create({
      data: {
        id: agreementId,
        organisationId: orgId,
        authorId,
        title: input.title,
        description: input.description,
        status: 'DRAFT',
        fileUrl,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        tags: input.tags ? (input.tags as any) : [],
        metadata: input.metadata ? (input.metadata as any) : {},
        version: 1,
        versions: {
          create: {
            id: generateId(),
            version: 1,
            title: input.title,
            fileUrl,
            changeSummary: 'Initial file upload v1.0',
            authorId,
          },
        },
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'AGREEMENT_UPLOADED',
        resourceType: 'Agreement',
        resourceId: agreementId,
        metadata: { fileName: input.fileName, fileSize: input.fileSize },
      });
    }

    return agreement;
  }

  /**
   * Create agreement from scratch using rich text HTML (FR-004.002 / INK-67)
   */
  async createFromScratch(orgId: string, authorId: string, input: CreateScratchAgreementInput) {
    const agreementId = generateId();
    const fileUrl = `https://storage.graphsign.ink/${orgId}/agreements/${agreementId}-scratch.pdf`;

    const agreement = await this.prisma.agreement.create({
      data: {
        id: agreementId,
        organisationId: orgId,
        authorId,
        title: input.title,
        description: input.description,
        status: 'DRAFT',
        htmlContent: input.htmlContent,
        fileUrl,
        fileName: `${input.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`,
        mimeType: 'application/pdf',
        tags: input.tags ? (input.tags as any) : [],
        metadata: input.metadata ? (input.metadata as any) : {},
        version: 1,
        versions: {
          create: {
            id: generateId(),
            version: 1,
            title: input.title,
            htmlContent: input.htmlContent,
            fileUrl,
            changeSummary: 'Initial draft created from scratch v1.0',
            authorId,
          },
        },
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'AGREEMENT_CREATED',
        resourceType: 'Agreement',
        resourceId: agreementId,
        metadata: { title: input.title },
      });
    }

    return agreement;
  }

  /**
   * Save and autosave agreement draft (FR-004.003 / INK-68)
   */
  async saveDraft(orgId: string, authorId: string, agreementId: string, input: UpdateDraftInput) {
    const existing = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Agreement not found.');
    }

    if (existing.status !== 'DRAFT') {
      throw new ForbiddenError(
        `Cannot edit agreement in '${existing.status}' status. Only DRAFT agreements can be edited.`,
      );
    }

    const updated = await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        title: input.title ?? existing.title,
        description: input.description ?? existing.description,
        htmlContent: input.htmlContent ?? existing.htmlContent,
        tags: input.tags ? (input.tags as any) : existing.tags,
        metadata: input.metadata ? (input.metadata as any) : existing.metadata,
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'AGREEMENT_DRAFT_UPDATED',
        resourceType: 'Agreement',
        resourceId: agreementId,
      });
    }

    return updated;
  }

  /**
   * Create new version of an agreement (FR-004.004 / INK-69)
   */
  async createVersion(
    orgId: string,
    authorId: string,
    agreementId: string,
    changeSummary?: string,
  ) {
    const existing = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Agreement not found.');
    }

    const nextVersionNum = existing.version + 1;

    const newVersion = await this.prisma.agreementVersion.create({
      data: {
        id: generateId(),
        agreementId,
        version: nextVersionNum,
        title: existing.title,
        fileUrl: existing.fileUrl,
        htmlContent: existing.htmlContent,
        changeSummary: changeSummary || `Version ${nextVersionNum}.0 revision`,
        authorId,
      },
    });

    await this.prisma.agreement.update({
      where: { id: agreementId },
      data: { version: nextVersionNum },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'AGREEMENT_VERSION_CREATED',
        resourceType: 'Agreement',
        resourceId: agreementId,
        metadata: { version: nextVersionNum },
      });
    }

    return newVersion;
  }

  /**
   * List version history of an agreement (FR-004.004 / INK-69)
   */
  async listVersions(orgId: string, agreementId: string) {
    const existing = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Agreement not found.');
    }

    return this.prisma.agreementVersion.findMany({
      where: { agreementId },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Clone agreement into a new draft (FR-004.005 / INK-70)
   */
  async cloneAgreement(orgId: string, authorId: string, agreementId: string) {
    const existing = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Agreement not found.');
    }

    const newAgreementId = generateId();

    const cloned = await this.prisma.agreement.create({
      data: {
        id: newAgreementId,
        organisationId: orgId,
        authorId,
        title: `[Copy] ${existing.title}`,
        description: existing.description,
        status: 'DRAFT',
        fileUrl: existing.fileUrl,
        fileName: existing.fileName,
        fileSize: existing.fileSize,
        mimeType: existing.mimeType,
        htmlContent: existing.htmlContent,
        tags: existing.tags ? (existing.tags as any) : [],
        metadata: existing.metadata ? (existing.metadata as any) : {},
        version: 1,
        versions: {
          create: {
            id: generateId(),
            version: 1,
            title: `[Copy] ${existing.title}`,
            fileUrl: existing.fileUrl,
            htmlContent: existing.htmlContent,
            changeSummary: `Cloned from agreement '${existing.title}' (${existing.id})`,
            authorId,
          },
        },
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'AGREEMENT_CLONED',
        resourceType: 'Agreement',
        resourceId: newAgreementId,
        metadata: { clonedFromId: agreementId },
      });
    }

    return cloned;
  }

  /**
   * Archive / Unarchive agreement (FR-004.006 / INK-71)
   */
  async setArchiveStatus(orgId: string, authorId: string, agreementId: string, archive: boolean) {
    const existing = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Agreement not found.');
    }

    const updated = await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        isArchived: archive,
        archivedAt: archive ? new Date() : null,
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: archive ? 'AGREEMENT_ARCHIVED' : 'AGREEMENT_UNARCHIVED',
        resourceType: 'Agreement',
        resourceId: agreementId,
      });
    }

    return updated;
  }

  /**
   * Update metadata and tags (FR-004.007 / INK-72)
   */
  async updateMetadataAndTags(
    orgId: string,
    authorId: string,
    agreementId: string,
    input: UpdateMetadataTagsInput,
  ) {
    const existing = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Agreement not found.');
    }

    const updated = await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        tags: input.tags ? (input.tags as any) : existing.tags,
        metadata: input.metadata ? (input.metadata as any) : existing.metadata,
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'AGREEMENT_METADATA_UPDATED',
        resourceType: 'Agreement',
        resourceId: agreementId,
      });
    }

    return updated;
  }

  /**
   * List agreements with filtering, pagination, and tag search
   */
  async listAgreements(orgId: string, query: QueryAgreementsInput) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      organisationId: orgId,
      deletedAt: null,
      isArchived: query.isArchived ?? false,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Filter by tag using Prisma JsonB array_contains
    if (query.tag) {
      where.tags = { array_contains: [query.tag] };
    }

    const [items, total] = await Promise.all([
      this.prisma.agreement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: { author: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.agreement.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
