import type { MiddlewareHandler } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { getLegacyPrisma } from '@graphsign/db';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'proxy-authorization',
]);

/**
 * Redacts token path parameters and query strings to prevent credential leaks.
 */
function sanitizePath(path: string): string {
  return path
    .replace(/\/sign\/[a-zA-Z0-9_-]{20,}/g, '/sign/:token')
    .replace(/\/verify\/[a-zA-Z0-9_-]{20,}/g, '/verify/:token');
}

/**
 * Sanitizes headers by stripping sensitive headers.
 */
function sanitizeHeaders(headers: Headers): Record<string, string> {
  const safe: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_HEADERS.has(lowerKey)) {
      safe[key] = '[REDACTED]';
    } else {
      safe[key] = value.length > 256 ? `${value.substring(0, 256)}...` : value;
    }
  });
  return safe;
}

/**
 * Searchable, Redacted API Request Logging Middleware (INK-152, FR-016.010).
 */
export function requestLogger(options?: { prisma?: PrismaClient }): MiddlewareHandler {
  return async (c, next) => {
    // Skip static assets or internal health checks from spamming DB logs
    if (c.req.path === '/health') {
      return await next();
    }

    const startTime = Date.now();
    const requestId = c.get('requestId') || c.req.header('x-request-id') || crypto.randomUUID();
    const method = c.req.method;
    const sanitizedUrl = sanitizePath(c.req.path);
    const ip =
      c.req.header('cf-connecting-ip')?.trim() ||
      c.req.header('x-real-ip')?.trim() ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown';
    const userAgent = c.req.header('user-agent')?.substring(0, 512);

    let errorMessage: string | undefined;

    try {
      await next();
    } catch (err: any) {
      errorMessage = err?.message?.substring(0, 1000);
      throw err;
    } finally {
      const durationMs = Date.now() - startTime;
      const statusCode = c.res?.status ?? 500;
      const principal = c.get('principal');
      const orgId = principal?.organisationId || c.get('orgId');
      const principalId = principal?.id || c.get('userId');

      let prisma: PrismaClient | undefined = options?.prisma || (c as any).prisma;
      if (!prisma) {
        const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL;
        if (dbUrl && typeof dbUrl === 'string' && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
          try {
            prisma = getLegacyPrisma();
          } catch {
            // Ignore legacy prisma resolution error
          }
        }
      }

      if (prisma?.apiRequestLog?.create) {
        const safeHeaders = sanitizeHeaders(c.req.raw.headers);
        const expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000); // 90 days retention

        prisma.apiRequestLog
          .create({
            data: {
              organisationId: orgId,
              principalId,
              requestId,
              routeTemplate: sanitizedUrl,
              method,
              statusCode,
              durationMs,
              requestSummary: {
                headers: safeHeaders,
                query: Object.fromEntries(
                  Object.entries(c.req.queries() || {}).map(([k, v]) => [
                    k,
                    k.toLowerCase().includes('token') ? '[REDACTED]' : v,
                  ]),
                ),
              },
              ipAddress: ip,
              userAgent,
              errorMessage,
              expiresAt,
            },
          })
          .catch(() => {
            // Fail silently on logging error to avoid breaking request cycle
          });
      }
    }
  };
}
