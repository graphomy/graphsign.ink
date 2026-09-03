import type { PrismaClient } from '@graphsign/db';
import { generateId, generateToken, hashToken } from '../utils/crypto.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ValidationError,
} from '../utils/errors.js';
import type { AuditService } from './audit-service.js';
import { incrementMinorVersion, bumpToMajorVersion } from '../utils/version-utils.js';
import type {
  CreateUploadAgreementInput,
  CreateScratchAgreementInput,
  UpdateDraftInput,
  ActivateAgreementInput,
  UpdateMetadataTagsInput,
  QueryAgreementsInput,
} from '../validators/agreement-validators.js';
import type { SaveDocumentFieldsInput } from '../validators/field-validators.js';

/** Default estimated size for scratch/markdown-created agreements (10 KB). */
const DEFAULT_SCRATCH_SIZE_BYTES = 10 * 1024;

export interface HistoryItem {
  id: string;
  action: string;
  summary: string;
  version?: string;
  user: {
    id?: string;
    name?: string;
    email?: string;
  };
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export class AgreementService {
  constructor(
    private prisma: PrismaClient,
    private audit?: AuditService,
  ) {}

  /**
   * Checks per-user storage quota sufficiency (INK-206).
   * Throws ForbiddenError with user-friendly message if quota would be exceeded.
   */
  private async checkUserStorageQuota(userId: string, additionalBytes: number): Promise<void> {
    if (!this.prisma.user) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { storageQuotaBytes: true, storageUsedBytes: true, email: true },
    });

    if (!user) {
      return;
    }

    const quotaBytes = user.storageQuotaBytes ?? 262144000n;
    const usedBytes = user.storageUsedBytes ?? 0n;
    const newTotal = usedBytes + BigInt(additionalBytes);

