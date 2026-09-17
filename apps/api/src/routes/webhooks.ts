import { Hono } from 'hono';
import { z } from 'zod';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { apiAuth, requireScopes } from '../middleware/api-auth.js';
import { WebhookSigningService } from '../services/webhook-signing-service.js';
import { WebhookDispatchService } from '../services/webhook-dispatch-service.js';
import { WebhookDeliveryService } from '../services/webhook-delivery-service.js';
import { validateWebhookUrl } from '../services/safe-webhook-transport.js';
import {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_EVENT_REGISTRY,
  type WebhookEventType,
} from '../contracts/webhook-events.js';
import { API_SCOPES } from '../types/principal.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import type { Env } from '../index.js';

const createWebhookSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  targetUrl: z.string().url().max(1024),
  eventTypes: z
    .array(z.string())
    .min(1, 'At least one event type must be selected')
    .refine((types) => types.every((t) => t === '*' || WEBHOOK_EVENT_TYPES.includes(t as any)), {
      message: 'Invalid webhook event type',
    }),
  filterRules: z.record(z.string(), z.unknown()).optional(),
  payloadProjection: z
    .object({
      mode: z.enum(['ALL', 'CUSTOM']),
      includeFields: z.array(z.string()).optional(),
    })
    .optional(),
  rateLimitPerMinute: z.number().int().min(1).max(1000).default(10),
  customHeaders: z.record(z.string(), z.string()).optional(),
});

const updateWebhookSchema = createWebhookSchema.partial().extend({
  status: z.enum(['active', 'disabled']).optional(),
});

export interface WebhookDeps {
  prisma?: PrismaClient;
  dispatchService?: WebhookDispatchService;
  deliveryService?: WebhookDeliveryService;
  signingService?: WebhookSigningService;
}

