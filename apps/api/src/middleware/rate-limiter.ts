import type { MiddlewareHandler } from 'hono';
import { RateLimitError } from '../utils/errors.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limiter for auth endpoints.
 * Enforces 10 req/min per IP per security.md.
 *
 * For production at scale, this should be replaced with
 * a distributed rate limiter (e.g., Cloudflare Workers rate limiting
 * or Redis-backed).
 */
export function createRateLimiter(
  maxRequests: number = 10,
  windowMs: number = 60_000,
): MiddlewareHandler {
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup to prevent memory leaks
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, windowMs);

  return async (c, next) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const now = Date.now();

    let entry = store.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(ip, entry);
    }

    entry.count++;

    // Set rate limit response headers per api.md
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    c.header('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());

    if (entry.count > maxRequests) {
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      throw new RateLimitError();
    }

    await next();
  };
}
