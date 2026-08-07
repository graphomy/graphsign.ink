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
