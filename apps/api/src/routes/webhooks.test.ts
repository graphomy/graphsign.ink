import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createWebhookRoutes } from './webhooks.js';
import { signJwt } from '../utils/jwt.js';
import { errorHandler } from '../middleware/error-handler.js';

describe('Webhook Routes Integration Tests (INK-156 to INK-165, FR-017)', () => {
  let mockPrisma: any;
  let mockSigningService: any;
  let mockDeliveryService: any;
  let app: Hono;
  let token: string;

  beforeEach(async () => {
    mockPrisma = {
      webhookSubscription: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        update: vi.fn(),
      },
      webhookSigningKey: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      webhookDelivery: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
      },
      webhookMetricBucket: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      organisation: {
        findUnique: vi.fn().mockResolvedValue({ id: 'org-123', status: 'active' }),
      },
    };

    mockSigningService = {
      generateSecret: vi
        .fn()
        .mockReturnValue('test-generated-secret-64chars00000000000000000000000000000000000000'),
    };

    mockDeliveryService = {
      deliverSingle: vi.fn().mockResolvedValue({
        success: true,
        statusCode: 200,
        durationMs: 45,
        responseSnippet: '{"received": true}',
      }),
    };

    token = await signJwt({
      sub: 'user-123',
      email: 'admin@example.com',
      orgId: 'org-123',
      role: 'admin',
    });

    app = new Hono();
    app.onError(errorHandler);

    const webhookRoutes = createWebhookRoutes({
      prisma: mockPrisma,
      signingService: mockSigningService as any,
      deliveryService: mockDeliveryService as any,
    });

    app.route('/api/v1/webhooks', webhookRoutes);
  });

  describe('POST /api/v1/webhooks (INK-156, INK-157, INK-159)', () => {
    it('creates webhook subscription with one-time signing secret', async () => {
      const now = new Date();
      mockPrisma.webhookSubscription.create.mockResolvedValue({
        id: 'sub-uuid-1',
        organisationId: 'org-123',
        name: 'ERP Inbound Webhook',
        targetUrl: 'https://erp.example.com/api/webhooks',
        status: 'active',
        eventTypes: ['document.completed'],
        rateLimitPerMinute: 10,
        createdAt: now,
        updatedAt: now,
      });

      const res = await app.request('/api/v1/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'ERP Inbound Webhook',
          targetUrl: 'https://erp.example.com/api/webhooks',
          eventTypes: ['document.completed'],
          rateLimitPerMinute: 10,
        }),
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.subscription.id).toBe('sub-uuid-1');
      expect(body.secret).toBe(
        'test-generated-secret-64chars00000000000000000000000000000000000000',
      );
      expect(mockPrisma.webhookSigningKey.create).toHaveBeenCalled();
    });

    it('rejects SSRF private IP target URL with 400 Bad Request', async () => {
      const res = await app.request('/api/v1/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Malicious Webhook',
          targetUrl: 'http://169.254.169.254/latest/meta-data',
          eventTypes: ['document.completed'],
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error.message).toContain('SSRF');
    });
  });

  describe('GET /api/v1/webhooks (INK-156)', () => {
    it('returns subscriptions list without exposing signing secret bytes', async () => {
      mockPrisma.webhookSubscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          name: 'Slack Alerts',
          targetUrl: 'https://hooks.slack.com/services/xxx',
          status: 'active',
          eventTypes: ['document.signed', 'document.completed'],
          rateLimitPerMinute: 20,
          signingKeys: [{ id: 'key-1', keyHint: 'whsec_a1b2', status: 'ACTIVE' }],
        },
      ]);

      const res = await app.request('/api/v1/webhooks', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.subscriptions).toHaveLength(1);
      expect(body.subscriptions[0].targetUrl).toBe('https://hooks.slack.com/services/xxx');
      // Secret must never be in list response
      expect(body.subscriptions[0].secret).toBeUndefined();
    });
  });

  describe('POST /api/v1/webhooks/:id/rotate-secret (INK-159)', () => {
    it('rotates secret and activates 24-hour dual-verification grace period', async () => {
      mockPrisma.webhookSubscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        organisationId: 'org-123',
        name: 'Slack Alerts',
      });
      mockPrisma.webhookSigningKey.findMany.mockResolvedValue([
        { id: 'old-key-1', status: 'ACTIVE' },
      ]);

      const res = await app.request('/api/v1/webhooks/sub-1/rotate-secret', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.secret).toBeDefined();
      expect(body.gracePeriodEndsAt).toBeDefined();
      // Old key must transition to RETIRING
      expect(mockPrisma.webhookSigningKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'old-key-1' },
          data: expect.objectContaining({ status: 'RETIRING' }),
        }),
      );
    });
  });

  describe('POST /api/v1/webhooks/:id/test (INK-164)', () => {
    it('dispatches synthetic test event and returns transport metrics', async () => {
      mockPrisma.webhookSubscription.findFirst.mockResolvedValue({
        id: 'sub-test-1',
        organisationId: 'org-123',
        name: 'Test Webhook',
        targetUrl: 'https://webhook.site/test',
        rateLimitPerMinute: 10,
        signingKeys: [{ id: 'k-1', secretHash: 'secret123', status: 'ACTIVE' }],
      });
      mockPrisma.webhookDelivery.create.mockResolvedValue({
        id: 'del-test-uuid',
      });

      const res = await app.request('/api/v1/webhooks/sub-test-1/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          eventType: 'document.completed',
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.statusCode).toBe(200);
      expect(body.durationMs).toBe(45);
      expect(body.responseSnippet).toBe('{"received": true}');
    });
  });

  describe('GET /api/v1/webhooks/:id/metrics (INK-165)', () => {
    it('returns telemetry metrics summary for subscription', async () => {
      mockPrisma.webhookSubscription.findFirst.mockResolvedValue({
        id: 'sub-metrics-1',
        organisationId: 'org-123',
      });
      mockPrisma.webhookMetricBucket.findMany.mockResolvedValue([
        {
          dispatchedCount: 100,
          successCount: 98,
          failureCount: 2,
          deadLetterCount: 0,
          totalDurationMs: 4500,
        },
      ]);

      const res = await app.request('/api/v1/webhooks/sub-metrics-1/metrics?period=24h', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.period).toBe('24h');
      expect(body.totals.dispatched).toBe(100);
      expect(body.totals.succeeded).toBe(98);
      expect(body.performance.successRatePercent).toBe(98);
    });

    it('exports metrics as CSV formatted stream', async () => {
      mockPrisma.webhookSubscription.findFirst.mockResolvedValue({
        id: 'sub-metrics-1',
        organisationId: 'org-123',
      });
      mockPrisma.webhookMetricBucket.findMany.mockResolvedValue([
        {
          bucketTime: new Date('2026-09-16T12:00:00Z'),
          dispatchedCount: 50,
          successCount: 49,
          failureCount: 1,
          deadLetterCount: 0,
          totalDurationMs: 2500,
        },
      ]);

      const res = await app.request(
        '/api/v1/webhooks/sub-metrics-1/metrics?period=24h&format=csv',
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/csv');
      const csvText = await res.text();
      expect(csvText).toContain('timestamp,dispatched,succeeded,failed,dead_letter,avg_latency_ms');
      expect(csvText).toContain('50,49,1,0,50');
    });
  });
});
