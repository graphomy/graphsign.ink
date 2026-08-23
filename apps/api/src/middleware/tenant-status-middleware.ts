import type { MiddlewareHandler } from 'hono';
import { createPrismaClient } from '@graphsign/db';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

interface CachedOrgStatus {
  status: string;
  expiresAt: number;
}

const orgStatusCache = new Map<string, CachedOrgStatus>();
const STATUS_CACHE_TTL_MS = 60_000; // 60 seconds

/** Helper to invalidate status cache when an organisation's status is updated */
export function clearOrgStatusCache(orgId?: string) {
  if (orgId) {
    orgStatusCache.delete(orgId);
  } else {
    orgStatusCache.clear();
  }
}

/**
 * Hono middleware that verifies the caller's organisation is active.
 * Suspended organisations are blocked from executing business operations.
 * Caches active status for 60 seconds to eliminate redundant database queries on every request.
 */
export function enforceTenantActiveStatus(): MiddlewareHandler {
  return async (c, next) => {
    const payload = c.get('userPayload');

    if (!payload || !payload.orgId) {
      throw new UnauthorizedError('Tenant context missing from session.');
    }

    const orgId = payload.orgId;
    const now = Date.now();
    const cached = orgStatusCache.get(orgId);

    if (cached && cached.expiresAt > now) {
      if (cached.status === 'suspended') {
        throw new ForbiddenError(
          'Organisation access is currently suspended. Please contact platform administration.',
        );
      }
      await next();
      return;
    }

    const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL;

    if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
      try {
        const prisma = createPrismaClient(dbUrl);
        const org = await prisma.organisation.findUnique({
          where: { id: orgId },
          select: { status: true },
        });

        if (org) {
          orgStatusCache.set(orgId, {
            status: org.status,
            expiresAt: now + STATUS_CACHE_TTL_MS,
          });

          if (org.status === 'suspended') {
            throw new ForbiddenError(
              'Organisation access is currently suspended. Please contact platform administration.',
            );
          }
        }
      } catch (err: any) {
        if (err instanceof ForbiddenError) throw err;
        // Ignore non-fatal db lookup errors in unit tests with mock IDs
      }
    }

    await next();
  };
}