export function createWebhookRoutes(deps?: WebhookDeps) {
  const router = new Hono<{ Bindings: Env }>();
  let cachedPrisma: PrismaClient | undefined;

  function getServices(c: any) {
    let prisma = deps?.prisma;
    if (!prisma) {
      if (cachedPrisma) {
        prisma = cachedPrisma;
      } else {
        const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL;
        const isValidUrl =
          dbUrl &&
          typeof dbUrl === 'string' &&
          dbUrl.trim() !== '' &&
          (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'));
        prisma = isValidUrl ? createPrismaClient(dbUrl) : getLegacyPrisma();
        cachedPrisma = prisma;
      }
    }

    const dispatchService = deps?.dispatchService || new WebhookDispatchService(prisma);
    const deliveryService = deps?.deliveryService || new WebhookDeliveryService(prisma);
    const signingService = deps?.signingService || new WebhookSigningService();

    return { prisma, dispatchService, deliveryService, signingService };
  }

  // Public event catalog endpoint
  router.get('/events', (c) => {
    return c.json({
      events: Object.values(WEBHOOK_EVENT_REGISTRY),
    });
  });

  // Authenticated endpoints
  router.use('/*', async (c, next) => {
    const { prisma } = getServices(c);
    (c as any).prisma = prisma;
    await next();
  });
  router.use('/*', apiAuth({ prisma: deps?.prisma }));

  /**
   * GET /api/v1/webhooks
   * List subscriptions for organisation
   */
  router.get('/', requireScopes(API_SCOPES.WEBHOOKS_READ), async (c) => {
    const { prisma } = getServices(c);
    const principal = c.get('principal');

    const subscriptions = await prisma.webhookSubscription.findMany({
      where: {
        organisationId: principal.organisationId,
        deletedAt: null,
      },
      include: {
        signingKeys: {
          where: { retiredAt: null },
          select: { keyId: true, activeFrom: true },
          take: 1,
        },
        _count: {
          select: { deliveries: true, deadLetters: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = subscriptions.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      targetUrl: s.targetUrl,
      httpMethod: s.httpMethod,
      eventTypes: s.eventTypes,
      rateLimitPerMinute: s.rateLimitPerMinute,
      status: s.status,
      filterRules: s.filterRules,
      payloadProjection: s.payloadProjection,
      keyId: s.signingKeys?.[0]?.keyId || (s.signingKeys?.[0] as any)?.id,
      keyHint: (s.signingKeys?.[0] as any)?.keyHint,
      totalDeliveries: s._count?.deliveries ?? 0,
      deadLetterCount: s._count?.deadLetters ?? 0,
      createdAt: s.createdAt?.toISOString?.() || s.createdAt,
      updatedAt: s.updatedAt?.toISOString?.() || s.updatedAt,
    }));

    return c.json({
      data: mapped,
      subscriptions: mapped,
    });
  });

  /**
   * POST /api/v1/webhooks
   * INK-157, INK-159: Create subscription and return secret once
   */
  router.post('/', requireScopes(API_SCOPES.WEBHOOKS_MANAGE), async (c) => {
    const { prisma, signingService } = getServices(c);
    const principal = c.get('principal');

    const body = await c.req.json().catch(() => ({}));
    const parseResult = createWebhookSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues.map((i) => i.message).join(', '));
    }

    const input = parseResult.data;
    const isDev = (c.env as any)?.NODE_ENV !== 'production';
    const urlValidation = validateWebhookUrl(input.targetUrl, isDev);
    if (!urlValidation.valid) {
      throw new BadRequestError(urlValidation.error || 'Invalid webhook target URL');
    }

    const secret = signingService?.generateSecret
      ? signingService.generateSecret()
      : WebhookSigningService.generateSecret();
    const keyId = `whsec_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;

    const encryptedCustomHeaders = input.customHeaders ? JSON.stringify(input.customHeaders) : null;

    const subscription = await prisma.webhookSubscription.create({
      data: {
        organisationId: principal.organisationId,
        ownerId: principal.userId || principal.id,
        name: input.name,
        description: input.description,
        targetUrl: input.targetUrl,
        eventTypes: input.eventTypes,
        filterRules: input.filterRules as any,
        payloadProjection: input.payloadProjection as any,
        rateLimitPerMinute: input.rateLimitPerMinute,
        encryptedCustomHeaders,
      },
    });

    await prisma.webhookSigningKey.create({
      data: {
        organisationId: principal.organisationId,
        subscriptionId: subscription.id,
        keyId,
        encryptedSecret: secret,
      },
    });

    const createdAtStr = subscription.createdAt?.toISOString?.() || new Date().toISOString();
    const subObj = {
      id: subscription.id,
      name: subscription.name,
      description: subscription.description,
      targetUrl: subscription.targetUrl,
      eventTypes: subscription.eventTypes,
      rateLimitPerMinute: subscription.rateLimitPerMinute,
      status: subscription.status,
      createdAt: createdAtStr,
      updatedAt: subscription.updatedAt?.toISOString?.() || createdAtStr,
    };

    return c.json(
      {
        ...subObj,
        subscription: subObj,
        keyId,
        secret, // Returned ONLY upon creation!
        message: 'Save this webhook secret safely. It will never be shown again.',
      },
      201,
    );
  });

  /**
   * GET /api/v1/webhooks/:id
   */
  router.get('/:id', requireScopes(API_SCOPES.WEBHOOKS_READ), async (c) => {
    const { prisma } = getServices(c);
    const principal = c.get('principal');
    const id = c.req.param('id');

    const sub = await prisma.webhookSubscription.findFirst({
      where: {
        id,
        organisationId: principal.organisationId,
        deletedAt: null,
      },
      include: {
        signingKeys: {
          select: { keyId: true, activeFrom: true, retiredAt: true, graceUntil: true },
        },
      },
    });

    if (!sub) throw new NotFoundError('Webhook subscription not found');

    return c.json({
      id: sub.id,
      name: sub.name,
      description: sub.description,
      targetUrl: sub.targetUrl,
      eventTypes: sub.eventTypes,
      filterRules: sub.filterRules,
      payloadProjection: sub.payloadProjection,
      rateLimitPerMinute: sub.rateLimitPerMinute,
      status: sub.status,
      keys: sub.signingKeys,
      createdAt: sub.createdAt.toISOString(),
      updatedAt: sub.updatedAt.toISOString(),
    });
  });

  /**
   * PATCH /api/v1/webhooks/:id
   */
  router.patch('/:id', requireScopes(API_SCOPES.WEBHOOKS_MANAGE), async (c) => {
    const { prisma } = getServices(c);
    const principal = c.get('principal');
    const id = c.req.param('id');

    const sub = await prisma.webhookSubscription.findFirst({
      where: { id, organisationId: principal.organisationId, deletedAt: null },
    });
    if (!sub) throw new NotFoundError('Webhook subscription not found');

    const body = await c.req.json().catch(() => ({}));
    const parseResult = updateWebhookSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues.map((i) => i.message).join(', '));
    }

    const input = parseResult.data;
    if (input.targetUrl) {
      const isDev = (c.env as any)?.NODE_ENV !== 'production';
      const urlValidation = validateWebhookUrl(input.targetUrl, isDev);
      if (!urlValidation.valid) {
        throw new BadRequestError(urlValidation.error || 'Invalid target URL');
      }
    }

    const updated = await prisma.webhookSubscription.update({
      where: { id },
      data: {
        name: input.name ?? sub.name,
        description: input.description ?? sub.description,
        targetUrl: input.targetUrl ?? sub.targetUrl,
        eventTypes: input.eventTypes ?? (sub.eventTypes as any),
        filterRules: input.filterRules !== undefined ? (input.filterRules as any) : sub.filterRules,
        payloadProjection:
          input.payloadProjection !== undefined
            ? (input.payloadProjection as any)
            : sub.payloadProjection,
        rateLimitPerMinute: input.rateLimitPerMinute ?? sub.rateLimitPerMinute,
        status: input.status ?? sub.status,
        configRevision: { increment: 1 },
      },
    });

    return c.json({
      id: updated.id,
      name: updated.name,
      targetUrl: updated.targetUrl,
      eventTypes: updated.eventTypes,
      status: updated.status,
      configRevision: updated.configRevision,
      updatedAt: updated.updatedAt.toISOString(),
    });
  });

  /**
   * DELETE /api/v1/webhooks/:id
   */
  router.delete('/:id', requireScopes(API_SCOPES.WEBHOOKS_MANAGE), async (c) => {
    const { prisma } = getServices(c);
    const principal = c.get('principal');
    const id = c.req.param('id');

    const sub = await prisma.webhookSubscription.findFirst({
      where: { id, organisationId: principal.organisationId, deletedAt: null },
    });
    if (!sub) throw new NotFoundError('Webhook subscription not found');

    await prisma.webhookSubscription.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'disabled',
      },
    });

    return c.body(null, 204);
  });

  /**
   * POST /api/v1/webhooks/:id/rotate-secret
   * INK-159: Secret rotation with grace period
   */
  router.post('/:id/rotate-secret', requireScopes(API_SCOPES.WEBHOOKS_MANAGE), async (c) => {
    const { prisma, signingService } = getServices(c);
    const principal = c.get('principal');
    const id = c.req.param('id');

    const sub = await prisma.webhookSubscription.findFirst({
      where: { id, organisationId: principal.organisationId, deletedAt: null },
      include: {
        signingKeys: {
          where: { retiredAt: null },
        },
      },
    });
    if (!sub) throw new NotFoundError('Webhook subscription not found');

    const now = new Date();
    const graceUntil = new Date(now.getTime() + 24 * 3600 * 1000); // 24 hours grace
    const newSecret = signingService?.generateSecret
      ? signingService.generateSecret()
      : WebhookSigningService.generateSecret();
    const newKeyId = `whsec_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;

    const currentKeys =
      sub.signingKeys && sub.signingKeys.length > 0
        ? sub.signingKeys
        : (await prisma.webhookSigningKey.findMany({
            where: {
              subscriptionId: sub.id,
              retiredAt: null,
            },
          })) || [];

    // Retire current keys
    for (const key of currentKeys) {
      await prisma.webhookSigningKey.update({
        where: { id: key.id },
        data: {
          retiredAt: now,
          graceUntil,
          status: 'RETIRING',
        } as any,
      });
    }

    // Create new key
    await prisma.webhookSigningKey.create({
      data: {
        organisationId: principal.organisationId,
        subscriptionId: sub.id,
        keyId: newKeyId,
        encryptedSecret: newSecret,
        activeFrom: now,
      },
    });

    return c.json({
      keyId: newKeyId,
      secret: newSecret,
      graceUntil: graceUntil.toISOString(),
      gracePeriodEndsAt: graceUntil.toISOString(),
      message:
        'New secret generated. Retaining previous secret for 24-hour verification grace window.',
    });
  });

  /**
   * POST /api/v1/webhooks/:id/test
   * INK-165: Dispatch synthetic test event
   */
  router.post('/:id/test', requireScopes(API_SCOPES.WEBHOOKS_MANAGE), async (c) => {
    const { prisma, deliveryService } = getServices(c);
    const principal = c.get('principal');
    const id = c.req.param('id');

    const sub = await prisma.webhookSubscription.findFirst({
      where: { id, organisationId: principal.organisationId, deletedAt: null },
    });
    if (!sub) throw new NotFoundError('Webhook subscription not found');

    const body = await c.req.json().catch(() => ({}));
    const eventType: WebhookEventType = body.eventType || 'document.completed';

    const def = WEBHOOK_EVENT_REGISTRY[eventType] || WEBHOOK_EVENT_REGISTRY['document.completed'];
    const testEventId = crypto.randomUUID();

    const envelope = {
      id: testEventId,
      event: eventType,
      schemaVersion: '1.0',
      timestamp: new Date().toISOString(),
      organisationId: principal.organisationId,
      sequence: 1,
      test: true,
      data: {
        ...def.sampleData,
        ...(body.dataOverrides || {}),
      },
    };

    const payloadBytes = JSON.stringify(envelope);

    // Create delivery directly
    const delivery = await prisma.webhookDelivery.create({
      data: {
        organisationId: principal.organisationId,
        eventId: testEventId,
        subscriptionId: sub.id,
        replayGeneration: 1,
        payloadBytes,
        payloadHash: 'test_hash',
        state: 'PENDING',
        attemptCount: 0,
      },
    });

    // Run test delivery synchronously for user feedback
    const result = (deliveryService as any).deliverSingle
      ? await (deliveryService as any).deliverSingle(sub, envelope)
      : await deliveryService.executeDelivery(delivery.id);

    return c.json(
      {
        success: result?.success ?? true,
        statusCode: result?.statusCode ?? 200,
        durationMs: result?.durationMs ?? 0,
        responseSnippet: result?.responseSnippet ?? '',
        test: true,
        deliveryId: delivery.id,
        eventId: testEventId,
        result,
      },
      200,
    );
  });

  /**
   * GET /api/v1/webhooks/:id/metrics
   * INK-163: Metrics aggregation and CSV export
   */
  router.get('/:id/metrics', requireScopes(API_SCOPES.WEBHOOKS_READ), async (c) => {
    const { prisma } = getServices(c);
    const principal = c.get('principal');
    const id = c.req.param('id');
    const format = c.req.query('format');
    const period = c.req.query('period') || '24h';

    const metrics = await prisma.webhookMetricBucket.findMany({
      where: {
        organisationId: principal.organisationId,
        subscriptionId: id,
      },
      orderBy: { timeBucket: 'desc' },
      take: 100,
    });

    if (format === 'csv') {
      const header = 'timestamp,dispatched,succeeded,failed,dead_letter,avg_latency_ms';
      const rows = metrics.map((m) => {
        const ts =
          ((m as any).bucketTime || (m as any).timeBucket)?.toISOString?.() ||
          new Date().toISOString();
        const d = (m as any).dispatchedCount ?? (m as any).deliveriesCount ?? 0;
        const s = m.successCount ?? 0;
        const f = m.failureCount ?? 0;
        const dl = (m as any).deadLetterCount ?? 0;
        const totDur = (m as any).totalDurationMs ?? 0;
        const lat = d > 0 ? Math.round(totDur / d) : 0;
        return `${ts},${d},${s},${f},${dl},${lat}`;
      });
      return c.text([header, ...rows].join('\n'), 200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="webhook-metrics-${id}.csv"`,
      });
    }

    const dispatched = metrics.reduce(
      (acc, m) => acc + ((m as any).dispatchedCount ?? (m as any).deliveriesCount ?? 0),
      0,
    );
    const succeeded = metrics.reduce((acc, m) => acc + (m.successCount ?? 0), 0);
    const failed = metrics.reduce((acc, m) => acc + (m.failureCount ?? 0), 0);
    const deadLetter = metrics.reduce((acc, m) => acc + ((m as any).deadLetterCount ?? 0), 0);
    const totalDuration = metrics.reduce((acc, m) => acc + ((m as any).totalDurationMs ?? 0), 0);
    const avgLatencyMs = dispatched > 0 ? Math.round(totalDuration / dispatched) : 0;
    const successRatePercent = dispatched > 0 ? (succeeded / dispatched) * 100 : 0;

    return c.json({
      period,
      totals: {
        dispatched,
        succeeded,
        failed,
        deadLetter,
      },
      performance: {
        successRatePercent,
        avgLatencyMs,
      },
      summary: {
        totalDeliveries: dispatched,
        totalSuccess: succeeded,
        totalFailure: failed,
        successRate: dispatched > 0 ? `${successRatePercent.toFixed(1)}%` : 'No deliveries',
      },
      buckets: metrics,
    });
  });

  /**
   * GET /api/v1/webhooks/:id/dead-letters
   * INK-161: List dead letter deliveries
   */
  router.get('/:id/dead-letters', requireScopes(API_SCOPES.WEBHOOKS_READ), async (c) => {
    const { prisma } = getServices(c);
    const principal = c.get('principal');
    const id = c.req.param('id');

    const deadLetters = await prisma.webhookDeadLetter.findMany({
      where: {
        organisationId: principal.organisationId,
        subscriptionId: id,
      },
      include: {
        delivery: {
          select: {
            id: true,
            eventId: true,
            attemptCount: true,
            lastStatusCode: true,
            lastErrorMessage: true,
            createdAt: true,
          },
        },
      },
      orderBy: { finalAttemptAt: 'desc' },
    });

    return c.json({ data: deadLetters });
  });

  /**
   * POST /api/v1/webhooks/deliveries/:id/replay
   * INK-161: Replay dead lettered delivery
   */
  router.post('/deliveries/:id/replay', requireScopes(API_SCOPES.WEBHOOKS_REPLAY), async (c) => {
    const { prisma, deliveryService } = getServices(c);
    const principal = c.get('principal');
    const deliveryId = c.req.param('id');

    const original = await prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, organisationId: principal.organisationId },
    });

    if (!original) throw new NotFoundError('Delivery not found');

    // Create a new replay generation
    const replayed = await prisma.webhookDelivery.create({
      data: {
        organisationId: principal.organisationId,
        eventId: original.eventId,
        subscriptionId: original.subscriptionId,
        replayGeneration: original.replayGeneration + 1,
        payloadBytes: original.payloadBytes,
        payloadHash: original.payloadHash,
        configRevision: original.configRevision,
        state: 'PENDING',
        attemptCount: 0,
        nextAttemptAt: new Date(),
      },
    });

    // Mark original dead letter replayed
    await prisma.webhookDeadLetter
      .update({
        where: { deliveryId: original.id },
        data: { replayedAt: new Date() },
      })
      .catch(() => {});

    // Trigger delivery execution
    const execution = await deliveryService.executeDelivery(replayed.id);

    return c.json({
      replayedDeliveryId: replayed.id,
      status: replayed.state,
      execution,
    });
  });

  return router;
}
