import { Resend } from 'resend';
import type { PrismaClient } from '@graphsign/db';
import { generateId } from '../utils/crypto.js';

export interface EmailTrackingMetadata {
  organisationId?: string;
  agreementId?: string;
  recipientId?: string;
  recipientName?: string;
  eventType?: string;
}

/**
 * Mailer service abstraction.
 * Production: sends via Resend API with exponential retry.
 * Development: logs to console and records notification logs.
 */
export interface MailerService {
  sendVerificationEmail(to: string, token: string): Promise<void>;
  sendPasswordResetEmail(to: string, token: string): Promise<void>;
  sendEmailChangeVerificationEmail(to: string, token: string): Promise<void>;
  sendOrganisationInvitationEmail(
    to: string,
    orgName: string,
    role: string,
    token: string,
  ): Promise<void>;
  sendReviewRequestEmail(
    to: string,
    agreementTitle: string,
    authorName: string,
    notes?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void>;
  sendReviewDecisionEmail(
    to: string,
    agreementTitle: string,
    reviewerName: string,
    decision: 'APPROVE' | 'REJECT',
    comments?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void>;
  sendSigningInvitationEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    senderName: string,
    signingToken: string,
    expiresAt?: Date | null,
    customMessage?: string,
    recipientRole?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void>;
  sendReminderEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    senderName: string,
    signingToken: string,
    expiresAt?: Date | null,
    customNote?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void>;
  sendAgreementCompletedEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    downloadUrl?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void>;
  sendAgreementDeclinedEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    declinerName: string,
    declinerEmail: string,
    reason?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void>;
  sendAgreementCancelledEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    reason?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void>;
  sendExpiryWarningEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    expiresAt: Date,
    signingToken: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void>;
  sendAgreementExpiredEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void>;
  sendOtpVerificationEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    otpCode: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void>;
}

/**
 * Exponential backoff helper for retrying transient email dispatch failures (INK-116)
 */
async function executeWithRetry<T>(
  fn: (attempt: number) => Promise<T>,
  maxAttempts = 3,
  initialDelayMs = 100,
): Promise<{ result: T | null; attempts: number; error: Error | null }> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fn(attempt);
      return { result: res, attempts: attempt, error: null };
    } catch (err: unknown) {
      lastError = err as Error;
      if (attempt < maxAttempts) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  return { result: null, attempts: maxAttempts, error: lastError };
}

/**
 * Resend-backed email service.
 */
export class ResendMailerService implements MailerService {
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly from: string = 'noreply@graphsign.ink',
    private readonly webUrl: string = 'http://localhost:3000',
    private readonly prisma?: PrismaClient,
  ) {
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is required for ResendMailerService.');
    }
    this.resend = new Resend(apiKey);
  }

  private async dispatch(
    to: string,
    subject: string,
    html: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    const { result, attempts, error } = await executeWithRetry(async () => {
      const response = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
      });
      if ((response as any).error) {
        throw new Error((response as any).error.message || 'Resend delivery failed');
      }
      return response;
    });

    if (this.prisma && meta?.organisationId) {
      try {
        await this.prisma.notificationLog.create({
          data: {
            id: generateId(),
            organisationId: meta.organisationId,
            agreementId: meta.agreementId,
            recipientId: meta.recipientId,
            recipientEmail: to,
            recipientName: meta.recipientName,
            eventType: meta.eventType || 'NOTIFICATION',
            channel: 'EMAIL',
            status: error ? 'FAILED' : 'SENT',
            providerMessageId: (result as any)?.data?.id || null,
            attempts,
            lastError: error ? error.message : null,
            sentAt: error ? null : new Date(),
          },
        });
      } catch (logErr) {
        console.error('[MAILER] Failed to persist notification log:', logErr);
      }
    }

    if (error) {
      console.error(`[MAILER] Failed to send email to ${to} after ${attempts} attempts:`, error);
      throw error;
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const verifyUrl = `${this.webUrl}/verify-email?token=${encodeURIComponent(token)}`;
    await this.dispatch(
      to,
      'Verify your graphsign.ink account',
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #111; font-size: 24px;">Welcome to graphsign.ink</h1>
          <p style="color: #333; font-size: 16px; line-height: 1.5;">
            Please verify your email address by clicking the button below.
          </p>
          <a href="${verifyUrl}"
             style="display: inline-block; background: #2563eb; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-size: 16px; margin: 16px 0; font-weight: bold;">
            Verify Email
          </a>
          <p style="color: #666; font-size: 14px;">
            This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
          </p>
        </div>
      `,
      { eventType: 'AUTH_VERIFY' },
    );
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = `${this.webUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.dispatch(
      to,
      'Reset your graphsign.ink password',
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #111; font-size: 24px;">Password Reset Request</h1>
          <p style="color: #333; font-size: 16px; line-height: 1.5;">
            We received a request to reset your password. Click the button below to choose a new password.
          </p>
          <a href="${resetUrl}"
             style="display: inline-block; background: #2563eb; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-size: 16px; margin: 16px 0; font-weight: bold;">
            Reset Password
          </a>
          <p style="color: #666; font-size: 14px;">
            This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
        </div>
      `,
      { eventType: 'AUTH_PASSWORD_RESET' },
    );
  }

  async sendEmailChangeVerificationEmail(to: string, token: string): Promise<void> {
    const verifyUrl = `${this.webUrl}/settings/profile?verifyToken=${encodeURIComponent(token)}`;
    await this.dispatch(
      to,
      'Confirm your new email address for graphsign.ink',
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #111; font-size: 24px;">Confirm New Email Address</h1>
          <p style="color: #333; font-size: 16px; line-height: 1.5;">
            Click the button below to confirm your new primary email address.
          </p>
          <a href="${verifyUrl}"
             style="display: inline-block; background: #2563eb; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-size: 16px; margin: 16px 0; font-weight: bold;">
            Confirm New Email
          </a>
        </div>
      `,
      { eventType: 'AUTH_EMAIL_CHANGE' },
    );
  }

  async sendOrganisationInvitationEmail(
    to: string,
    orgName: string,
    role: string,
    token: string,
  ): Promise<void> {
    const inviteUrl = `${this.webUrl}/accept-invite?token=${encodeURIComponent(token)}`;
    await this.dispatch(
      to,
      `You have been invited to join ${orgName} on graphsign.ink`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #111; font-size: 24px;">Invitation to join ${orgName}</h1>
          <p style="color: #333; font-size: 16px; line-height: 1.5;">
            You have been invited to join <strong>${orgName}</strong> as a <strong>${role}</strong> on graphsign.ink.
          </p>
          <a href="${inviteUrl}"
             style="display: inline-block; background: #2563eb; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-size: 16px; margin: 16px 0; font-weight: bold;">
            Accept Invitation
          </a>
          <p style="color: #666; font-size: 14px;">This invitation expires in 7 days.</p>
        </div>
      `,
      { eventType: 'ORG_INVITATION' },
    );
  }

  async sendReviewRequestEmail(
    to: string,
    agreementTitle: string,
    authorName: string,
    notes?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    const reviewUrl = `${this.webUrl}/agreements`;
    await this.dispatch(
      to,
      `Review Request: "${agreementTitle}" on graphsign.ink`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #111; font-size: 20px;">Review Request</h1>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            <strong>${authorName}</strong> has submitted <strong>"${agreementTitle}"</strong> for your review.
          </p>
          ${
            notes
              ? `<div style="background: #f4f4f5; padding: 12px; border-radius: 6px; margin: 12px 0; font-size: 14px; color: #333;"><strong>Notes:</strong> ${notes}</div>`
              : ''
          }
          <a href="${reviewUrl}"
             style="display: inline-block; background: #2563eb; color: white;
                    padding: 10px 20px; text-decoration: none; border-radius: 6px;
                    font-size: 15px; margin: 16px 0; font-weight: bold;">
            Review Agreement
          </a>
        </div>
      `,
      { ...meta, eventType: 'REVIEW_REQUEST' },
    );
  }

  async sendReviewDecisionEmail(
    to: string,
    agreementTitle: string,
    reviewerName: string,
    decision: 'APPROVE' | 'REJECT',
    comments?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    const isApproved = decision === 'APPROVE';
    const statusColor = isApproved ? '#059669' : '#dc2626';

    await this.dispatch(
      to,
      `Document ${isApproved ? 'Approved' : 'Rejected'}: "${agreementTitle}"`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: ${statusColor}; font-size: 20px;">Agreement ${
            isApproved ? 'Approved' : 'Rejected'
          }</h1>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            <strong>${reviewerName}</strong> has <strong>${
              isApproved ? 'approved' : 'rejected'
            }</strong> your agreement <strong>"${agreementTitle}"</strong>.
          </p>
          ${
            comments
              ? `<div style="background: #f4f4f5; padding: 12px; border-radius: 6px; margin: 12px 0; font-size: 14px; color: #333;"><strong>Feedback:</strong> ${comments}</div>`
              : ''
          }
          <a href="${this.webUrl}/agreements"
             style="display: inline-block; background: #18181b; color: white;
                    padding: 10px 20px; text-decoration: none; border-radius: 6px;
                    font-size: 14px; margin: 16px 0;">
            View Agreement
          </a>
        </div>
      `,
      { ...meta, eventType: isApproved ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED' },
    );
  }

  async sendSigningInvitationEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    senderName: string,
    signingToken: string,
    expiresAt?: Date | null,
    customMessage?: string,
    recipientRole = 'signer',
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    const signingUrl = `${this.webUrl}/sign/${encodeURIComponent(signingToken)}`;
    const actionLabel =
      recipientRole === 'reviewer'
        ? 'Review Document'
        : recipientRole === 'approver'
          ? 'Approve Document'
          : 'Review & Sign Document';

    await this.dispatch(
      to,
      `Action Required: "${agreementTitle}" via graphsign.ink`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #111; font-size: 20px;">${actionLabel}</h1>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            Hello ${recipientName},<br/><br/>
            <strong>${senderName}</strong> has sent you <strong>"${agreementTitle}"</strong> as a <strong>${recipientRole}</strong>.
          </p>
          ${
            customMessage
              ? `<div style="background: #eff6ff; border-left: 4px solid #2563eb; padding: 12px; margin: 16px 0; font-size: 14px; color: #1e3a8a;"><strong>Message from sender:</strong><br/>${customMessage}</div>`
              : ''
          }
          <a href="${signingUrl}"
             style="display: inline-block; background: #2563eb; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-size: 16px; margin: 16px 0; font-weight: bold;">
            ${actionLabel}
          </a>
          ${
            expiresAt
              ? `<p style="color: #dc2626; font-size: 13px;">This invitation will expire on ${expiresAt.toUTCString()}.</p>`
              : ''
          }
          <p style="color: #666; font-size: 12px;">
            Secure link: <a href="${signingUrl}" style="color: #2563eb;">${signingUrl}</a>
          </p>
        </div>
      `,
      { ...meta, recipientName, eventType: 'INVITATION' },
    );
  }

  async sendReminderEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    senderName: string,
    signingToken: string,
    expiresAt?: Date | null,
    customNote?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    const signingUrl = `${this.webUrl}/sign/${encodeURIComponent(signingToken)}`;
    await this.dispatch(
      to,
      `Reminder: Please sign "${agreementTitle}"`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #d97706; font-size: 20px;">Signing Reminder</h1>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            Hello ${recipientName},<br/><br/>
            This is a friendly reminder that <strong>"${agreementTitle}"</strong> sent by <strong>${senderName}</strong> is waiting for your signature.
          </p>
          ${
            customNote
              ? `<div style="background: #fef3c7; border-left: 4px solid #d97706; padding: 12px; margin: 16px 0; font-size: 14px; color: #92400e;"><strong>Sender note:</strong><br/>${customNote}</div>`
              : ''
          }
          <a href="${signingUrl}"
             style="display: inline-block; background: #2563eb; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-size: 16px; margin: 16px 0; font-weight: bold;">
            Complete Signing Now
          </a>
          ${
            expiresAt
              ? `<p style="color: #dc2626; font-size: 13px;">Deadline: ${expiresAt.toUTCString()}</p>`
              : ''
          }
        </div>
      `,
      { ...meta, recipientName, eventType: 'REMINDER' },
    );
  }

  async sendAgreementCompletedEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    downloadUrl?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    await this.dispatch(
      to,
      `Completed: "${agreementTitle}" has been signed by all parties`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #059669; font-size: 20px;">Document Execution Complete</h1>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            Hello ${recipientName},<br/><br/>
            All parties have finished executing <strong>"${agreementTitle}"</strong>. A tamper-evident cryptographic copy is permanently sealed in the audit trail.
          </p>
          ${
            downloadUrl
              ? `<a href="${downloadUrl}" style="display: inline-block; background: #059669; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-size: 15px; margin: 16px 0; font-weight: bold;">Download Executed Copy</a>`
              : ''
          }
        </div>
      `,
      { ...meta, recipientName, eventType: 'COMPLETED' },
    );
  }

  async sendAgreementDeclinedEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    declinerName: string,
    declinerEmail: string,
    reason?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    await this.dispatch(
      to,
      `Declined: "${agreementTitle}" signing was declined`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #dc2626; font-size: 20px;">Document Declined</h1>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            Hello ${recipientName},<br/><br/>
            <strong>${declinerName}</strong> (${declinerEmail}) has formally declined to sign <strong>"${agreementTitle}"</strong>.
          </p>
          ${
            reason
              ? `<div style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 6px; margin: 12px 0; font-size: 14px; color: #991b1b;"><strong>Reason provided:</strong> ${reason}</div>`
              : ''
          }
        </div>
      `,
      { ...meta, recipientName, eventType: 'DECLINED' },
    );
  }

  async sendAgreementCancelledEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    reason?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    await this.dispatch(
      to,
      `Cancelled: "${agreementTitle}" has been voided`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #dc2626; font-size: 20px;">Document Voided</h1>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            Hello ${recipientName},<br/><br/>
            The agreement <strong>"${agreementTitle}"</strong> has been cancelled by the sender.
          </p>
          ${
            reason
              ? `<div style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 6px; margin: 12px 0; font-size: 14px; color: #991b1b;"><strong>Reason:</strong> ${reason}</div>`
              : ''
          }
        </div>
      `,
      { ...meta, recipientName, eventType: 'CANCELLED' },
    );
  }

  async sendExpiryWarningEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    expiresAt: Date,
    signingToken: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    const signingUrl = `${this.webUrl}/sign/${encodeURIComponent(signingToken)}`;
    await this.dispatch(
      to,
      `Expiring Soon: "${agreementTitle}"`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #dc2626; font-size: 20px;">Document Expiring Soon</h1>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            Hello ${recipientName},<br/><br/>
            The agreement <strong>"${agreementTitle}"</strong> will expire on <strong>${expiresAt.toUTCString()}</strong>.
          </p>
          <a href="${signingUrl}" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 16px; margin: 16px 0; font-weight: bold;">Sign Before Expiration</a>
        </div>
      `,
      { ...meta, recipientName, eventType: 'EXPIRY_WARNING' },
    );
  }

  async sendAgreementExpiredEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    await this.dispatch(
      to,
      `Expired: "${agreementTitle}" signing deadline has passed`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #6b7280; font-size: 20px;">Document Expired</h1>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            Hello ${recipientName},<br/><br/>
            The signing deadline for <strong>"${agreementTitle}"</strong> has passed. The agreement is now marked as expired.
          </p>
        </div>
      `,
      { ...meta, recipientName, eventType: 'EXPIRED' },
    );
  }

  async sendOtpVerificationEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    otpCode: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    await this.dispatch(
      to,
      `Your verification code for "${agreementTitle}": ${otpCode}`,
      `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #ba0000; font-size: 20px;">Signer Verification Code</h1>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            Hello ${recipientName},<br/><br/>
            Please use the following 6-digit one-time verification code to confirm your signature for <strong>"${agreementTitle}"</strong>:
          </p>
          <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #ba0000;">
              ${otpCode}
            </span>
          </div>
          <p style="color: #64748b; font-size: 13px; line-height: 1.4;">
            This verification code is valid for 10 minutes. If you did not request this code or attempt to sign this document, please disregard this email.
          </p>
        </div>
      `,
      { ...meta, recipientName, eventType: 'GUEST_SIGNER_OTP' },
    );
  }
}

/**
 * Console-based mailer for development and tests.
 */
export class ConsoleMailerService implements MailerService {
  constructor(
    private readonly webUrl: string = 'http://localhost:3000',
    private readonly prisma?: PrismaClient,
  ) {}

  private async logDelivery(to: string, eventType: string, meta?: EmailTrackingMetadata) {
    if (this.prisma && meta?.organisationId) {
      try {
        await this.prisma.notificationLog.create({
          data: {
            id: generateId(),
            organisationId: meta.organisationId,
            agreementId: meta.agreementId,
            recipientId: meta.recipientId,
            recipientEmail: to,
            recipientName: meta.recipientName,
            eventType,
            channel: 'EMAIL',
            status: 'SENT',
            providerMessageId: `console-${Date.now()}`,
            attempts: 1,
            sentAt: new Date(),
          },
        });
      } catch (err) {
        console.error('[MAILER] Console delivery log error:', err);
      }
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    console.log(`[MAILER] Verify URL for ${to}: ${this.webUrl}/verify-email?token=${token}`);
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    console.log(`[MAILER] Reset URL for ${to}: ${this.webUrl}/reset-password?token=${token}`);
  }

  async sendEmailChangeVerificationEmail(to: string, token: string): Promise<void> {
    console.log(
      `[MAILER] Email change URL for ${to}: ${this.webUrl}/settings/profile?verifyToken=${token}`,
    );
  }

  async sendOrganisationInvitationEmail(
    to: string,
    orgName: string,
    role: string,
    token: string,
  ): Promise<void> {
    console.log(
      `[MAILER] Invite to ${orgName} (${role}) for ${to}: ${this.webUrl}/accept-invite?token=${token}`,
    );
  }

  async sendReviewRequestEmail(
    to: string,
    agreementTitle: string,
    authorName: string,
    notes?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    console.log(
      `[MAILER] Review request for ${to} on "${agreementTitle}" from ${authorName}: ${notes}`,
    );
    await this.logDelivery(to, 'REVIEW_REQUEST', meta);
  }

  async sendReviewDecisionEmail(
    to: string,
    agreementTitle: string,
    reviewerName: string,
    decision: 'APPROVE' | 'REJECT',
    comments?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    console.log(
      `[MAILER] Review decision ${decision} for ${to} on "${agreementTitle}" by ${reviewerName}: ${comments}`,
    );
    await this.logDelivery(
      to,
      decision === 'APPROVE' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED',
      meta,
    );
  }

  async sendSigningInvitationEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    senderName: string,
    signingToken: string,
    expiresAt?: Date | null,
    customMessage?: string,
    recipientRole = 'signer',
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    console.log(
      `[MAILER] Signing invite for ${recipientName} (${to}) as ${recipientRole} on "${agreementTitle}" from ${senderName}: token=${signingToken}, customMsg="${customMessage}", expires=${expiresAt}`,
    );
    await this.logDelivery(to, 'INVITATION', meta);
  }

  async sendReminderEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    senderName: string,
    signingToken: string,
    expiresAt?: Date | null,
    customNote?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    console.log(
      `[MAILER] Reminder for ${recipientName} (${to}) on "${agreementTitle}" from ${senderName}: token=${signingToken}, note="${customNote}", expires=${expiresAt}`,
    );
    await this.logDelivery(to, 'REMINDER', meta);
  }

  async sendAgreementCompletedEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    downloadUrl?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    console.log(
      `[MAILER] Completion notice for ${recipientName} (${to}) on "${agreementTitle}": download=${downloadUrl}`,
    );
    await this.logDelivery(to, 'COMPLETED', meta);
  }

  async sendAgreementDeclinedEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    declinerName: string,
    declinerEmail: string,
    reason?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    console.log(
      `[MAILER] Decline notice for ${recipientName} (${to}) on "${agreementTitle}": declinedBy=${declinerName} (${declinerEmail}), reason=${reason}`,
    );
    await this.logDelivery(to, 'DECLINED', meta);
  }

  async sendAgreementCancelledEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    reason?: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    console.log(
      `[MAILER] Cancellation notice for ${recipientName} (${to}) on "${agreementTitle}": reason=${reason}`,
    );
    await this.logDelivery(to, 'CANCELLED', meta);
  }

  async sendExpiryWarningEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    expiresAt: Date,
    signingToken: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    console.log(
      `[MAILER] Expiry warning for ${recipientName} (${to}) on "${agreementTitle}": token=${signingToken}, deadline=${expiresAt}`,
    );
    await this.logDelivery(to, 'EXPIRY_WARNING', meta);
  }

  async sendAgreementExpiredEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    console.log(
      `[MAILER] Agreement expired notice for ${recipientName} (${to}) on "${agreementTitle}"`,
    );
    await this.logDelivery(to, 'EXPIRED', meta);
  }

  async sendOtpVerificationEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    otpCode: string,
    meta?: EmailTrackingMetadata,
  ): Promise<void> {
    console.log(
      `[MAILER] OTP verification code for ${recipientName} (${to}) on "${agreementTitle}": ${otpCode}`,
    );
    await this.logDelivery(to, 'GUEST_SIGNER_OTP', meta);
  }
}

/**
 * Factory that selects the mailer implementation based on environment bindings.
 */
export function createMailerService(
  env: {
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    WEB_URL?: string;
  },
  prisma?: PrismaClient,
): MailerService {
  const webUrl =
    (env.WEB_URL ?? 'http://localhost:3000').split(',')[0]?.trim() || 'http://localhost:3000';

  if (env.RESEND_API_KEY) {
    return new ResendMailerService(
      env.RESEND_API_KEY,
      env.EMAIL_FROM ?? 'notification@mail.graphomy.com',
      webUrl,
      prisma,
    );
  }
  return new ConsoleMailerService(webUrl, prisma);
}
