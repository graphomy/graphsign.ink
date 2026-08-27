import type { PrismaClient } from '@graphsign/db';
import {
  SubmitReviewInput,
  ReviewDecisionInput,
  SendAgreementInput,
  RecipientSignInput,
  DeclineSignInput,
  CancelAgreementInput,
  ElectronicConsentInput,
  SendReminderInput,
} from '../validators/workflow-validators.js';
import { AuditService } from './audit-service.js';
import { MailerService } from './mailer-service.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.js';
import { generateId, generateToken, hashToken } from '../utils/crypto.js';

export interface WorkflowContext {
  userId: string;
  userEmail?: string;
  userName?: string;
  organisationId: string;
  role: string;
  ipAddress?: string;
  userAgent?: string;
}

export class WorkflowService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
    private readonly mailerService: MailerService,
  ) {}

  private static readonly otpStore = new Map<
    string,
    { code: string; expiresAt: number; verified?: boolean }
  >();

  /**
   * INK-87: Submit agreement for internal review
   */
  async submitForReview(ctx: WorkflowContext, agreementId: string, input: SubmitReviewInput) {
    const agreement = await this.prisma.agreement.findFirst({
      where: {
        id: agreementId,
        organisationId: ctx.organisationId,
        deletedAt: null,
      },
      include: { author: { select: { name: true, email: true } } },
    });

    if (!agreement) {
      throw new NotFoundError('Agreement not found.');
    }

    if (agreement.status !== 'DRAFT' && agreement.status !== 'REJECTED') {
      throw new ValidationError(
        `Cannot submit agreement in '${agreement.status}' status for review. Must be DRAFT or REJECTED.`,
      );
    }

    if (!input.reviewerEmail) {
      throw new ValidationError('Reviewer email is required.');
    }

    // Locate reviewer in organisation
    const reviewer = await this.prisma.user.findFirst({
      where: {
        email: input.reviewerEmail.toLowerCase().trim(),
        organisationId: ctx.organisationId,
        deletedAt: null,
      },
    });

    if (!reviewer) {
      throw new NotFoundError(
        `Reviewer with email ${input.reviewerEmail} not found in organisation.`,
      );
    }

    const updated = await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: 'IN_REVIEW',
        reviewerId: reviewer.id,
      },
    });

    await this.auditService.log({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      action: 'AGREEMENT_SUBMITTED_FOR_REVIEW',
      resourceType: 'agreement',
      resourceId: agreementId,
      metadata: {
        reviewerId: reviewer.id,
        reviewerEmail: reviewer.email,
        notes: input.notes,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Dispatch email notification to reviewer (INK-107, INK-113)
    await this.mailerService.sendReviewRequestEmail(
      reviewer.email,
      agreement.title,
      ctx.userName || agreement.author.name || 'An author',
      input.notes,
      {
        organisationId: ctx.organisationId,
        agreementId,
        eventType: 'REVIEW_REQUEST',
      },
    );

    return updated;
  }

  /**
   * INK-268: Retract document from review back to draft state
   */
  async retractReview(ctx: WorkflowContext, agreementId: string) {
    const agreement = await this.prisma.agreement.findFirst({
      where: {
        id: agreementId,
        organisationId: ctx.organisationId,
        deletedAt: null,
      },
      include: { author: { select: { name: true, email: true } } },
    });

    if (!agreement) {
      throw new NotFoundError('Agreement not found.');
    }

    if (agreement.status !== 'IN_REVIEW') {
      throw new ValidationError(
        `Cannot retract agreement in '${agreement.status}' status. Only documents in review can be retracted.`,
      );
    }

    const isAdmin = ctx.role === 'admin' || ctx.role === 'superadmin' || ctx.role === 'owner';
    if (agreement.authorId !== ctx.userId && !isAdmin) {
      throw new ForbiddenError(
        'Only the document author or an administrator can retract this review request.',
      );
    }

    const updated = await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: 'DRAFT',
        rejectionReason: null,
      },
    });

    await this.auditService.log({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      action: 'REVIEW_RETRACTED',
      resourceType: 'agreement',
      resourceId: agreementId,
      metadata: {
        previousStatus: 'IN_REVIEW',
        retractedBy: ctx.userId,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return updated;
  }

  /**
   * INK-88: Approve document
   */
  async approveAgreement(ctx: WorkflowContext, agreementId: string, input: ReviewDecisionInput) {
    const agreement = await this.prisma.agreement.findFirst({
      where: {
        id: agreementId,
        organisationId: ctx.organisationId,
        deletedAt: null,
      },
      include: { author: { select: { name: true, email: true } } },
    });

    if (!agreement) {
      throw new NotFoundError('Agreement not found.');
    }

    if (agreement.status !== 'IN_REVIEW') {
      throw new ValidationError(`Cannot approve agreement in '${agreement.status}' status.`);
    }

    const isAdmin = ctx.role === 'admin' || ctx.role === 'superadmin' || ctx.role === 'owner';
    if (agreement.reviewerId && agreement.reviewerId !== ctx.userId && !isAdmin) {
      throw new ForbiddenError(
        'Only the assigned reviewer or an administrator can approve this document.',
      );
    }

    const updated = await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        rejectionReason: null,
      },
    });

    await this.auditService.log({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      action: 'AGREEMENT_APPROVED',
      resourceType: 'agreement',
      resourceId: agreementId,
      metadata: {
        comments: input.comments,
        reviewerId: ctx.userId,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Notify author of approval (INK-113)
    await this.mailerService.sendReviewDecisionEmail(
      agreement.author.email,
      agreement.title,
      ctx.userName || 'The reviewer',
      'APPROVE',
      input.comments,
      {
        organisationId: ctx.organisationId,
        agreementId,
        eventType: 'REVIEW_APPROVED',
      },
    );

    return updated;
  }

  /**
   * INK-89: Reject document (INK-110)
   */
  async rejectAgreement(ctx: WorkflowContext, agreementId: string, input: ReviewDecisionInput) {
    const agreement = await this.prisma.agreement.findFirst({
      where: {
        id: agreementId,
        organisationId: ctx.organisationId,
        deletedAt: null,
      },
      include: { author: { select: { name: true, email: true } } },
    });

    if (!agreement) {
      throw new NotFoundError('Agreement not found.');
    }

    if (agreement.status !== 'IN_REVIEW') {
      throw new ValidationError(`Cannot reject agreement in '${agreement.status}' status.`);
    }

    const isAdmin = ctx.role === 'admin' || ctx.role === 'superadmin' || ctx.role === 'owner';
    if (agreement.reviewerId && agreement.reviewerId !== ctx.userId && !isAdmin) {
      throw new ForbiddenError(
        'Only the assigned reviewer or an administrator can reject this document.',
      );
    }

    const updated = await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        rejectionReason: input.comments || 'Changes required by reviewer.',
      },
    });

    await this.auditService.log({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      action: 'AGREEMENT_REJECTED',
      resourceType: 'agreement',
      resourceId: agreementId,
      metadata: {
        comments: input.comments,
        reviewerId: ctx.userId,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Notify author of rejection (INK-110, INK-113)
    await this.mailerService.sendReviewDecisionEmail(
      agreement.author.email,
      agreement.title,
      ctx.userName || 'The reviewer',
      'REJECT',
      input.comments,
      {
        organisationId: ctx.organisationId,
        agreementId,
        eventType: 'REVIEW_REJECTED',
      },
    );

    return updated;
  }

  /**
   * INK-90, INK-91, INK-92, INK-107, INK-115: Send agreement for signature with role-aware invites & custom message
   */
  async sendForSignature(ctx: WorkflowContext, agreementId: string, input: SendAgreementInput) {
    const agreement = await this.prisma.agreement.findFirst({
      where: {
        id: agreementId,
        organisationId: ctx.organisationId,
        deletedAt: null,
      },
      include: {
        author: { select: { name: true, email: true } },
        recipients: true,
      },
    });

    if (!agreement) {
      throw new NotFoundError('Agreement not found.');
    }

    if (
      agreement.status === 'SENT_FOR_SIGNATURE' ||
      agreement.status === 'PARTIALLY_SIGNED' ||
      agreement.status === 'COMPLETED' ||
      agreement.status === 'SIGNED'
    ) {
      throw new ValidationError(
        'Agreement has already been sent for signature. It cannot be resent unless the previous request is rejected.',
      );
    }

    if (
      agreement.status !== 'DRAFT' &&
      agreement.status !== 'APPROVED' &&
      agreement.status !== 'REJECTED' &&
      agreement.status !== 'ACTIVE'
    ) {
      throw new ValidationError(
        `Cannot send agreement in '${agreement.status}' status. Must be DRAFT, APPROVED, or REJECTED.`,
      );
    }

    const signingOrder = input.signingOrder || 'PARALLEL';
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

    // Remove existing recipients to replace with final envelope
    await this.prisma.agreementRecipient.deleteMany({
      where: { agreementId },
    });

    // Create recipients and generate initial invitation tokens
    const createdRecipients: Array<{
      id: string;
      email: string;
      name: string;
      role: string;
      routingOrder: number;
      rawToken: string;
    }> = [];

    for (let i = 0; i < input.recipients.length; i++) {
      const r = input.recipients[i]!;
      const rawToken = generateToken();
      const tokenHash = await hashToken(rawToken);
      const routingOrder = signingOrder === 'SEQUENTIAL' ? r.routingOrder || i + 1 : 1;

      const recipientRecord = await this.prisma.agreementRecipient.create({
        data: {
          id: generateId(),
          agreementId,
          email: r.email.toLowerCase().trim(),
          name: r.name.trim(),
          role: r.role || 'signer',
          routingOrder,
          color: r.color || '#2563EB',
          signingTokenHash: tokenHash,
          tokenExpiresAt: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
          status: 'PENDING',
        },
      });

      createdRecipients.push({
        id: recipientRecord.id,
        email: recipientRecord.email,
        name: recipientRecord.name,
        role: recipientRecord.role,
        routingOrder: recipientRecord.routingOrder,
        rawToken,
      });
    }

    // Update agreement status to SENT
    const updatedAgreement = await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: 'SENT',
        signingOrder,
        currentStep: 1,
        expiresAt,
      },
    });

    await this.auditService.log({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      action: 'AGREEMENT_SENT_FOR_SIGNATURE',
      resourceType: 'agreement',
      resourceId: agreementId,
      metadata: {
        signingOrder,
        recipientCount: input.recipients.length,
        expiresAt: expiresAt?.toISOString(),
        hasCustomMessage: !!input.message,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Dispatch invitations (INK-107, INK-113, INK-115)
    const senderName = ctx.userName || agreement.author.name || 'Agreement Sender';

    for (const recip of createdRecipients) {
      const shouldInvite = signingOrder === 'PARALLEL' || recip.routingOrder === 1;

      if (shouldInvite) {
        await this.prisma.agreementRecipient.update({
          where: { id: recip.id },
          data: { status: 'INVITED' },
        });

        await this.mailerService.sendSigningInvitationEmail(
          recip.email,
          recip.name,
          agreement.title,
          senderName,
          recip.rawToken,
          expiresAt,
          input.message,
          recip.role,
          {
            organisationId: ctx.organisationId,
            agreementId: agreement.id,
            recipientId: recip.id,
            recipientName: recip.name,
            eventType: 'INVITATION',
          },
        );
      }
    }

    return {
      agreement: updatedAgreement,
      recipients: createdRecipients.map(({ rawToken, ...rest }) => rest),
    };
  }

  /**
   * INK-90, INK-91: Get public signing session by raw token
   */
  async getPublicSigningSession(rawToken: string) {
    const tokenHash = await hashToken(rawToken);

    const recipient = await this.prisma.agreementRecipient.findUnique({
      where: { signingTokenHash: tokenHash },
      include: {
        agreement: {
          include: {
            author: { select: { name: true, email: true } },
            organisation: { select: { name: true } },
          },
        },
      },
    });

    if (!recipient) {
      throw new NotFoundError('Invalid or expired signing link.');
    }

    const agreement = recipient.agreement;

    if (agreement.deletedAt) {
      throw new NotFoundError('This agreement has been removed.');
    }

    if (agreement.status === 'CANCELLED') {
      throw new ValidationError('This agreement has been cancelled/voided by the sender.');
    }

    if (recipient.tokenExpiresAt && new Date() > recipient.tokenExpiresAt) {
      throw new ValidationError('This signing link has expired.');
    }

    // Retrieve all envelope recipients
    const allRecipients = await this.prisma.agreementRecipient.findMany({
      where: { agreementId: agreement.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        routingOrder: true,
        status: true,
        color: true,
      },
      orderBy: { routingOrder: 'asc' },
    });

    // Check sequential routing turn
    const isTurn =
      agreement.signingOrder === 'PARALLEL' ||
      recipient.routingOrder === agreement.currentStep ||
      recipient.status === 'SIGNED';

    return {
      recipient: {
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
        status: recipient.status,
        routingOrder: recipient.routingOrder,
        color: recipient.color,
      },
      agreement: {
        id: agreement.id,
        title: agreement.title,
        description: agreement.description,
        status: agreement.status,
        fileUrl: agreement.fileUrl,
        fileName: agreement.fileName,
        mimeType: agreement.mimeType,
        markdownContent: agreement.markdownContent,
        fields: agreement.fields as any,
        signingOrder: agreement.signingOrder,
        currentStep: agreement.currentStep,
        expiresAt: agreement.expiresAt,
        author: {
          name: agreement.author.name,
        },
        organisation: {
          name: agreement.organisation.name,
        },
      },
      recipients: allRecipients,
      isTurn,
    };
  }

  /**
   * INK-98: Record recipient view beacon
   */
  async recordRecipientView(rawToken: string, ip?: string, userAgent?: string) {
    const tokenHash = await hashToken(rawToken);

    const recipient = await this.prisma.agreementRecipient.findUnique({
      where: { signingTokenHash: tokenHash },
      include: {
        agreement: { select: { organisationId: true } },
      },
    });

    if (!recipient) {
      throw new NotFoundError('Invalid signing link.');
    }

    if (!recipient.viewedAt) {
      await this.prisma.agreementRecipient.update({
        where: { id: recipient.id },
        data: {
          viewedAt: new Date(),
          ipAddress: ip,
          userAgent,
        },
      });

      await this.auditService.log({
        organisationId: recipient.agreement.organisationId,
        action: 'AGREEMENT_VIEWED_BY_RECIPIENT',
        resourceType: 'agreement',
        resourceId: recipient.agreementId,
        metadata: {
          recipientId: recipient.id,
          email: recipient.email,
          name: recipient.name,
        },
        ipAddress: ip,
        userAgent,
      });
    }

    return { success: true };
  }

  /**
   * INK-98: Alias for recordRecipientView
   */
  async trackRecipientView(rawToken: string, ip?: string, userAgent?: string) {
    return this.recordRecipientView(rawToken, ip, userAgent);
  }

  /**
   * INK-99: Record Electronic Record and Signature Disclosure (ERSD) consent
   */
  async recordElectronicConsent(
    rawToken: string,
    input: ElectronicConsentInput,
    ip?: string,
    userAgent?: string,
  ) {
    const tokenHash = await hashToken(rawToken);

    const recipient = await this.prisma.agreementRecipient.findUnique({
      where: { signingTokenHash: tokenHash },
      include: {
        agreement: { select: { organisationId: true, id: true } },
      },
    });

    if (!recipient) {
      throw new NotFoundError('Invalid signing link.');
    }

    const consentTimestamp = new Date();

    await this.auditService.log({
      organisationId: recipient.agreement.organisationId,
      action: 'ERSD_CONSENT_ACCEPTED',
      resourceType: 'agreement',
      resourceId: recipient.agreement.id,
      metadata: {
        recipientId: recipient.id,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        ersdVersion: input.ersdVersion,
        consentTimestamp: consentTimestamp.toISOString(),
      },
      ipAddress: ip,
      userAgent,
    });

    return {
      success: true,
      consentTimestamp: consentTimestamp.toISOString(),
      ersdVersion: input.ersdVersion,
    };
  }

  /**
   * INK-266: Send 6-digit OTP verification code to recipient's email address
   */
  async sendSignerOtp(rawToken: string, ip?: string, userAgent?: string) {
    const tokenHash = await hashToken(rawToken);
    const recipient = await this.prisma.agreementRecipient.findUnique({
      where: { signingTokenHash: tokenHash },
      include: {
        agreement: { select: { organisationId: true, id: true, title: true } },
      },
    });

    if (!recipient) {
      throw new NotFoundError('Invalid signing link.');
    }

    if (recipient.status === 'SIGNED' || recipient.status === 'DECLINED') {
      throw new ValidationError(
        `Cannot send verification code for ${recipient.status.toLowerCase()} recipient.`,
      );
    }

    // Generate 6-digit code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    WorkflowService.otpStore.set(tokenHash, {
      code: otpCode,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      verified: false,
    });

    await this.mailerService.sendOtpVerificationEmail(
      recipient.email,
      recipient.name,
      recipient.agreement.title,
      otpCode,
      {
        organisationId: recipient.agreement.organisationId,
        agreementId: recipient.agreement.id,
        recipientId: recipient.id,
        recipientName: recipient.name,
      },
    );

    await this.auditService.log({
      organisationId: recipient.agreement.organisationId,
      action: 'GUEST_SIGNER_OTP_SENT',
      resourceType: 'agreement',
      resourceId: recipient.agreement.id,
      metadata: {
        recipientId: recipient.id,
        email: recipient.email,
        name: recipient.name,
      },
      ipAddress: ip,
      userAgent,
    });

    return {
      success: true,
      email: recipient.email,
      expiresInSeconds: 600,
    };
  }

  /**
   * INK-266: Verify 6-digit OTP code for signer
   */
  async verifySignerOtp(rawToken: string, otpCode: string, ip?: string, userAgent?: string) {
    const tokenHash = await hashToken(rawToken);
    const recipient = await this.prisma.agreementRecipient.findUnique({
      where: { signingTokenHash: tokenHash },
      include: {
        agreement: { select: { organisationId: true, id: true } },
      },
    });

    if (!recipient) {
      throw new NotFoundError('Invalid signing link.');
    }

    const entry = WorkflowService.otpStore.get(tokenHash);
    if (!entry || Date.now() > entry.expiresAt || entry.code !== otpCode.trim()) {
      throw new BadRequestError('Invalid or expired verification code.');
    }

    entry.verified = true;

    await this.auditService.log({
      organisationId: recipient.agreement.organisationId,
      action: 'GUEST_SIGNER_OTP_VERIFIED',
      resourceType: 'agreement',
      resourceId: recipient.agreement.id,
      metadata: {
        recipientId: recipient.id,
        email: recipient.email,
        name: recipient.name,
      },
      ipAddress: ip,
      userAgent,
    });

    return { success: true, verified: true };
  }

  /**
   * INK-105: Get signing document file for public recipient download
   */
  async getSigningDocumentFile(rawToken: string) {
    const tokenHash = await hashToken(rawToken);
    const recipient = await this.prisma.agreementRecipient.findUnique({
      where: { signingTokenHash: tokenHash },
      include: {
        agreement: true,
      },
    });

    if (!recipient) {
      throw new NotFoundError('Invalid or expired signing link.');
    }

    const agreement = recipient.agreement;
    if (agreement.deletedAt || agreement.status === 'CANCELLED') {
      throw new NotFoundError('Agreement file is not available.');
    }

    const meta = (agreement.metadata as Record<string, unknown>) || {};
    const fileData =
      (meta.signedPdfBase64 as string | undefined) ||
      (meta.fileBase64 as string | undefined) ||
      (meta.fileData as string | undefined) ||
      (agreement as any).fileData;

    return {
      id: agreement.id,
      title: agreement.title,
      fileName:
        agreement.fileName || `${agreement.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`,
      mimeType: agreement.mimeType || 'application/pdf',
      fileUrl: agreement.fileUrl,
      fileData,
      markdownContent: agreement.markdownContent,
      status: agreement.status,
    };
  }

  /**
   * INK-94, INK-96, INK-104, INK-109: Submit recipient signature and advance workflow
   */
  async submitRecipientSignature(
    rawToken: string,
    input: RecipientSignInput,
    ip?: string,
    userAgent?: string,
  ) {
    const tokenHash = await hashToken(rawToken);
    const recipient = await this.prisma.agreementRecipient.findUnique({
      where: { signingTokenHash: tokenHash },
      include: {
        agreement: {
          include: {
            author: { select: { name: true, email: true } },
            recipients: true,
          },
        },
      },
    });

    if (!recipient) {
      throw new NotFoundError('Invalid signing link.');
    }

    const agreement = recipient.agreement;

    if (agreement.status === 'CANCELLED' || agreement.status === 'EXPIRED') {
      throw new ValidationError(`Cannot sign a ${agreement.status.toLowerCase()} agreement.`);
    }

    if (recipient.status === 'SIGNED') {
      throw new ValidationError('You have already signed this document.');
    }

    // Verify OTP if signed as guest
    if (input.signedAsGuest) {
      const entry = WorkflowService.otpStore.get(tokenHash);
      if (input.otpCode) {
        if (!entry || Date.now() > entry.expiresAt || entry.code !== input.otpCode.trim()) {
          throw new BadRequestError('Invalid or expired verification code.');
        }
        entry.verified = true;
      }
      if (entry && !entry.verified) {
        throw new BadRequestError(
          'Email OTP verification is required before confirming signature.',
        );
      }
    }

    // Backend validation for assigned required fields (INK-104)
    const envelopeFields = (agreement.fields as any)?.fields || [];
    const assignedRequiredFields = envelopeFields.filter(
      (f: any) => f.recipientId === recipient.id && f.isRequired,
    );

    const missingFields: string[] = [];
    for (const f of assignedRequiredFields) {
      if (f.type === 'SIGNATURE' || f.type === 'INITIALS') {
        const val = input.fieldsData?.[f.id] || input.signatureData?.data;
        if (!val) missingFields.push(f.label || f.type);
      } else {
        const val = input.fieldsData?.[f.id];
        if (val === undefined || val === null || val === '') {
          missingFields.push(f.label || f.type);
        }
      }
    }

    if (missingFields.length > 0) {
      throw new ValidationError(`Required fields must be completed: ${missingFields.join(', ')}`);
    }

    // Save recipient signature submission
    await this.prisma.agreementRecipient.update({
      where: { id: recipient.id },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        fieldsData: input.fieldsData as any,
        signatureData: input.signatureData as any,
        ipAddress: ip,
        userAgent,
      },
    });

    await this.auditService.log({
      organisationId: agreement.organisationId,
      action: 'AGREEMENT_SIGNED',
      resourceType: 'agreement',
      resourceId: agreement.id,
      metadata: {
        recipientId: recipient.id,
        email: recipient.email,
        name: recipient.name,
        signatureType: input.signatureData?.type,
      },
      ipAddress: ip,
      userAgent,
    });

    // Evaluate progression and completion (INK-91, INK-94, INK-109)
    const allRecipients = await this.prisma.agreementRecipient.findMany({
      where: { agreementId: agreement.id },
    });

    const activeSigners = allRecipients.filter(
      (r: any) => r.role === 'signer' || r.role === 'approver',
    );
    const allFinished = activeSigners.every((r: any) => r.status === 'SIGNED');

    if (allFinished) {
      // Mark workflow COMPLETED (INK-94, INK-109)
      await this.prisma.agreement.update({
        where: { id: agreement.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      await this.auditService.log({
        organisationId: agreement.organisationId,
        action: 'AGREEMENT_COMPLETED',
        resourceType: 'agreement',
        resourceId: agreement.id,
        metadata: {
          totalSigners: activeSigners.length,
          completedAt: new Date().toISOString(),
        },
        ipAddress: ip,
        userAgent,
      });

      // Send completion confirmation emails to author and all participants (INK-109, INK-113)
      await this.mailerService.sendAgreementCompletedEmail(
        agreement.author.email,
        agreement.author.name || 'Author',
        agreement.title,
        undefined,
        {
          organisationId: agreement.organisationId,
          agreementId: agreement.id,
          eventType: 'COMPLETED',
        },
      );

      for (const r of allRecipients) {
        await this.mailerService.sendAgreementCompletedEmail(
          r.email,
          r.name,
          agreement.title,
          undefined,
          {
            organisationId: agreement.organisationId,
            agreementId: agreement.id,
            recipientId: r.id,
            recipientName: r.name,
            eventType: 'COMPLETED',
          },
        );
      }
    } else if (agreement.signingOrder === 'SEQUENTIAL') {
      // Advance to next sequential tier if current tier is finished
      const currentTierSigners = activeSigners.filter(
        (r: any) => r.routingOrder === agreement.currentStep,
      );
      const currentTierFinished = currentTierSigners.every((r: any) => r.status === 'SIGNED');

      if (currentTierFinished) {
        const remainingTiers = activeSigners
          .filter((r: any) => r.routingOrder > agreement.currentStep && r.status !== 'SIGNED')
          .sort((a: any, b: any) => a.routingOrder - b.routingOrder);

        const nextStep = remainingTiers[0]?.routingOrder;
        if (nextStep) {
          await this.prisma.agreement.update({
            where: { id: agreement.id },
            data: { currentStep: nextStep },
          });

          // Dispatch invitations to the newly unlocked tier
          const nextTierRecipients = activeSigners.filter((r: any) => r.routingOrder === nextStep);
          const senderName = agreement.author.name || 'Author';

          for (const nextRecip of nextTierRecipients) {
            const nextRawToken = generateToken();
            const nextTokenHash = await hashToken(nextRawToken);

            await this.prisma.agreementRecipient.update({
              where: { id: nextRecip.id },
              data: {
                status: 'INVITED',
                signingTokenHash: nextTokenHash,
              },
            });

            await this.mailerService.sendSigningInvitationEmail(
              nextRecip.email,
              nextRecip.name,
              agreement.title,
              senderName,
              nextRawToken,
              agreement.expiresAt,
              undefined,
              nextRecip.role,
              {
                organisationId: agreement.organisationId,
                agreementId: agreement.id,
                recipientId: nextRecip.id,
                recipientName: nextRecip.name,
                eventType: 'INVITATION',
              },
            );
          }
        }
      }
    }

    return {
      success: true,
      isCompleted: allFinished,
      currentStep: agreement.currentStep,
    };
  }

  /**
   * INK-95, INK-111: Decline signing and notify author
   */
  async declineRecipientSignature(
    rawToken: string,
    input: DeclineSignInput,
    ip?: string,
    userAgent?: string,
  ) {
    const tokenHash = await hashToken(rawToken);
    const recipient = await this.prisma.agreementRecipient.findUnique({
      where: { signingTokenHash: tokenHash },
      include: {
        agreement: {
          select: {
            id: true,
            organisationId: true,
            title: true,
            author: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (!recipient) {
      throw new NotFoundError('Invalid signing link.');
    }

    await this.prisma.agreementRecipient.update({
      where: { id: recipient.id },
      data: {
        status: 'DECLINED',
        declinedAt: new Date(),
        declineReason: input.reason,
        ipAddress: ip,
        userAgent,
      },
    });

    await this.prisma.agreement.update({
      where: { id: recipient.agreementId },
      data: {
        status: 'DECLINED',
        rejectionReason: `Declined by ${recipient.name} (${recipient.email}): ${input.reason}`,
      },
    });

    await this.auditService.log({
      organisationId: recipient.agreement.organisationId,
      action: 'AGREEMENT_DECLINED',
      resourceType: 'agreement',
      resourceId: recipient.agreementId,
      metadata: {
        recipientId: recipient.id,
        email: recipient.email,
        name: recipient.name,
        reason: input.reason,
      },
      ipAddress: ip,
      userAgent,
    });

    // Notify author of decline (INK-111, INK-113)
    if (recipient.agreement.author?.email) {
      await this.mailerService.sendAgreementDeclinedEmail(
        recipient.agreement.author.email,
        recipient.agreement.author.name || 'Author',
        recipient.agreement.title,
        recipient.name,
        recipient.email,
        input.reason,
        {
          organisationId: recipient.agreement.organisationId,
          agreementId: recipient.agreementId,
          recipientId: recipient.id,
          recipientName: recipient.name,
          eventType: 'DECLINED',
        },
      );
    }

    return { success: true };
  }

  /**
   * INK-95: Cancel / Void agreement
   */
  async cancelAgreement(ctx: WorkflowContext, agreementId: string, input: CancelAgreementInput) {
    const agreement = await this.prisma.agreement.findFirst({
      where: {
        id: agreementId,
        organisationId: ctx.organisationId,
        deletedAt: null,
      },
      include: { recipients: true },
    });

    if (!agreement) {
      throw new NotFoundError('Agreement not found.');
    }

    const isAdmin = ctx.role === 'admin' || ctx.role === 'superadmin' || ctx.role === 'owner';
    if (agreement.authorId !== ctx.userId && !isAdmin) {
      throw new ForbiddenError('You can only cancel your own agreements.');
    }

    if (agreement.status === 'COMPLETED') {
      throw new ValidationError(`Cannot void agreement in '${agreement.status}' status.`);
    }

    const updated = await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: 'DRAFT',
      },
    });

    // Invalidate all active recipient signing tokens
    await this.prisma.agreementRecipient.updateMany({
      where: { agreementId },
      data: { tokenExpiresAt: new Date() },
    });

    await this.auditService.log({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      action: 'AGREEMENT_CANCELLED',
      resourceType: 'agreement',
      resourceId: agreementId,
      metadata: {
        reason: input.reason,
        previousStatus: agreement.status,
        newStatus: 'DRAFT',
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Notify all recipients (INK-113)
    for (const r of agreement.recipients) {
      await this.mailerService.sendAgreementCancelledEmail(
        r.email,
        r.name,
        agreement.title,
        input.reason,
        {
          organisationId: ctx.organisationId,
          agreementId,
          recipientId: r.id,
          recipientName: r.name,
          eventType: 'CANCELLED',
        },
      );
    }

    return updated;
  }

  /**
   * INK-108: Send manual reminder to pending signers
   */
  async sendManualReminder(ctx: WorkflowContext, agreementId: string, input?: SendReminderInput) {
    const agreement = await this.prisma.agreement.findFirst({
      where: {
        id: agreementId,
        organisationId: ctx.organisationId,
        deletedAt: null,
      },
      include: {
        author: { select: { name: true, email: true } },
        recipients: true,
      },
    });

    if (!agreement) {
      throw new NotFoundError('Agreement not found.');
    }

    if (agreement.status !== 'SENT') {
      throw new ValidationError(
        `Cannot send reminder for agreement in '${agreement.status}' status. Only SENT agreements can be reminded.`,
      );
    }

    // Determine candidate recipients
    let candidateRecipients = agreement.recipients.filter(
      (r) => r.status === 'PENDING' || r.status === 'INVITED',
    );

    // In sequential mode, filter to current step
    if (agreement.signingOrder === 'SEQUENTIAL') {
      candidateRecipients = candidateRecipients.filter(
        (r) => r.routingOrder === agreement.currentStep,
      );
    }

    if (input?.recipientId) {
      candidateRecipients = candidateRecipients.filter((r) => r.id === input.recipientId);
      if (candidateRecipients.length === 0) {
        throw new ValidationError(
          'Specified recipient is not currently in a pending signing state.',
        );
      }
    }

    if (candidateRecipients.length === 0) {
      throw new ValidationError('No active pending recipients found to remind.');
    }

    const senderName = ctx.userName || agreement.author.name || 'Sender';
    const reminded: Array<{ id: string; name: string; email: string }> = [];

    for (const recip of candidateRecipients) {
      const rawToken = generateToken();
      const tokenHash = await hashToken(rawToken);

      await this.prisma.agreementRecipient.update({
        where: { id: recip.id },
        data: {
          signingTokenHash: tokenHash,
          tokenExpiresAt:
            recip.tokenExpiresAt ||
            agreement.expiresAt ||
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'INVITED',
        },
      });

      await this.mailerService.sendReminderEmail(
        recip.email,
        recip.name,
        agreement.title,
        senderName,
        rawToken,
        agreement.expiresAt,
        input?.note,
        {
          organisationId: ctx.organisationId,
          agreementId: agreement.id,
          recipientId: recip.id,
          recipientName: recip.name,
          eventType: 'REMINDER',
        },
      );

      reminded.push({ id: recip.id, name: recip.name, email: recip.email });
    }

    await this.auditService.log({
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      action: 'AGREEMENT_REMINDER_SENT',
      resourceType: 'agreement',
      resourceId: agreementId,
      metadata: {
        remindedCount: reminded.length,
        recipients: reminded.map((r) => r.email),
        note: input?.note,
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return {
      success: true,
      remindedCount: reminded.length,
      recipients: reminded,
    };
  }

  /**
   * INK-113: Get notification delivery logs for an agreement
   */
  async getAgreementNotificationHistory(ctx: WorkflowContext, agreementId: string) {
    const agreement = await this.prisma.agreement.findFirst({
      where: {
        id: agreementId,
        organisationId: ctx.organisationId,
        deletedAt: null,
      },
      select: { id: true, title: true },
    });

    if (!agreement) {
      throw new NotFoundError('Agreement not found.');
    }

    const logs = await this.prisma.notificationLog.findMany({
      where: {
        agreementId,
        organisationId: ctx.organisationId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      agreementId,
      agreementTitle: agreement.title,
      logs: logs.map((l) => ({
        id: l.id,
        recipientEmail: l.recipientEmail,
        recipientName: l.recipientName,
        eventType: l.eventType,
        channel: l.channel,
        status: l.status,
        providerMessageId: l.providerMessageId,
        attempts: l.attempts,
        lastError: l.lastError,
        sentAt: l.sentAt?.toISOString() || null,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }

  /**
   * INK-108, INK-112: Process automated expirations, 24h pre-expiry warnings, and policy reminders
   */
  async processAutomatedRemindersAndExpirations() {
    const now = new Date();
    const results = {
      expiredCount: 0,
      warningCount: 0,
      reminderCount: 0,
    };

    // 1. Process Expired Agreements (deadline passed)
    const expiredAgreements = await this.prisma.agreement.findMany({
      where: {
        status: 'SENT',
        expiresAt: { lt: now },
        deletedAt: null,
      },
      include: {
        author: { select: { name: true, email: true } },
        recipients: true,
      },
    });

    for (const ag of expiredAgreements) {
      await this.prisma.agreement.update({
        where: { id: ag.id },
        data: { status: 'EXPIRED' },
      });

      await this.auditService.log({
        organisationId: ag.organisationId,
        action: 'AGREEMENT_EXPIRED',
        resourceType: 'agreement',
        resourceId: ag.id,
        metadata: {
          expiredAt: now.toISOString(),
          deadline: ag.expiresAt?.toISOString(),
        },
      });

      // Notify author (INK-112)
      await this.mailerService.sendAgreementExpiredEmail(
        ag.author.email,
        ag.author.name || 'Author',
        ag.title,
        {
          organisationId: ag.organisationId,
          agreementId: ag.id,
          eventType: 'EXPIRED',
        },
      );

      // Notify pending recipients (INK-112)
      for (const r of ag.recipients) {
        if (r.status === 'PENDING' || r.status === 'INVITED') {
          await this.mailerService.sendAgreementExpiredEmail(r.email, r.name, ag.title, {
            organisationId: ag.organisationId,
            agreementId: ag.id,
            recipientId: r.id,
            recipientName: r.name,
            eventType: 'EXPIRED',
          });
        }
      }

      results.expiredCount++;
    }

    // 2. Process Expiry Warnings (within 24 hours of deadline)
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const expiringSoonAgreements = await this.prisma.agreement.findMany({
      where: {
        status: 'SENT',
        expiresAt: { gt: now, lte: in24Hours },
        deletedAt: null,
      },
      include: {
        author: { select: { name: true, email: true } },
        recipients: true,
      },
    });

    for (const ag of expiringSoonAgreements) {
      if (!ag.expiresAt) continue;

      // Check if expiry warning was already sent
      const existingWarning = await this.prisma.notificationLog.findFirst({
        where: {
          agreementId: ag.id,
          eventType: 'EXPIRY_WARNING',
          status: 'SENT',
        },
      });

      if (existingWarning) continue;

      // Find active pending recipients whose turn it is
      let pendingRecips = ag.recipients.filter(
        (r) => r.status === 'PENDING' || r.status === 'INVITED',
      );
      if (ag.signingOrder === 'SEQUENTIAL') {
        pendingRecips = pendingRecips.filter((r) => r.routingOrder === ag.currentStep);
      }

      for (const recip of pendingRecips) {
        const rawToken = generateToken();
        const tokenHash = await hashToken(rawToken);

        await this.prisma.agreementRecipient.update({
          where: { id: recip.id },
          data: { signingTokenHash: tokenHash },
        });

        await this.mailerService.sendExpiryWarningEmail(
          recip.email,
          recip.name,
          ag.title,
          ag.expiresAt,
          rawToken,
          {
            organisationId: ag.organisationId,
            agreementId: ag.id,
            recipientId: recip.id,
            recipientName: recip.name,
            eventType: 'EXPIRY_WARNING',
          },
        );

        results.warningCount++;
      }
    }

    return results;
  }

  /**
   * INK-95: Auto-expire agreements past deadline (backward compatibility alias)
   */
  async checkExpiredAgreements() {
    return this.processAutomatedRemindersAndExpirations();
  }
}
