import type { PrismaClient } from '@graphsign/db';
import { generateId } from '../utils/crypto.js';
import { NotFoundError } from '../utils/errors.js';
import type { AuditService } from './audit-service.js';
import type {
  CreateTemplateInput,
  ConvertAgreementToTemplateInput,
  UpdateTemplateDraftInput,
  CreateTemplateVersionInput,
  ShareTemplateInput,
  InstantiateTemplateInput,
  QueryTemplatesInput,
} from '../validators/template-validators.js';

export class TemplateService {
  constructor(
    private prisma: PrismaClient,
    private audit?: AuditService,
  ) {}

  /**
   * Create a new template from scratch (FR-005.001 / INK-73)
   */
  async createTemplate(orgId: string, authorId: string, input: CreateTemplateInput) {
    const templateId = generateId();

    const template = await this.prisma.template.create({
      data: {
        id: templateId,
        organisationId: orgId,
        authorId,
        title: input.title,
        description: input.description,
        fileUrl: input.fileName
          ? `https://storage.graphsign.ink/${orgId}/templates/${templateId}-${input.fileName}`
          : null,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        htmlContent: input.htmlContent,
        fields: input.fields ? (input.fields as any) : [],
        tags: input.tags ? (input.tags as any) : [],
        metadata: input.metadata ? (input.metadata as any) : {},
        version: 1,
        versions: {
          create: {
            id: generateId(),
            version: 1,
            title: input.title,
            htmlContent: input.htmlContent,
            fields: input.fields ? (input.fields as any) : [],
            changeSummary: 'Initial template draft created v1.0',
            authorId,
          },
        },
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'TEMPLATE_CREATED',
        resourceType: 'Template',
        resourceId: templateId,
        metadata: { title: input.title },
      });
    }

    return template;
  }

  /**
   * Convert an existing agreement into a reusable template (FR-005.001 / INK-73)
   */
  async convertAgreementToTemplate(
    orgId: string,
    authorId: string,
    input: ConvertAgreementToTemplateInput,
  ) {
    const agreement = await this.prisma.agreement.findFirst({
      where: { id: input.agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!agreement) {
      throw new NotFoundError('Source agreement not found.');
    }

    const templateId = generateId();

    const template = await this.prisma.template.create({
      data: {
        id: templateId,
        organisationId: orgId,
        authorId,
        title: input.title || `[Template] ${agreement.title}`,
        description: input.description || agreement.description,
        fileUrl: agreement.fileUrl,
        fileName: agreement.fileName,
        fileSize: agreement.fileSize,
        mimeType: agreement.mimeType,
        htmlContent: agreement.htmlContent,
        tags: input.tags ? (input.tags as any) : agreement.tags,
        metadata: agreement.metadata ? (agreement.metadata as any) : {},
        version: 1,
        versions: {
          create: {
            id: generateId(),
            version: 1,
            title: input.title || `[Template] ${agreement.title}`,
            fileUrl: agreement.fileUrl,
            htmlContent: agreement.htmlContent,
            changeSummary: `Converted from agreement '${agreement.title}' (${agreement.id})`,
            authorId,
          },
        },
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'AGREEMENT_CONVERTED_TO_TEMPLATE',
        resourceType: 'Template',
        resourceId: templateId,
        metadata: { sourceAgreementId: agreement.id },
      });
    }

    return template;
  }

  /**
   * Save template draft updates (FR-005.001 / INK-73)
   */
  async updateTemplateDraft(
    orgId: string,
    authorId: string,
    templateId: string,
    input: UpdateTemplateDraftInput,
  ) {
    const existing = await this.prisma.template.findFirst({
      where: { id: templateId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Template not found.');
    }

    const updated = await this.prisma.template.update({
      where: { id: templateId },
      data: {
        title: input.title ?? existing.title,
        description: input.description ?? existing.description,
        htmlContent: input.htmlContent ?? existing.htmlContent,
        fields: input.fields ? (input.fields as any) : existing.fields,
        tags: input.tags ? (input.tags as any) : existing.tags,
        metadata: input.metadata ? (input.metadata as any) : existing.metadata,
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'TEMPLATE_UPDATED',
        resourceType: 'Template',
        resourceId: templateId,
      });
    }

    return updated;
  }

  /**
   * Version template — creates new immutable version revision (FR-005.002 / INK-74)
   */
  async createTemplateVersion(
    orgId: string,
    authorId: string,
    templateId: string,
    input: CreateTemplateVersionInput,
  ) {
    const existing = await this.prisma.template.findFirst({
      where: { id: templateId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Template not found.');
    }

    const nextVersionNum = existing.version + 1;

    const newVersion = await this.prisma.templateVersion.create({
      data: {
        id: generateId(),
        templateId,
        version: nextVersionNum,
        title: existing.title,
        fileUrl: existing.fileUrl,
        htmlContent: input.htmlContent ?? existing.htmlContent,
        fields: input.fields ? (input.fields as any) : existing.fields,
        changeSummary: input.changeSummary || `Version ${nextVersionNum}.0 revision`,
        authorId,
      },
    });

    await this.prisma.template.update({
      where: { id: templateId },
      data: {
        version: nextVersionNum,
        htmlContent: input.htmlContent ?? existing.htmlContent,
        fields: input.fields ? (input.fields as any) : existing.fields,
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'TEMPLATE_VERSION_CREATED',
        resourceType: 'Template',
        resourceId: templateId,
        metadata: { version: nextVersionNum },
      });
    }

    return newVersion;
  }

  /**
   * List template version history (FR-005.002 / INK-74)
   */
  async listVersions(orgId: string, templateId: string) {
    const existing = await this.prisma.template.findFirst({
      where: { id: templateId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Template not found.');
    }

    return this.prisma.templateVersion.findMany({
      where: { templateId },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Share template with user or team (Template ACL) (FR-005.003 / INK-75)
   */
  async shareTemplate(
    orgId: string,
    authorId: string,
    templateId: string,
    input: ShareTemplateInput,
  ) {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, organisationId: orgId, deletedAt: null },
    });

    if (!template) {
      throw new NotFoundError('Template not found.');
    }

    const shareId = generateId();

    const share = await this.prisma.templateShare.upsert({
      where: {
        templateId_targetType_targetId: {
          templateId,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      },
      update: {
        accessLevel: input.accessLevel,
      },
      create: {
        id: shareId,
        templateId,
        targetType: input.targetType,
        targetId: input.targetId,
        accessLevel: input.accessLevel,
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'TEMPLATE_SHARED',
        resourceType: 'Template',
        resourceId: templateId,
        metadata: {
          targetType: input.targetType,
          targetId: input.targetId,
          accessLevel: input.accessLevel,
        },
      });
    }

    return share;
  }

  /**
   * List template shares (FR-005.003 / INK-75)
   */
  async listShares(orgId: string, templateId: string) {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, organisationId: orgId, deletedAt: null },
    });

    if (!template) {
      throw new NotFoundError('Template not found.');
    }

    return this.prisma.templateShare.findMany({
      where: { templateId },
    });
  }

  /**
   * Revoke template share (FR-005.003 / INK-75)
   */
  async removeShare(orgId: string, authorId: string, templateId: string, shareId: string) {
    const share = await this.prisma.templateShare.findFirst({
      where: { id: shareId, templateId },
    });

    if (!share) {
      throw new NotFoundError('Template share record not found.');
    }

    await this.prisma.templateShare.delete({ where: { id: shareId } });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'TEMPLATE_SHARE_REVOKED',
        resourceType: 'Template',
        resourceId: templateId,
        metadata: { shareId },
      });
    }

    return { message: 'Template share access revoked successfully.' };
  }

  /**
   * Publish / Unpublish template organization-wide (FR-005.004 / INK-76)
   */
  async publishTemplate(orgId: string, authorId: string, templateId: string, isPublished: boolean) {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, organisationId: orgId, deletedAt: null },
    });

    if (!template) {
      throw new NotFoundError('Template not found.');
    }

    const updated = await this.prisma.template.update({
      where: { id: templateId },
      data: {
        isPublished,
        publishedAt: isPublished ? new Date() : null,
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: isPublished ? 'TEMPLATE_PUBLISHED' : 'TEMPLATE_UNPUBLISHED',
        resourceType: 'Template',
        resourceId: templateId,
      });
    }

    return updated;
  }

