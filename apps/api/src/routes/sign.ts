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
   * POST /api/v1/sign/:token/complete
   * INK-94, INK-96: Submit recipient signature and filled fields
   */
  sign.post('/:token/complete', async (c) => {
    const rawToken = c.req.param('token');
    const body = await c.req.json().catch(() => ({}));
    const parseResult = recipientSignSchema.safeParse(body);

    if (!parseResult.success) {
      throw new BadRequestError(
        parseResult.error.errors.map((e) => e.message).join(', '),
      );
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
      throw new BadRequestError(
        parseResult.error.errors.map((e) => e.message).join(', '),
      );
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

  return sign;
}
