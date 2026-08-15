import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { WorkflowService } from '../services/workflow-service.js';
import type { AuditService } from '../services/audit-service.js';
import { PrismaAuditService } from '../services/audit-service.js';
import type { MailerService } from '../services/mailer-service.js';
import { createMailerService } from '../services/mailer-service.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import {
  submitReviewSchema,
  reviewDecisionSchema,
  sendAgreementSchema,
  cancelAgreementSchema,
} from '../validators/workflow-validators.js';
import { BadRequestError } from '../utils/errors.js';
import { enforceTenantActiveStatus } from '../middleware/tenant-status-middleware.js';
import { createRateLimiter } from '../middleware/rate-limiter.js';
import type { Env } from '../index.js';

export interface WorkflowDeps {
  prisma?: PrismaClient;
  audit?: AuditService;
  mailer?: MailerService;
  workflowService?: WorkflowService;
}

export function createWorkflowRoutes(deps?: WorkflowDeps) {
  const workflow = new Hono<{ Bindings: Env }>();

  workflow.use('/*', createRateLimiter(100, 60_000));

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

  // All agreement workflow routes require authentication & tenant status check
  workflow.use('/*', jwtAuth());
  workflow.use('/*', enforceTenantActiveStatus());

  /**
   * POST /api/v1/agreements/:id/review/submit
   * INK-87: Submit document for review
   */
  workflow.post('/:id/review/submit', async (c) => {
    const agreementId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const parseResult = submitReviewSchema.safeParse(body);

    if (!parseResult.success) {
      throw new BadRequestError(
        parseResult.error.errors.map((e) => e.message).join(', '),
      );
    }

    const userPayload = c.get('userPayload') as any;
    const { service } = getServices(c);

    const result = await service.submitForReview(
      {
        userId: userPayload?.sub || 'unknown',
        userEmail: userPayload?.email,
        userName: userPayload?.name,
        organisationId: userPayload?.orgId || 'default-org-id',
        role: userPayload?.role || 'user',
        ipAddress: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
        userAgent: c.req.header('user-agent'),
      },
      agreementId,
      parseResult.data,
    );

    return c.json({ success: true, data: result });
  });

  /**
   * POST /api/v1/agreements/:id/review/approve
   * INK-88: Approve document
   */
  workflow.post('/:id/review/approve', async (c) => {
    const agreementId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const parseResult = reviewDecisionSchema.safeParse({ ...body, decision: 'APPROVE' });

    if (!parseResult.success) {
      throw new BadRequestError(
        parseResult.error.errors.map((e) => e.message).join(', '),
      );
    }

    const userPayload = c.get('userPayload') as any;
    const { service } = getServices(c);

    const result = await service.approveAgreement(
      {
        userId: userPayload?.sub || 'unknown',
        userEmail: userPayload?.email,
        userName: userPayload?.name,
        organisationId: userPayload?.orgId || 'default-org-id',
        role: userPayload?.role || 'user',
        ipAddress: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
        userAgent: c.req.header('user-agent'),
      },
      agreementId,
      parseResult.data,
    );

    return c.json({ success: true, data: result });
  });

  /**
   * POST /api/v1/agreements/:id/review/reject
   * INK-89: Reject document
   */
  workflow.post('/:id/review/reject', async (c) => {
    const agreementId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const parseResult = reviewDecisionSchema.safeParse({ ...body, decision: 'REJECT' });

    if (!parseResult.success) {
      throw new BadRequestError(
        parseResult.error.errors.map((e) => e.message).join(', '),
      );
    }

    const userPayload = c.get('userPayload') as any;
    const { service } = getServices(c);

    const result = await service.rejectAgreement(
      {
        userId: userPayload?.sub || 'unknown',
        userEmail: userPayload?.email,
        userName: userPayload?.name,
        organisationId: userPayload?.orgId || 'default-org-id',
        role: userPayload?.role || 'user',
        ipAddress: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
        userAgent: c.req.header('user-agent'),
      },
      agreementId,
      parseResult.data,
    );

    return c.json({ success: true, data: result });
  });

  /**
   * POST /api/v1/agreements/:id/send
   * INK-90, INK-91, INK-92: Send agreement for signature
   */
  workflow.post('/:id/send', async (c) => {
    const agreementId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const parseResult = sendAgreementSchema.safeParse(body);

    if (!parseResult.success) {
      throw new BadRequestError(
        parseResult.error.errors.map((e) => e.message).join(', '),
      );
    }

    const userPayload = c.get('userPayload') as any;
    const { service } = getServices(c);

    const result = await service.sendForSignature(
      {
        userId: userPayload?.sub || 'unknown',
        userEmail: userPayload?.email,
        userName: userPayload?.name,
        organisationId: userPayload?.orgId || 'default-org-id',
        role: userPayload?.role || 'user',
        ipAddress: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
        userAgent: c.req.header('user-agent'),
      },
      agreementId,
      parseResult.data,
    );

    return c.json({ success: true, data: result });
  });

  /**
   * POST /api/v1/agreements/:id/cancel
   * INK-95: Cancel / Void agreement
   */
  workflow.post('/:id/cancel', async (c) => {
    const agreementId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const parseResult = cancelAgreementSchema.safeParse(body);

    if (!parseResult.success) {
      throw new BadRequestError(
        parseResult.error.errors.map((e) => e.message).join(', '),
      );
    }

    const userPayload = c.get('userPayload') as any;
    const { service } = getServices(c);

    const result = await service.cancelAgreement(
      {
        userId: userPayload?.sub || 'unknown',
        userEmail: userPayload?.email,
        userName: userPayload?.name,
        organisationId: userPayload?.orgId || 'default-org-id',
        role: userPayload?.role || 'user',
        ipAddress: c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip'),
        userAgent: c.req.header('user-agent'),
      },
      agreementId,
      parseResult.data,
    );

    return c.json({ success: true, data: result });
  });

  /**
   * POST /api/v1/agreements/cron/check-expired
   * INK-95: Check expired agreements cron hook
   */
  workflow.post('/cron/check-expired', async (c) => {
    const { service } = getServices(c);
    const result = await service.checkExpiredAgreements();
    return c.json({ success: true, data: result });
  });

  return workflow;
}