  /**
   * Instantiate an agreement draft from a template (FR-005.005 / INK-77)
   */
  async instantiateTemplate(
    orgId: string,
    userId: string,
    templateId: string,
    input: InstantiateTemplateInput,
  ) {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, organisationId: orgId, deletedAt: null },
    });

    if (!template) {
      throw new NotFoundError('Template not found.');
    }

    const agreementId = generateId();

    const agreement = await this.prisma.agreement.create({
      data: {
        id: agreementId,
        organisationId: orgId,
        authorId: userId,
        title: input.title || `[Draft] ${template.title}`,
        description: input.description || template.description,
        status: 'DRAFT',
        fileUrl: template.fileUrl,
        fileName: template.fileName,
        fileSize: template.fileSize,
        mimeType: template.mimeType,
        htmlContent: template.htmlContent,
        tags: template.tags ? (template.tags as any) : [],
        metadata: {
          instantiatedFromTemplateId: template.id,
          templateVersion: template.version,
        },
        version: 1,
        versions: {
          create: {
            id: generateId(),
            version: 1,
            title: input.title || `[Draft] ${template.title}`,
            fileUrl: template.fileUrl,
            htmlContent: template.htmlContent,
            changeSummary: `Instantiated from template '${template.title}' v${template.version}.0`,
            authorId: userId,
          },
        },
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId,
        action: 'TEMPLATE_INSTANTIATED',
        resourceType: 'Agreement',
        resourceId: agreementId,
        metadata: { templateId: template.id, templateVersion: template.version },
      });
    }

    return agreement;
  }

  /**
   * List and search template library (FR-005.005 / INK-77)
   */
  async listTemplates(orgId: string, userId: string, query: QueryTemplatesInput) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      organisationId: orgId,
      deletedAt: null,
      isArchived: query.isArchived ?? false,
    };

    if (query.view === 'mine') {
      where.authorId = userId;
    } else if (query.view === 'library') {
      where.isPublished = true;
    } else if (query.view === 'shared') {
      where.shares = {
        some: {
          OR: [
            { targetType: 'user', targetId: userId },
            // Could match team members if team IDs resolved
          ],
        },
      };
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.tag) {
      where.tags = { array_contains: [query.tag] };
    }

    const [items, total] = await Promise.all([
      this.prisma.template.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          author: { select: { id: true, name: true, email: true } },
          shares: true,
        },
      }),
      this.prisma.template.count({ where }),
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