    if (quotaBytes > 0n && newTotal > quotaBytes) {
      const quotaMB = Number(quotaBytes) / (1024 * 1024);
      const usedMB = (Number(usedBytes) / (1024 * 1024)).toFixed(1);
      throw new ForbiddenError(
        `You have reached your storage limit of ${quotaMB} MB (${usedMB} MB used). ` +
          'Please delete existing documents to free up space, or contact your administrator to increase your storage quota.',
      );
    }
  }

  /**
   * Updates per-user storage usage after a successful upload (INK-206).
   */
  private async updateUserStorageUsage(userId: string, additionalBytes: number): Promise<void> {
    if (!this.prisma.user) return;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        storageUsedBytes: { increment: BigInt(additionalBytes) },
      },
    });
  }

  /**
   * Upload PDF/DOCX or MD agreement file (FR-004.001 / INK-66)
   * - PDF/DOCX: Active agreement with version 1.0 (converted to PDF representation)
   * - MD: Draft agreement with version 0.1
   */
  async uploadAgreementFile(orgId: string, authorId: string, input: CreateUploadAgreementInput) {
    if (input.isEncrypted) {
      throw new BadRequestError(
        'The uploaded document is encrypted or password-protected. Please unlock or decrypt the document before uploading.',
      );
    }

    // Enforce user storage quota (INK-206)
    if (authorId !== 'unknown') {
      await this.checkUserStorageQuota(authorId, input.fileSize);
    }

    const isMarkdown =
      input.mimeType === 'text/markdown' ||
      input.mimeType === 'text/plain' ||
      input.fileName.toLowerCase().endsWith('.md');

    // PDF / DOCX are active documents at version 1.0; MD is draft at version 0.1
    const status = isMarkdown ? 'DRAFT' : 'ACTIVE';
    const version = isMarkdown ? '0.1' : '1.0';

    const agreementId = generateId();
    // Simulated storage / PDF conversion URL
    const cleanFileName = input.fileName.toLowerCase().replace(/[^a-z0-9.]/g, '-');
    const pdfFileName = isMarkdown
      ? `${cleanFileName.replace(/\.md$/i, '')}.pdf`
      : cleanFileName.endsWith('.pdf')
        ? cleanFileName
        : `${cleanFileName.replace(/\.[^/.]+$/, '')}.pdf`;

    const fileUrl = `https://storage.graphsign.ink/${orgId}/agreements/${agreementId}-${pdfFileName}`;

    const agreement = await this.prisma.agreement.create({
      data: {
        id: agreementId,
        organisationId: orgId,
        authorId,
        title: input.title,
        description: input.description,
        status,
        fileUrl,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: isMarkdown ? 'text/markdown' : 'application/pdf',
        markdownContent: input.markdownContent,
        tags: input.tags ? (input.tags as any) : [],
        metadata: {
          ...((input.metadata as any) || {}),
          ...(input.fileBase64 ? { fileData: input.fileBase64 } : {}),
        },
        version,
        versions: {
          create: {
            id: generateId(),
            version,
            title: input.title,
            fileUrl,
            markdownContent: input.markdownContent,
            changeSummary: isMarkdown
              ? 'Uploaded markdown draft v0.1'
              : 'Uploaded active document v1.0',
            authorId,
          },
        },
      },
    });

    if (authorId !== 'unknown') {
      await this.updateUserStorageUsage(authorId, input.fileSize);
    }

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'AGREEMENT_UPLOADED',
        resourceType: 'Agreement',
        resourceId: agreementId,
        metadata: {
          fileName: input.fileName,
          fileSize: input.fileSize,
          version,
          status,
        },
      });
    }

    // Strip large fileData binary from the returned agreement object to keep response lightweight (<1KB)
    const { metadata, ...rest } = agreement;
    const cleanMetadata =
      metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};
    delete cleanMetadata.fileData;
    delete cleanMetadata.fileBase64;

    return {
      ...rest,
      metadata: cleanMetadata,
    };
  }

  /**
   * Create agreement from scratch using Markdown format (FR-004.002 / INK-67)
   * Initial version: 0.1, status: DRAFT
   */
  async createFromScratch(orgId: string, authorId: string, input: CreateScratchAgreementInput) {
    const estimatedSizeBytes = input.markdownContent
      ? Buffer.byteLength(input.markdownContent, 'utf8')
      : DEFAULT_SCRATCH_SIZE_BYTES;

    if (authorId !== 'unknown') {
      await this.checkUserStorageQuota(authorId, estimatedSizeBytes);
    }

    const agreementId = generateId();
    const cleanTitle = input.title.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const fileUrl = `https://storage.graphsign.ink/${orgId}/agreements/${agreementId}-${cleanTitle}.pdf`;

    const agreement = await this.prisma.agreement.create({
      data: {
        id: agreementId,
        organisationId: orgId,
        authorId,
        title: input.title,
        description: input.description,
        status: 'DRAFT',
        markdownContent: input.markdownContent,
        fileUrl,
        fileName: `${cleanTitle}.pdf`,
        fileSize: estimatedSizeBytes,
        mimeType: 'application/pdf',
        tags: input.tags ? (input.tags as any) : [],
        metadata: input.metadata ? (input.metadata as any) : {},
        version: '0.1',
        versions: {
          create: {
            id: generateId(),
            version: '0.1',
            title: input.title,
            markdownContent: input.markdownContent,
            fileUrl,
            changeSummary: 'Initial draft created from scratch v0.1',
            authorId,
          },
        },
      },
    });

    if (authorId !== 'unknown') {
      await this.updateUserStorageUsage(authorId, estimatedSizeBytes);
    }

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'AGREEMENT_CREATED',
        resourceType: 'Agreement',
        resourceId: agreementId,
        metadata: { title: input.title, version: '0.1' },
      });
    }

    return agreement;
  }

  /**
   * Save and autosave agreement draft (FR-004.003 / INK-68)
   * Automatically increments minor version (e.g. 0.1 -> 0.2)
   */
  async saveDraft(
    orgId: string,
    authorId: string,
    agreementId: string,
    input: UpdateDraftInput,
    userRole?: string,
  ) {
    const existing = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Agreement not found.');
    }

    if (
      userRole &&
      userRole !== 'org_admin' &&
      userRole !== 'admin' &&
      userRole !== 'super_admin' &&
      authorId !== 'unknown' &&
      existing.authorId !== authorId
    ) {
      throw new ForbiddenError('You do not have permission to edit this agreement.');
    }

    if (existing.status !== 'DRAFT') {
      throw new ForbiddenError(
        `Cannot edit agreement in '${existing.status}' status. Only DRAFT agreements can be edited.`,
      );
    }

    const nextVersion = incrementMinorVersion(existing.version);

    const updated = await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        title: input.title ?? existing.title,
        description: input.description ?? existing.description,
        markdownContent: input.markdownContent ?? existing.markdownContent,
        tags: input.tags ? (input.tags as any) : existing.tags,
        metadata: input.metadata ? (input.metadata as any) : existing.metadata,
        version: nextVersion,
      },
    });

    // Create version snapshot
    await this.prisma.agreementVersion.create({
      data: {
        id: generateId(),
        agreementId,
        version: nextVersion,
        title: updated.title,
        fileUrl: updated.fileUrl,
        markdownContent: updated.markdownContent,
        changeSummary: `Draft updated to v${nextVersion}`,
        authorId,
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'AGREEMENT_DRAFT_UPDATED',
        resourceType: 'Agreement',
        resourceId: agreementId,
        metadata: {
          version: nextVersion,
          prevVersion: existing.version,
        },
      });
    }

    return updated;
  }

  /**
   * Move agreement from DRAFT to ACTIVE
   * Bumps version to next major version (e.g., 0.1/0.2 -> 1.0, 1.3 -> 2.0)
   */
  async activateAgreement(
    orgId: string,
    authorId: string,
    agreementId: string,
    input?: ActivateAgreementInput,
    userRole?: string,
  ) {
    const existing = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Agreement not found.');
    }

    if (
      userRole &&
      userRole !== 'org_admin' &&
      userRole !== 'admin' &&
      userRole !== 'super_admin' &&
      authorId !== 'unknown' &&
      existing.authorId !== authorId
    ) {
      throw new ForbiddenError('You do not have permission to activate this agreement.');
    }

    if (existing.status === 'ACTIVE') {
      return existing;
    }

    const nextMajor = bumpToMajorVersion(existing.version);

    const updated = await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: 'ACTIVE',
        version: nextMajor,
      },
    });

    await this.prisma.agreementVersion.create({
      data: {
        id: generateId(),
        agreementId,
        version: nextMajor,
        title: updated.title,
        fileUrl: updated.fileUrl,
        markdownContent: updated.markdownContent,
        changeSummary: input?.comment || `Moved to active (v${nextMajor})`,
        authorId,
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'AGREEMENT_ACTIVATED',
        resourceType: 'Agreement',
        resourceId: agreementId,
        metadata: {
          version: nextMajor,
          prevVersion: existing.version,
          comment: input?.comment,
        },
      });
    }

    return updated;
  }

  /**
   * Get single agreement by ID (INK-248 scoped for privacy)
   */
  async getAgreementById(orgId: string, agreementId: string, userId?: string, userRole?: string) {
    const agreement = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
      include: { author: { select: { id: true, name: true, email: true } } },
    });

    if (!agreement) {
      throw new NotFoundError('Agreement not found.');
    }

    // Non-admin users can only view their own agreements or agreements assigned to them for review (INK-248, INK-263)
    if (
      userRole &&
      userRole !== 'org_admin' &&
      userRole !== 'admin' &&
      userRole !== 'super_admin' &&
      userId &&
      userId !== 'unknown' &&
      agreement.authorId !== userId &&
      agreement.reviewerId !== userId
    ) {
      throw new ForbiddenError('You do not have permission to access this agreement.');
    }

    return agreement;
  }

  /**
   * Get concise history timeline for an agreement
   */
  async getAgreementHistory(
    orgId: string,
    agreementId: string,
    userId?: string,
    userRole?: string,
  ): Promise<HistoryItem[]> {
    const agreement = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!agreement) {
      throw new NotFoundError('Agreement not found.');
    }

    if (
      userRole &&
      userRole !== 'org_admin' &&
      userRole !== 'admin' &&
      userRole !== 'super_admin' &&
      userId &&
      userId !== 'unknown' &&
      agreement.authorId !== userId
    ) {
      throw new ForbiddenError('You do not have permission to access this agreement history.');
    }

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        organisationId: orgId,
        resourceType: { in: ['Agreement', 'agreement'] },
        resourceId: agreementId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const history: HistoryItem[] = auditLogs.map((log) => {
      const meta = (log.metadata as Record<string, any>) || {};
      let summary = 'Updated agreement';

      switch (log.action) {
        case 'AGREEMENT_CREATED':
          summary = `Created draft v${meta.version || '0.1'}`;
          break;
        case 'AGREEMENT_UPLOADED':
          summary =
            meta.status === 'ACTIVE'
              ? `Uploaded active document v${meta.version || '1.0'}`
              : `Uploaded markdown draft v${meta.version || '0.1'}`;
          break;
        case 'AGREEMENT_DRAFT_UPDATED':
          summary = `Updated to v${meta.version || '0.2'}`;
          break;
        case 'AGREEMENT_ACTIVATED':
          summary = `Moved to active (v${meta.version || '1.0'})`;
          break;
        case 'AGREEMENT_ARCHIVED':
          summary = 'Moved to archive';
          break;
        case 'AGREEMENT_UNARCHIVED':
          summary = 'Unarchived agreement';
          break;
        case 'AGREEMENT_CLONED':
          summary = 'Cloned agreement';
          break;
        case 'AGREEMENT_SUBMITTED_FOR_REVIEW':
        case 'SUBMITTED_FOR_REVIEW':
          summary = `Submitted for review${meta.reviewerEmail ? ` to ${meta.reviewerEmail}` : ''}`;
          break;
        case 'AGREEMENT_REVIEW_APPROVED':
        case 'REVIEW_APPROVED':
          summary = `Review approved${meta.note ? `: "${meta.note}"` : ''}`;
          break;
        case 'AGREEMENT_REVIEW_REJECTED':
        case 'REVIEW_REJECTED':
          summary = `Review rejected${meta.note ? `: "${meta.note}"` : ''}`;
          break;
        case 'AGREEMENT_REVIEW_RETRACTED':
        case 'REVIEW_RETRACTED':
          summary = 'Review request retracted';
          break;
        case 'AGREEMENT_SENT_FOR_SIGNATURE':
        case 'SENT_FOR_SIGNATURE':
          summary = `Sent for signature${meta.recipientCount ? ` to ${meta.recipientCount} recipient(s)` : ''}`;
          break;
        case 'AGREEMENT_REMINDER_SENT':
        case 'REMINDER_SENT':
          summary = `Signature reminder sent${meta.recipientEmail ? ` to ${meta.recipientEmail}` : ''}`;
          break;
        case 'AGREEMENT_SEALED':
        case 'SEALED':
          summary = `Cryptographically sealed (${meta.padesLevel || 'PAdES-B-T'})`;
          break;
        case 'RECIPIENT_SIGNED':
        case 'SIGNATURE_ADOPTED':
          summary = `Signed by ${meta.signerEmail || meta.signerName || 'recipient'}`;
          break;
        case 'AGREEMENT_VOIDED':
        case 'VOIDED':
          summary = `Voided agreement${meta.reason ? `: ${meta.reason}` : ''}`;
          break;
        case 'AGREEMENT_METADATA_UPDATED':
          if (meta.addedTags?.length && meta.removedTags?.length) {
            summary = `Added #${meta.addedTags.join(', #')}, removed #${meta.removedTags.join(', #')}`;
          } else if (meta.addedTags?.length) {
            summary = `Added label #${meta.addedTags.join(', #')}`;
          } else if (meta.removedTags?.length) {
            summary = `Removed label #${meta.removedTags.join(', #')}`;
          } else {
            summary = 'Updated labels';
          }
          break;
        default:
          summary = log.action.replace('AGREEMENT_', '').toLowerCase().replace(/_/g, ' ');
          break;
      }

      return {
        id: log.id,
        action: log.action,
        summary,
        version: meta.version ? String(meta.version) : undefined,
        user: {
          id: log.user?.id,
          name: log.user?.name || log.user?.email?.split('@')[0] || 'System',
          email: log.user?.email || 'system@graphsign.ink',
        },
        createdAt: log.createdAt.toISOString(),
        metadata: meta,
      };
    });

    return history;
  }

  /**
   * Create new version of an agreement (FR-004.004 / INK-69)
   */
  async createVersion(
    orgId: string,
    authorId: string,
    agreementId: string,
    changeSummary?: string,
    userRole?: string,
  ) {
    const existing = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Agreement not found.');
    }

    if (
      userRole &&
      userRole !== 'org_admin' &&
      userRole !== 'admin' &&
      userRole !== 'super_admin' &&
      authorId !== 'unknown' &&
      existing.authorId !== authorId
    ) {
      throw new ForbiddenError('You do not have permission to version this agreement.');
    }

    const nextVersion = incrementMinorVersion(existing.version);

    const newVersion = await this.prisma.agreementVersion.create({
      data: {
        id: generateId(),
        agreementId,
        version: nextVersion,
        title: existing.title,
        fileUrl: existing.fileUrl,
        markdownContent: existing.markdownContent,
        changeSummary: changeSummary || `Version ${nextVersion} revision`,
        authorId,
      },
    });

    await this.prisma.agreement.update({
      where: { id: agreementId },
      data: { version: nextVersion },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'AGREEMENT_VERSION_CREATED',
        resourceType: 'Agreement',
        resourceId: agreementId,
        metadata: { version: nextVersion },
      });
    }

    return newVersion;
  }

  /**
   * List version history of an agreement (FR-004.004 / INK-69)
   */
  async listVersions(orgId: string, agreementId: string, userId?: string, userRole?: string) {
    const existing = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Agreement not found.');
    }

    if (
      userRole &&
      userRole !== 'org_admin' &&
      userRole !== 'admin' &&
      userRole !== 'super_admin' &&
      userId &&
      userId !== 'unknown' &&
      existing.authorId !== userId
    ) {
      throw new ForbiddenError('You do not have permission to view versions for this agreement.');
    }

    return this.prisma.agreementVersion.findMany({
      where: { agreementId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Clone agreement into a new draft (FR-004.005 / INK-70)
   */
  async cloneAgreement(orgId: string, authorId: string, agreementId: string, userRole?: string) {
    const existing = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Agreement not found.');
    }

    if (
      userRole &&
      userRole !== 'org_admin' &&
      userRole !== 'admin' &&
      userRole !== 'super_admin' &&
      authorId !== 'unknown' &&
      existing.authorId !== authorId
    ) {
      throw new ForbiddenError('You do not have permission to clone this agreement.');
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
        markdownContent: existing.markdownContent,
        tags: existing.tags ? (existing.tags as any) : [],
        metadata: existing.metadata ? (existing.metadata as any) : {},
        version: '0.1',
        versions: {
          create: {
            id: generateId(),
            version: '0.1',
            title: `[Copy] ${existing.title}`,
            fileUrl: existing.fileUrl,
            markdownContent: existing.markdownContent,
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

    // Strip large fileData binary from the returned cloned agreement object
    const { metadata, ...rest } = cloned;
    const cleanMetadata =
      metadata && typeof metadata === 'object' ? { ...(metadata as Record<string, unknown>) } : {};
    delete cleanMetadata.fileData;
    delete cleanMetadata.fileBase64;

    return {
      ...rest,
      metadata: cleanMetadata,
    };
  }

  /**
   * Archive / Unarchive agreement (FR-004.006 / INK-71)
   */
  async setArchiveStatus(
    orgId: string,
    authorId: string,
    agreementId: string,
    archive: boolean,
    userRole?: string,
  ) {
    const existing = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Agreement not found.');
    }

    if (
      userRole &&
      userRole !== 'org_admin' &&
      userRole !== 'admin' &&
      userRole !== 'super_admin' &&
      authorId !== 'unknown' &&
      existing.authorId !== authorId
    ) {
      throw new ForbiddenError('You do not have permission to archive/unarchive this agreement.');
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
   * Delete agreement record (INK-271)
   */
  async deleteAgreement(orgId: string, authorId: string, agreementId: string, userRole?: string) {
    const existing = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Agreement not found.');
    }

    if (
      userRole &&
      userRole !== 'org_admin' &&
      userRole !== 'admin' &&
      userRole !== 'super_admin' &&
      authorId !== 'unknown' &&
      existing.authorId !== authorId
    ) {
      throw new ForbiddenError('You do not have permission to delete this agreement.');
    }

    await this.prisma.agreement.update({
      where: { id: agreementId },
      data: { deletedAt: new Date() },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'AGREEMENT_DELETED',
        resourceType: 'Agreement',
        resourceId: agreementId,
        metadata: { title: existing.title },
      });
    }

    return { success: true, id: agreementId };
  }

  /**
   * Update metadata and tags (FR-004.007 / INK-72)
   */
  async updateMetadataAndTags(
    orgId: string,
    authorId: string,
    agreementId: string,
    input: UpdateMetadataTagsInput,
    userRole?: string,
  ) {
    const existing = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundError('Agreement not found.');
    }

    if (
      userRole &&
      userRole !== 'org_admin' &&
      userRole !== 'admin' &&
      userRole !== 'super_admin' &&
      authorId !== 'unknown' &&
      existing.authorId !== authorId
    ) {
      throw new ForbiddenError('You do not have permission to update metadata for this agreement.');
    }

    const currentTags: string[] = Array.isArray(existing.tags) ? (existing.tags as string[]) : [];
    const newTags: string[] = input.tags || currentTags;

    const addedTags = newTags.filter((t) => !currentTags.includes(t));
    const removedTags = currentTags.filter((t) => !newTags.includes(t));

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
        metadata: {
          addedTags,
          removedTags,
          tags: newTags,
        },
      });
    }

    return updated;
  }

  /**
   * List agreements with filtering, pagination, and tag search (INK-248 scoped for privacy)
   * - ACTIVE tab: returns ACTIVE agreements with major versions
   * - DRAFT tab: returns DRAFT agreements
   */
  async listAgreements(
    orgId: string,
    query: QueryAgreementsInput,
    userId?: string,
    userRole?: string,
    userEmail?: string,
  ) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      organisationId: orgId,
      deletedAt: null,
      isArchived: query.isArchived ?? false,
    };

    // Non-admin users are strictly scoped to their authored documents, review assignments, or signing requests (INK-248, INK-263, INK-278)
    if (
      userRole &&
      userRole !== 'org_admin' &&
      userRole !== 'admin' &&
      userRole !== 'super_admin' &&
      userId &&
      userId !== 'unknown'
    ) {
      where.OR = [
        { authorId: userId },
        { reviewerId: userId },
        ...(userEmail
          ? [
              {
                recipients: {
                  some: {
                    email: {
                      equals: userEmail.trim(),
                      mode: 'insensitive' as const,
                    },
                  },
                },
              },
            ]
          : []),
      ];
    }

    if (query.status) {
      if (query.status === 'ACTIVE') {
        where.status = { notIn: ['DRAFT', 'IN_REVIEW', 'REJECTED'] };
      } else if (query.status === 'DRAFT') {
        where.status = { in: ['DRAFT', 'IN_REVIEW', 'REJECTED'] };
      } else {
        where.status = query.status;
      }
    }

    if (query.search) {
      const searchConditions = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchConditions }];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    // Filter by tag using Prisma JsonB array_contains
    if (query.tag) {
      where.tags = { array_contains: [query.tag] };
    }

    const [rawItems, total] = await Promise.all([
      this.prisma.agreement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          organisationId: true,
          authorId: true,
          title: true,
          description: true,
          status: true,
          fileUrl: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          version: true,
          isArchived: true,
          archivedAt: true,
          tags: true,
          signingOrder: true,
          currentStep: true,
          expiresAt: true,
          reviewerId: true,
          reviewedAt: true,
          rejectionReason: true,
          cancellationReason: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          author: { select: { id: true, name: true, email: true } },
          recipients: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
              routingOrder: true,
            },
          },
        },
      }),
      this.prisma.agreement.count({ where }),
    ]);

    return {
      items: rawItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get fields and recipient definitions for an agreement (INK-78 to INK-85)
   */
  async getAgreementFields(orgId: string, agreementId: string, userId?: string, userRole?: string) {
    const agreement = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!agreement) {
      throw new NotFoundError('Agreement not found.');
    }

    if (
      userRole &&
      userRole !== 'org_admin' &&
      userRole !== 'admin' &&
      userRole !== 'super_admin' &&
      userId &&
      userId !== 'unknown' &&
      agreement.authorId !== userId
    ) {
      throw new ForbiddenError('You do not have permission to view fields for this agreement.');
    }

    const fieldsData = (agreement.fields as Record<string, any>) || {};
    const fieldsList = Array.isArray(fieldsData.fields)
      ? fieldsData.fields
      : Array.isArray(agreement.fields)
        ? agreement.fields
        : [];
    const recipientsList = Array.isArray(fieldsData.recipients) ? fieldsData.recipients : [];

    return {
      agreementId,
      fields: fieldsList,
      recipients: recipientsList,
    };
  }

  /**
   * Save document fields and recipient mappings for an agreement (INK-78 to INK-85)
   */
  async saveAgreementFields(
    orgId: string,
    authorId: string,
    agreementId: string,
    data: SaveDocumentFieldsInput,
    userRole?: string,
  ) {
    const agreement = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId: orgId, deletedAt: null },
    });

    if (!agreement) {
      throw new NotFoundError('Agreement not found.');
    }

    if (
      userRole &&
      userRole !== 'org_admin' &&
      userRole !== 'admin' &&
      userRole !== 'super_admin' &&
      authorId &&
      authorId !== 'unknown' &&
      agreement.authorId !== authorId
    ) {
      throw new ForbiddenError('You do not have permission to modify fields for this agreement.');
    }

    const fieldsPayload = {
      fields: data.fields,
      recipients: data.recipients,
    };

    const updated = await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        fields: fieldsPayload as any,
        updatedAt: new Date(),
      },
    });

    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: authorId,
        action: 'AGREEMENT_FIELDS_UPDATED',
        resourceType: 'Agreement',
        resourceId: agreementId,
        metadata: {
          fieldCount: data.fields.length,
          recipientCount: data.recipients.length,
        },
      });
    }

    return {
      agreementId: updated.id,
      fields: data.fields,
      recipients: data.recipients,
    };
  }

  /**
   * INK-278: Generate in-app signing session for authenticated recipient
   */
  async createSignerSession(orgId: string, agreementId: string, userEmail: string) {
    const agreement = await this.prisma.agreement.findFirst({
      where: {
        id: agreementId,
        organisationId: orgId,
        deletedAt: null,
      },
      include: {
        recipients: true,
      },
    });

    if (!agreement) {
      throw new NotFoundError('Agreement not found.');
    }

    if (agreement.status !== 'SENT' && agreement.status !== 'PARTIALLY_SIGNED') {
      throw new ValidationError('Document is not currently active for signing.');
    }

    const normalizedEmail = userEmail.trim().toLowerCase();
    const recipient = agreement.recipients.find(
      (r) => r.email.trim().toLowerCase() === normalizedEmail,
    );

    if (!recipient) {
      throw new ForbiddenError('You are not designated as a participant on this document.');
    }

    if (recipient.status === 'SIGNED') {
      throw new ValidationError('You have already completed signing this document.');
    }

    if (recipient.status === 'DECLINED') {
      throw new ValidationError('You have previously declined to sign this document.');
    }

    // Check turn in sequential order
    if (
      agreement.signingOrder === 'SEQUENTIAL' &&
      recipient.routingOrder !== agreement.currentStep
    ) {
      throw new ValidationError(
        'It is not your turn yet in the sequential signing order. Preceding participants are currently signing.',
      );
    }

    // Generate fresh single-use token and update recipient
    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);

    await this.prisma.agreementRecipient.update({
      where: { id: recipient.id },
      data: {
        signingTokenHash: tokenHash,
        tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        status: recipient.status === 'PENDING' ? 'INVITED' : recipient.status,
      },
    });

    return {
      token: rawToken,
      signingUrl: `/sign/${rawToken}`,
    };
  }
}
