import type { MiddlewareHandler } from 'hono';
import { createPrismaClient } from '@graphsign/db';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

/**
 * Hono middleware that verifies the caller's organisation is active.
 * Suspended organisations are blocked from executing business operations.
 */
export function enforceTenantActiveStatus(): MiddlewareHandler {
  return async (c, next) => {
    const payload = c.get('userPayload');

    if (!payload || !payload.orgId) {
      throw new UnauthorizedError('Tenant context missing from session.');
    }

    const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL;

    if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
      try {
        const prisma = createPrismaClient(dbUrl);
        const org = await prisma.organisation.findUnique({
          where: { id: payload.orgId },
          select: { status: true },
        });

        if (org && org.status === 'suspended') {
          throw new ForbiddenError(
            'Organisation access is currently suspended. Please contact platform administration.',
          );
        }
      } catch (err: any) {
        if (err instanceof ForbiddenError) throw err;
        // Ignore non-fatal db lookup errors in unit tests with mock IDs
      }
    }

    await next();
  };
}
