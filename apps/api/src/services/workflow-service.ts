import type { PrismaClient } from '@graphsign/db';
import {
  SubmitReviewInput,
  ReviewDecisionInput,
  SendAgreementInput,
  RecipientSignInput,
  DeclineSignInput,
  CancelAgreementInput,
} from '../validators/workflow-validators.js';
import { AuditService } from './audit-service.js';
import { MailerService } from './mailer-service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
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

    // Dispatch email notification to reviewer
    await this.mailerService.sendReviewRequestEmail(
      reviewer.email,
      agreement.title,
      ctx.userName || agreement.author.name || 'An author',
      input.notes,
    );

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

    // Notify author of approval
    await this.mailerService.sendReviewDecisionEmail(
      agreement.author.email,
      agreement.title,
      ctx.userName || 'The reviewer',
      'APPROVE',
      input.comments,
    );

    return updated;
  }

  /**
   * INK-89: Reject document
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

    // Notify author of rejection
    await this.mailerService.sendReviewDecisionEmail(
      agreement.author.email,
      agreement.title,
      ctx.userName || 'The reviewer',
      'REJECT',
      input.comments,
    );

    return updated;
  }

  /**
   * INK-90, INK-91, INK-92: Send agreement for signature
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
      agreement.status !== 'DRAFT' &&
      agreement.status !== 'APPROVED' &&
      agreement.status !== 'REJECTED'
    ) {
      throw new ValidationError(
        `Cannot send agreement in '${agreement.status}' status. Must be DRAFT or APPROVED.`,
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
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Dispatch invitations:
    // If SEQUENTIAL: only invite recipients where routingOrder === 1
    // If PARALLEL: invite all recipients simultaneously
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
        senderName: agreement.author.name || agreement.author.email,
        organisationName: agreement.organisation.name,
      },
      allRecipients,
      isTurn,
    };
  }

  /**
   * INK-93: Track viewed status
   */
  async trackRecipientView(rawToken: string, ip?: string, userAgent?: string) {
    const tokenHash = await hashToken(rawToken);
    const recipient = await this.prisma.agreementRecipient.findUnique({
      where: { signingTokenHash: tokenHash },
      include: {
        agreement: { select: { id: true, organisationId: true, status: true } },
      },
    });

    if (!recipient) {
      throw new NotFoundError('Invalid signing link.');
    }

    if (recipient.status === 'INVITED' || recipient.status === 'PENDING') {
      await this.prisma.agreementRecipient.update({
        where: { id: recipient.id },
        data: {
          status: 'VIEWED',
          viewedAt: new Date(),
          ipAddress: ip,
          userAgent,
        },
      });

      await this.auditService.log({
        organisationId: recipient.agreement.organisationId,
        action: 'AGREEMENT_VIEWED',
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
   * INK-94, INK-96: Submit recipient signature and advance workflow
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

    // Evaluate progression and completion (INK-91, INK-94)
    const allRecipients = await this.prisma.agreementRecipient.findMany({
      where: { agreementId: agreement.id },
    });

    const activeSigners = allRecipients.filter(
      (r: any) => r.role === 'signer' || r.role === 'approver',
    );
    const allFinished = activeSigners.every((r: any) => r.status === 'SIGNED');

    if (allFinished) {
      // Mark workflow COMPLETED (INK-94)
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

      // Send completion confirmation emails to all participants
      for (const r of allRecipients) {
        await this.mailerService.sendAgreementCompletedEmail(r.email, r.name, agreement.title);
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
            await this.prisma.agreementRecipient.update({
              where: { id: nextRecip.id },
              data: { status: 'INVITED' },
            });

            if (nextRecip.signingTokenHash) {
              await this.mailerService.sendSigningInvitationEmail(
                nextRecip.email,
                nextRecip.name,
                agreement.title,
                senderName,
                rawToken, // or recipient link
                agreement.expiresAt,
              );
            }
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
   * INK-95: Decline signing
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
            author: { select: { email: true } },
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

    if (agreement.status === 'COMPLETED' || agreement.status === 'CANCELLED') {
      throw new ValidationError(`Cannot cancel agreement in '${agreement.status}' status.`);
    }

    const updated = await this.prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: 'CANCELLED',
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
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Notify all recipients
    for (const r of agreement.recipients) {
      await this.mailerService.sendAgreementCancelledEmail(
        r.email,
        r.name,
        agreement.title,
        input.reason,
      );
    }

    return updated;
  }

  /**
   * INK-95: Auto-expire agreements past deadline
   */
  async checkExpiredAgreements() {
    const now = new Date();
    const expiredAgreements = await this.prisma.agreement.findMany({
      where: {
        status: 'SENT',
        expiresAt: { lt: now },
        deletedAt: null,
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
    }

    return { expiredCount: expiredAgreements.length };
  }
}
