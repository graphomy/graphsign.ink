import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { WorkflowService } from '../services/workflow-service.js';
import type { AuditService } from '../services/audit-service.js';
import { PrismaAuditService } from '../services/audit-service.js';
import type { MailerService } from '../services/mailer-service.js';
import { createMailerService } from '../services/mailer-service.js';
import {
  recipientSignSchema,
  declineSignSchema,
  electronicConsentSchema,
  verifyOtpSchema,
} from '../validators/workflow-validators.js';
import { BadRequestError } from '../utils/errors.js';
import { createRateLimiter } from '../middleware/rate-limiter.js';
import type { Env } from '../index.js';

export interface SignDeps {
  prisma?: PrismaClient;
  audit?: AuditService;
  mailer?: MailerService;
  workflowService?: WorkflowService;
}

export function createSignRoutes(deps?: SignDeps) {
  const sign = new Hono<{ Bindings: Env }>();

  sign.use('/*', createRateLimiter(60, 60_000));

  function getServices(c: any) {
    if (deps?.workflowService) return { service: deps.workflowService };

    let prisma = deps?.prisma;
    if (!prisma) {
      const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL;
      const isValidUrl =
        dbUrl &&
        typeof dbUrl === 'string' &&
        dbUrl.trim() !== '' &&
        (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'));

      if (isValidUrl) {
        prisma = createPrismaClient(dbUrl);
      } else {
        prisma = getLegacyPrisma();
      }
    }

    const audit = deps?.audit || new PrismaAuditService(prisma);
    const mailer =
      deps?.mailer ||
      createMailerService({
        RESEND_API_KEY: c.env?.RESEND_API_KEY,
        EMAIL_FROM: c.env?.EMAIL_FROM,
        WEB_URL: c.env?.WEB_URL,
      });

    const service = new WorkflowService(prisma, audit, mailer);
    return { service };
  }

  /**
   * GET /api/v1/sign/:token
   * INK-90, INK-91: Fetch agreement and recipient envelope for signing
   */
  sign.get('/:token', async (c) => {
    const rawToken = c.req.param('token');
    const { service } = getServices(c);

    const session = await service.getPublicSigningSession(rawToken);
    return c.json({ success: true, data: session });
  });

  /**
   * POST /api/v1/sign/:token/consent
   * INK-99: Capture explicit Electronic Record & Signature Disclosure (ERSD) consent
   */
  sign.post('/:token/consent', async (c) => {
    const rawToken = c.req.param('token');
    const body = await c.req.json().catch(() => ({}));
    const parseResult = electronicConsentSchema.safeParse(body);

    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.errors.map((e) => e.message).join(', '));
    }

    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip');
    const userAgent = c.req.header('user-agent');
    const { service } = getServices(c);

    const result = await service.recordElectronicConsent(rawToken, parseResult.data, ip, userAgent);
    return c.json({ success: true, data: result });
  });

  /**
   * POST /api/v1/sign/:token/view
   * INK-93: Mark document viewed event
   */
  sign.post('/:token/view', async (c) => {
    const rawToken = c.req.param('token');
    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip');
    const userAgent = c.req.header('user-agent');
    const { service } = getServices(c);

    const result = await service.trackRecipientView(rawToken, ip, userAgent);
    return c.json({ success: true, data: result });
  });

  /**
   * POST /api/v1/sign/:token/otp/send
   * INK-266: Dispatch 6-digit OTP verification code to recipient email
   */
  sign.post('/:token/otp/send', async (c) => {
    const rawToken = c.req.param('token');
    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip');
    const userAgent = c.req.header('user-agent');
    const { service } = getServices(c);

    const result = await service.sendSignerOtp(rawToken, ip, userAgent);
    return c.json({ success: true, data: result });
  });

  /**
   * POST /api/v1/sign/:token/otp/verify
   * INK-266: Verify 6-digit OTP verification code
   */
  sign.post('/:token/otp/verify', async (c) => {
    const rawToken = c.req.param('token');
    const body = await c.req.json().catch(() => ({}));
    const parseResult = verifyOtpSchema.safeParse(body);

    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.errors.map((e) => e.message).join(', '));
    }

    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip');
    const userAgent = c.req.header('user-agent');
    const { service } = getServices(c);

    const result = await service.verifySignerOtp(rawToken, parseResult.data.otpCode, ip, userAgent);
    return c.json({ success: true, data: result });
  });

  /**
   * POST /api/v1/sign/:token/complete
   * INK-94, INK-96, INK-104: Submit recipient signature and filled fields
   */
  sign.post('/:token/complete', async (c) => {
    const rawToken = c.req.param('token');
    const body = await c.req.json().catch(() => ({}));
    const parseResult = recipientSignSchema.safeParse(body);

    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.errors.map((e) => e.message).join(', '));
    }

    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip');
    const userAgent = c.req.header('user-agent');
    const { service } = getServices(c);

    const result = await service.submitRecipientSignature(
      rawToken,
      parseResult.data,
      ip,
      userAgent,
    );

    return c.json({ success: true, data: result });
  });

  /**
   * POST /api/v1/sign/:token/decline
   * INK-95: Decline signing with reason
   */
  sign.post('/:token/decline', async (c) => {
    const rawToken = c.req.param('token');
    const body = await c.req.json().catch(() => ({}));
    const parseResult = declineSignSchema.safeParse(body);

    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.errors.map((e) => e.message).join(', '));
    }

    const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip');
    const userAgent = c.req.header('user-agent');
    const { service } = getServices(c);

    const result = await service.declineRecipientSignature(
      rawToken,
      parseResult.data,
      ip,
      userAgent,
    );

    return c.json({ success: true, data: result });
  });

  /**
   * GET /api/v1/sign/:token/file
   * Stream agreement PDF or Markdown binary for public signer preview (INK-272)
   */
  sign.get('/:token/file', async (c) => {
    const rawToken = c.req.param('token');
    const { service } = getServices(c);

    const file = await service.getSigningDocumentFile(rawToken);

    if (file.fileData) {
      const base64Content = file.fileData.includes(',')
        ? file.fileData.split(',')[1]
        : file.fileData;
      const buffer = Buffer.from(base64Content || '', 'base64');
      return c.body(buffer as any, 200, {
        'Content-Type': file.mimeType || 'application/pdf',
        'Content-Disposition': `inline; filename="${file.fileName || 'document.pdf'}"`,
      });
    }

    if (file.markdownContent) {
      return c.text(file.markdownContent, 200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `inline; filename="${file.fileName || 'agreement.md'}"`,
      });
    }

    // Fallback standard PDF structure if stored without raw binary in metadata
    const fallbackPdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF`;
    return c.body(fallbackPdf, 200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${file.fileName || 'document.pdf'}"`,
    });
  });

  /**
   * GET /api/v1/sign/:token/download
   * INK-105 & INK-272: Public tokenized download for executed / signed document
   */
  sign.get('/:token/download', async (c) => {
    const rawToken = c.req.param('token');
    const { service } = getServices(c);

    const file = await service.getSigningDocumentFile(rawToken);

    if (file.fileData) {
      const base64Content = file.fileData.includes(',')
        ? file.fileData.split(',')[1]
        : file.fileData;
      const buffer = Buffer.from(base64Content || '', 'base64');
      c.header('Content-Type', file.mimeType || 'application/pdf');
      c.header(
        'Content-Disposition',
        `attachment; filename="${file.fileName || 'signed-document.pdf'}"`,
      );
      if ((file as any).verificationToken) {
        c.header('X-Verification-Token', (file as any).verificationToken);
      }
      if ((file as any).documentHash) {
        c.header('X-Document-SHA256', (file as any).documentHash);
      }
      return c.body(buffer as any);
    }

    if (file.markdownContent) {
      c.header('Content-Type', 'text/markdown; charset=utf-8');
      c.header(
        'Content-Disposition',
        `attachment; filename="${file.fileName.replace(/\.pdf$/, '.md')}"`,
      );
      if ((file as any).verificationToken) {
        c.header('X-Verification-Token', (file as any).verificationToken);
      }
      if ((file as any).documentHash) {
        c.header('X-Document-SHA256', (file as any).documentHash);
      }
      return c.text(file.markdownContent);
    }

    // Fallback standard PDF if raw binary was not stored
    const fallbackPdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF`;
    c.header('Content-Type', 'application/pdf');
    c.header(
      'Content-Disposition',
      `attachment; filename="${file.fileName || 'signed-document.pdf'}"`,
    );
    if ((file as any).verificationToken) {
      c.header('X-Verification-Token', (file as any).verificationToken);
    }
    if ((file as any).documentHash) {
      c.header('X-Document-SHA256', (file as any).documentHash);
    }
    return c.body(fallbackPdf);
  });

  return sign;
}
