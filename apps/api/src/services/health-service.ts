import type { PrismaClient } from '@graphsign/db';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: {
    status: 'connected' | 'disconnected';
    latencyMs: number;
    error?: string;
  };
  uptimeSeconds: number;
  memory: {
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
  };
  timestamp: string;
}

export class PlatformHealthService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Performs an operational health check on database responsiveness and platform runtime.
   */
  async checkHealth(): Promise<HealthCheckResult> {
    const start = Date.now();
    let dbStatus: 'connected' | 'disconnected' = 'connected';
    let dbError: string | undefined;
    let latencyMs = 0;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      latencyMs = Date.now() - start;
    } catch (err: any) {
      dbStatus = 'disconnected';
      dbError = err?.message || 'Database ping failed';
      latencyMs = Date.now() - start;
    }

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (dbStatus === 'disconnected') {
      overallStatus = 'unhealthy';
    } else if (latencyMs > 300) {
      overallStatus = 'degraded';
    }

    const mem =
      typeof process !== 'undefined' && process.memoryUsage
        ? process.memoryUsage()
        : { rss: 0, heapUsed: 0, heapTotal: 0 };

    const uptime = typeof process !== 'undefined' && process.uptime ? process.uptime() : 0;

    return {
      status: overallStatus,
      database: {
        status: dbStatus,
        latencyMs,
        error: dbError,
      },
      uptimeSeconds: Math.floor(uptime),
      memory: {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
