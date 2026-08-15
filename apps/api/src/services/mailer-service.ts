import { Resend } from 'resend';

/**
 * Mailer service abstraction.
 * Production: sends via Resend API.
 * Development: logs to console when RESEND_API_KEY is not set.
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
  ): Promise<void>;
  sendReviewDecisionEmail(
    to: string,
    agreementTitle: string,
    reviewerName: string,
    decision: 'APPROVE' | 'REJECT',
    comments?: string,
  ): Promise<void>;
  sendSigningInvitationEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    senderName: string,
    signingToken: string,
    expiresAt?: Date | null,
  ): Promise<void>;
  sendAgreementCompletedEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
  ): Promise<void>;
  sendAgreementCancelledEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    reason?: string,
  ): Promise<void>;
}

/**
 * Resend-backed email service.
 * Receives config values explicitly for Cloudflare Workers context.
 */
export class ResendMailerService implements MailerService {
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly from: string = 'noreply@graphsign.ink',
    private readonly webUrl: string = 'http://localhost:3000',
  ) {
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is required for ResendMailerService.');
    }
    this.resend = new Resend(apiKey);
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const verifyUrl = `${this.webUrl}/verify-email?token=${encodeURIComponent(token)}`;

    await this.resend.emails.send({
      from: this.from,
      to,
      subject: 'Verify your graphsign.ink account',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #111; font-size: 24px;">Welcome to graphsign.ink</h1>
          <p style="color: #333; font-size: 16px; line-height: 1.5;">
            Please verify your email address by clicking the button below.
          </p>
          <a href="${verifyUrl}"
             style="display: inline-block; background: #ba0000; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-size: 16px; margin: 16px 0;">
            Verify Email
          </a>
          <p style="color: #666; font-size: 14px;">
            This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
          </p>
          <p style="color: #999; font-size: 12px;">
            If the button doesn't work, copy and paste this URL into your browser:<br/>
            <a href="${verifyUrl}" style="color: #ba0000;">${verifyUrl}</a>
          </p>
        </div>
      `,
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = `${this.webUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await this.resend.emails.send({
      from: this.from,
      to,
      subject: 'Reset your graphsign.ink password',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #111; font-size: 24px;">Password Reset Request</h1>
          <p style="color: #333; font-size: 16px; line-height: 1.5;">
            We received a request to reset your graphsign.ink account password. Click the button below to choose a new password.
          </p>
          <a href="${resetUrl}"
             style="display: inline-block; background: #ba0000; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-size: 16px; margin: 16px 0;">
            Reset Password
          </a>
          <p style="color: #666; font-size: 14px;">
            This reset link is valid for 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
          <p style="color: #999; font-size: 12px;">
            If the button doesn't work, copy and paste this URL into your browser:<br/>
            <a href="${resetUrl}" style="color: #ba0000;">${resetUrl}</a>
          </p>
        </div>
      `,
    });
  }

  async sendEmailChangeVerificationEmail(to: string, token: string): Promise<void> {
    const verifyUrl = `${this.webUrl}/settings/profile?verifyToken=${encodeURIComponent(token)}`;

    await this.resend.emails.send({
      from: this.from,
      to,
      subject: 'Confirm your new email address for graphsign.ink',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #111; font-size: 24px;">Confirm New Email Address</h1>
          <p style="color: #333; font-size: 16px; line-height: 1.5;">
            You requested to change your primary email address for graphsign.ink. Click the button below to confirm this change.
          </p>
          <a href="${verifyUrl}"
             style="display: inline-block; background: #ba0000; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-size: 16px; margin: 16px 0;">
            Confirm New Email
          </a>
          <p style="color: #666; font-size: 14px;">
            This link expires in 24 hours. If you did not request this email change, please secure your account.
          </p>
        </div>
      `,
    });
  }

  async sendOrganisationInvitationEmail(
    to: string,
    orgName: string,
    role: string,
    token: string,
  ): Promise<void> {
    const inviteUrl = `${this.webUrl}/accept-invite?token=${encodeURIComponent(token)}`;

    await this.resend.emails.send({
      from: this.from,
      to,
      subject: `You have been invited to join ${orgName} on graphsign.ink`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #111; font-size: 24px;">Invitation to join ${orgName}</h1>
          <p style="color: #333; font-size: 16px; line-height: 1.5;">
            You have been invited to join <strong>${orgName}</strong> as a <strong>${role}</strong> on graphsign.ink.
          </p>
          <a href="${inviteUrl}"
             style="display: inline-block; background: #ba0000; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-size: 16px; margin: 16px 0;">
            Accept Invitation
          </a>
          <p style="color: #666; font-size: 14px;">
            This invitation expires in 7 days.
          </p>
        </div>
      `,
    });
  }

  async sendReviewRequestEmail(
    to: string,
    agreementTitle: string,
    authorName: string,
    notes?: string,
  ): Promise<void> {
    const reviewUrl = `${this.webUrl}/agreements`;

    await this.resend.emails.send({
      from: this.from,
      to,
      subject: `Review Request: "${agreementTitle}" on graphsign.ink`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #111; font-size: 20px;">Review Request</h1>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            <strong>${authorName}</strong> has submitted the agreement <strong>"${agreementTitle}"</strong> for your review.
          </p>
          ${
            notes
              ? `<div style="background: #f4f4f5; padding: 12px; border-radius: 6px; margin: 12px 0; font-size: 14px; color: #333;"><strong>Author notes:</strong> ${notes}</div>`
              : ''
          }
          <a href="${reviewUrl}"
             style="display: inline-block; background: #2563eb; color: white;
                    padding: 10px 20px; text-decoration: none; border-radius: 6px;
                    font-size: 15px; margin: 16px 0; font-weight: bold;">
            Open Agreements to Review
          </a>
        </div>
      `,
    });
  }

  async sendReviewDecisionEmail(
    to: string,
    agreementTitle: string,
    reviewerName: string,
    decision: 'APPROVE' | 'REJECT',
    comments?: string,
  ): Promise<void> {
    const isApproved = decision === 'APPROVE';
    const statusColor = isApproved ? '#059669' : '#dc2626';

    await this.resend.emails.send({
      from: this.from,
      to,
      subject: `Document ${isApproved ? 'Approved' : 'Rejected'}: "${agreementTitle}"`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
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
              ? `<div style="background: #f4f4f5; padding: 12px; border-radius: 6px; margin: 12px 0; font-size: 14px; color: #333;"><strong>Feedback comments:</strong> ${comments}</div>`
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
    });
  }

  async sendSigningInvitationEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    senderName: string,
    signingToken: string,
    expiresAt?: Date | null,
  ): Promise<void> {
    const signingUrl = `${this.webUrl}/sign/${encodeURIComponent(signingToken)}`;

    await this.resend.emails.send({
      from: this.from,
      to,
      subject: `Please sign: "${agreementTitle}" via graphsign.ink`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #111; font-size: 20px;">You have a document to sign</h1>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            Hello ${recipientName},<br/><br/>
            <strong>${senderName}</strong> has sent you <strong>"${agreementTitle}"</strong> to review and sign.
          </p>
          <a href="${signingUrl}"
             style="display: inline-block; background: #2563eb; color: white;
                    padding: 12px 24px; text-decoration: none; border-radius: 6px;
                    font-size: 16px; margin: 16px 0; font-weight: bold;">
            Review & Sign Document
          </a>
          ${
            expiresAt
              ? `<p style="color: #dc2626; font-size: 13px;">This invitation will expire on ${expiresAt.toUTCString()}.</p>`
              : ''
          }
          <p style="color: #666; font-size: 12px;">
            Secure link: <a href="${signingUrl}">${signingUrl}</a>
          </p>
        </div>
      `,
    });
  }

  async sendAgreementCompletedEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
  ): Promise<void> {
    await this.resend.emails.send({
      from: this.from,
      to,
      subject: `Completed: "${agreementTitle}" has been signed by all parties`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #059669; font-size: 20px;">Document Execution Completed</h1>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            Hello ${recipientName},<br/><br/>
            All parties have finished signing <strong>"${agreementTitle}"</strong>. A copy of this completed agreement is now permanently recorded in the audit trail.
          </p>
        </div>
      `,
    });
  }

  async sendAgreementCancelledEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    reason?: string,
  ): Promise<void> {
    await this.resend.emails.send({
      from: this.from,
      to,
      subject: `Cancelled: "${agreementTitle}" has been voided`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626; font-size: 20px;">Document Cancelled</h1>
          <p style="color: #333; font-size: 15px; line-height: 1.5;">
            Hello ${recipientName},<br/><br/>
            The agreement <strong>"${agreementTitle}"</strong> has been cancelled by the author and is no longer available for signing.
          </p>
          ${
            reason
              ? `<div style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 6px; margin: 12px 0; font-size: 14px; color: #991b1b;"><strong>Reason:</strong> ${reason}</div>`
              : ''
          }
        </div>
      `,
    });
  }
}

/**
 * Console-based mailer for local development.
 * Logs the verification URL to console instead of sending an email.
 */
export class ConsoleMailerService implements MailerService {
  constructor(private readonly webUrl: string = 'http://localhost:3000') {}

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const verifyUrl = `${this.webUrl}/verify-email?token=${encodeURIComponent(token)}`;
    console.log(`[MAILER] Verification email for ${to}:`);
    console.log(`[MAILER] Verify URL: ${verifyUrl}`);
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = `${this.webUrl}/reset-password?token=${encodeURIComponent(token)}`;
    console.log(`[MAILER] Password reset email for ${to}:`);
    console.log(`[MAILER] Reset URL: ${resetUrl}`);
  }

  async sendEmailChangeVerificationEmail(to: string, token: string): Promise<void> {
    const verifyUrl = `${this.webUrl}/settings/profile?verifyToken=${encodeURIComponent(token)}`;
    console.log(`[MAILER] Email change verification email for ${to}:`);
    console.log(`[MAILER] Verify URL: ${verifyUrl}`);
  }

  async sendOrganisationInvitationEmail(
    to: string,
    orgName: string,
    role: string,
    token: string,
  ): Promise<void> {
    const inviteUrl = `${this.webUrl}/accept-invite?token=${encodeURIComponent(token)}`;
    console.log(`[MAILER] Invitation to ${orgName} (${role}) for ${to}:`);
    console.log(`[MAILER] Invite URL: ${inviteUrl}`);
  }

  async sendReviewRequestEmail(
    to: string,
    agreementTitle: string,
    authorName: string,
    notes?: string,
  ): Promise<void> {
    console.log(
      `[MAILER] Review request for ${to} on "${agreementTitle}" from ${authorName}: notes="${notes}"`,
    );
  }

  async sendReviewDecisionEmail(
    to: string,
    agreementTitle: string,
    reviewerName: string,
    decision: 'APPROVE' | 'REJECT',
    comments?: string,
  ): Promise<void> {
    console.log(
      `[MAILER] Review decision (${decision}) for ${to} on "${agreementTitle}" by ${reviewerName}: comments="${comments}"`,
    );
  }

  async sendSigningInvitationEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    senderName: string,
    signingToken: string,
    expiresAt?: Date | null,
  ): Promise<void> {
    const signingUrl = `${this.webUrl}/sign/${encodeURIComponent(signingToken)}`;
    console.log(
      `[MAILER] Signing invitation for ${recipientName} (${to}) for "${agreementTitle}" from ${senderName}: url=${signingUrl}, expiresAt=${expiresAt}`,
    );
  }

  async sendAgreementCompletedEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
  ): Promise<void> {
    console.log(
      `[MAILER] Agreement completed notice for ${recipientName} (${to}) on "${agreementTitle}"`,
    );
  }

  async sendAgreementCancelledEmail(
    to: string,
    recipientName: string,
    agreementTitle: string,
    reason?: string,
  ): Promise<void> {
    console.log(
      `[MAILER] Agreement cancelled notice for ${recipientName} (${to}) on "${agreementTitle}": reason="${reason}"`,
    );
  }
}

/**
 * Factory that selects the mailer implementation based on environment bindings.
 */
export function createMailerService(env: {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  WEB_URL?: string;
}): MailerService {
  const webUrl =
    (env.WEB_URL ?? 'http://localhost:3000').split(',')[0]?.trim() || 'http://localhost:3000';

  if (env.RESEND_API_KEY) {
    return new ResendMailerService(
      env.RESEND_API_KEY,
      env.EMAIL_FROM ?? 'notification@mail.graphomy.com',
      webUrl,
    );
  }
  console.warn('[MAILER] RESEND_API_KEY not set — using console mailer for development.');
  return new ConsoleMailerService(webUrl);
}
