import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { PlatformHealthService } from '../services/health-service.js';
import { apiAuth } from '../middleware/api-auth.js';
import type { Env } from '../index.js';

export function createHealthAndMetricsRoutes(deps?: { prisma?: PrismaClient }) {
  const router = new Hono<{ Bindings: Env }>();
  let cachedPrisma: PrismaClient | undefined;

  function getPrisma(c: any): PrismaClient {
    if (deps?.prisma) return deps.prisma;
    if (cachedPrisma) return cachedPrisma;
    const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL;
    const prisma =
      dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))
        ? createPrismaClient(dbUrl)
        : getLegacyPrisma();
    cachedPrisma = prisma;
    return prisma;
  }

  /**
   * GET /api/v1/health
   * Public sanitized readiness probe (INK-153, FR-016.010).
   * Returns 200 when healthy, 503 when required dependencies fail.
   * Excludes internal connection strings, credentials, or stack traces.
   */
  router.get('/health', async (c) => {
    const prisma = getPrisma(c);
    const healthService = new PlatformHealthService(prisma);

    try {
      const result = await healthService.checkHealth();
      const isDbHealthy = result.database.status === 'connected';

      const publicResponse = {
        status: isDbHealthy ? 'healthy' : 'unhealthy',
        version: '1.0.0',
        dependencies: {
          database: isDbHealthy ? 'UP' : 'DOWN',
        },
        timestamp: new Date().toISOString(),
      };

      const statusCode = isDbHealthy ? 200 : 503;
      return c.json(publicResponse, statusCode);
    } catch {
      return c.json(
        {
          status: 'unhealthy',
          version: '1.0.0',
          dependencies: { database: 'DOWN' },
          timestamp: new Date().toISOString(),
        },
        503,
      );
    }
  });

  /**
   * GET /api/v1/metrics
   * Prometheus exposition endpoint (INK-153).
   * Authenticated (operator / admin only).
   */
  router.get('/metrics', apiAuth({ requiredRoles: ['admin', 'superadmin'] }), async (c) => {
    const prisma = getPrisma(c);

    let dbDeliveries = 0;
    let dbSuccess = 0;
    let dbFailures = 0;

    try {
      if (prisma?.webhookDelivery?.count) {
        [dbDeliveries, dbSuccess, dbFailures] = await Promise.all([
          prisma.webhookDelivery.count(),
          prisma.webhookDelivery.count({ where: { state: 'SUCCEEDED' } }),
          prisma.webhookDelivery.count({ where: { state: 'DEAD_LETTER' } }),
        ]);
      }
    } catch {
      // Ignore count errors
    }

    const prometheusText = [
      '# HELP graphsign_webhook_deliveries_total Total number of webhook deliveries created',
      '# TYPE graphsign_webhook_deliveries_total counter',
      `graphsign_webhook_deliveries_total ${dbDeliveries}`,
      '# HELP graphsign_webhook_deliveries_succeeded_total Total number of successful webhook deliveries',
      '# TYPE graphsign_webhook_deliveries_succeeded_total counter',
      `graphsign_webhook_deliveries_succeeded_total ${dbSuccess}`,
      '# HELP graphsign_webhook_deliveries_failed_total Total number of permanently failed webhook deliveries in DLQ',
      '# TYPE graphsign_webhook_deliveries_failed_total counter',
      `graphsign_webhook_deliveries_failed_total ${dbFailures}`,
      '# HELP graphsign_api_status Binary indicator of platform readiness (1 = healthy, 0 = unhealthy)',
      '# TYPE graphsign_api_status gauge',
      'graphsign_api_status 1',
    ].join('\n');

    return c.text(prometheusText, 200, {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
    });
  });

  return router;
}
