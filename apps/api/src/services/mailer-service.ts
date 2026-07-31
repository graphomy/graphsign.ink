import { Resend } from 'resend';

/**
 * Mailer service abstraction.
 * Production: sends via Resend API.
 * Development: logs to console when RESEND_API_KEY is not set.
 */
export interface MailerService {
  sendVerificationEmail(to: string, token: string): Promise<void>;
}

/**
 * Resend-backed email service.
 * Uses the RESEND_API_KEY environment variable.
 */
export class ResendMailerService implements MailerService {
  private readonly resend: Resend;
  private readonly from: string;
  private readonly webUrl: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is required for ResendMailerService.');
    }
    this.resend = new Resend(apiKey);
    this.from = process.env.EMAIL_FROM ?? 'noreply@graphsign.ink';
    this.webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
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
}

/**
 * Console-based mailer for local development.
 * Logs the verification URL to stdout instead of sending an email.
 */
export class ConsoleMailerService implements MailerService {
  private readonly webUrl: string;

  constructor() {
    this.webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const verifyUrl = `${this.webUrl}/verify-email?token=${encodeURIComponent(token)}`;
    console.log(`[MAILER] Verification email for ${to}:`);
    console.log(`[MAILER] Verify URL: ${verifyUrl}`);
  }
}

/**
 * Factory that selects the mailer implementation based on environment.
 */
export function createMailerService(): MailerService {
  if (process.env.RESEND_API_KEY) {
    return new ResendMailerService();
  }
  console.warn('[MAILER] RESEND_API_KEY not set — using console mailer for development.');
  return new ConsoleMailerService();
}
