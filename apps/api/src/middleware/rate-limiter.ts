import type { MiddlewareHandler } from 'hono';
import { RateLimitError } from '../utils/errors.js';
import type { PrismaClient } from '@graphsign/db';
import { getLegacyPrisma } from '@graphsign/db';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export interface RateLimitStore {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

/** In-memory fallback token-bucket rate limit store. */
export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetAt: number }>();

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    // Clean up expired items periodically
    if (this.store.size > 1000) {
      for (const [k, entry] of this.store.entries()) {
        if (entry.resetAt <= now) this.store.delete(k);
      }
    }

    let entry = this.store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      this.store.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, limit - entry.count);
    const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    const allowed = entry.count <= limit;

    return { allowed, limit, remaining, resetSeconds };
  }
}

/** Durable database-backed rate limit store using rate_limit_states table (INK-149). */
export class PrismaRateLimitStore implements RateLimitStore {
  constructor(private readonly prisma: PrismaClient) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + windowSeconds * 1000);

    try {
      if (!this.prisma?.rateLimitState) {
        return { allowed: true, limit, remaining: limit, resetSeconds: windowSeconds };
      }

      const existing = await this.prisma.rateLimitState.findUnique({
        where: { key },
      });
      // Clamp persisted windows from the milliseconds/seconds regression on the next request.
      const effectiveExpiry = existing
        ? new Date(
            Math.min(
              existing.expiresAt.getTime(),
              existing.lastRefillAt.getTime() + windowSeconds * 1000,
            ),
          )
        : now;

      if (!existing || effectiveExpiry <= now) {
        await this.prisma.rateLimitState.upsert({
          where: { key },
          create: {
            key,
            tokens: 1,
            lastRefillAt: now,
            expiresAt,
          },
          update: {
            tokens: 1,
            lastRefillAt: now,
            expiresAt,
          },
        });
        return {
          allowed: true,
          limit,
          remaining: limit - 1,
          resetSeconds: windowSeconds,
        };
      }

      const newTokens = existing.tokens + 1;
      const allowed = newTokens <= limit;
      const remaining = Math.max(0, limit - Math.floor(newTokens));
      const resetSeconds = Math.max(
        1,
        Math.ceil((effectiveExpiry.getTime() - now.getTime()) / 1000),
      );

      await this.prisma.rateLimitState.update({
        where: { key },
        data: {
          tokens: newTokens,
          expiresAt: effectiveExpiry,
        },
      });

      return { allowed, limit, remaining, resetSeconds };
    } catch {
      // Fall back gracefully if database rate limit table is momentarily unreachable
      return { allowed: true, limit, remaining: limit, resetSeconds: windowSeconds };
    }
  }
}

const defaultMemoryStore = new MemoryRateLimitStore();
const prismaStoreCache = new WeakMap<PrismaClient, PrismaRateLimitStore>();

/**
 * Creates durable rate limiting middleware (INK-149).
 * The public window argument is milliseconds, preserving the existing route contract.
 * Stores and response headers use seconds.
 */
export function createRateLimiter(
  maxRequests: number = 100,
  windowMs: number = 60_000,
  options?: {
    routeTemplate?: string;
    store?: RateLimitStore;
    prisma?: PrismaClient;
  },
): MiddlewareHandler {
  const windowSeconds = windowMs / 1000;
  return async (c, next) => {
    // Resolve client IP securely
    const ip =
      c.req.header('cf-connecting-ip')?.trim() ||
      c.req.header('x-real-ip')?.trim() ||
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown';

    const principal = c.get('principal');
    const identifier = principal ? `principal:${principal.id}` : `ip:${ip}`;
    const route = options?.routeTemplate || c.req.path;
    const storeKey = `ratelimit:${route}:${identifier}`;

    let prisma: PrismaClient | undefined = options?.prisma || (c as any).prisma;
    if (!prisma) {
      const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL;
      if (
        dbUrl &&
        typeof dbUrl === 'string' &&
        (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))
      ) {
        try {
          prisma = getLegacyPrisma();
        } catch {
          // Ignore legacy prisma resolution error
        }
      }
    }

    // Check if whitelisted in policies
    if (prisma?.apiRateLimitPolicy?.findFirst) {
      try {
        const whitelistPolicy = await prisma.apiRateLimitPolicy.findFirst({
          where: {
            isWhitelist: true,
            OR: [...(principal ? [{ principalId: principal.id }] : []), { ipAddress: ip }],
          },
        });
        if (whitelistPolicy) {
          return await next();
        }
      } catch {
        // Continue if check fails
      }
    }

    let store: RateLimitStore = options?.store || defaultMemoryStore;
    if (!options?.store && prisma && (prisma as any).rateLimitState) {
      let cached = prismaStoreCache.get(prisma);
      if (!cached) {
        cached = new PrismaRateLimitStore(prisma);
        prismaStoreCache.set(prisma, cached);
      }
      store = cached;
    }
    const result = await store.consume(storeKey, maxRequests, windowSeconds);

    c.header('X-RateLimit-Limit', String(result.limit));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    c.header('X-RateLimit-Reset', String(result.resetSeconds));

    if (!result.allowed) {
      c.header('Retry-After', String(result.resetSeconds));
      throw new RateLimitError();
    }

    await next();
  };
}
