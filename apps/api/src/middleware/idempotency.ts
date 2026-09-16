import type { MiddlewareHandler } from 'hono';
import { ConflictError, BadRequestError } from '../utils/errors.js';
import { sha256 } from '../utils/crypto.js';
import type { PrismaClient } from '@graphsign/db';
import { getLegacyPrisma } from '@graphsign/db';

export interface IdempotencyOptions {
  operation: string;
  prisma?: PrismaClient;
  leaseSeconds?: number;
  retentionHours?: number;
}

/**
 * Idempotent Mutation Middleware (INK-154).
 * Ensures safe retries for mutating operations (e.g. POST /documents, POST /documents/:id/sign).
 */
export function idempotency(options: IdempotencyOptions): MiddlewareHandler {
  const leaseSeconds = options.leaseSeconds ?? 60;
  const retentionHours = options.retentionHours ?? 24;

  return async (c, next) => {
    const rawKey = c.req.header('idempotency-key') || c.req.header('x-idempotency-key');

    // If no key is provided, generate a traceable one for the response header but continue normally
    if (!rawKey) {
      const generatedKey = crypto.randomUUID();
      c.header('Idempotency-Key', generatedKey);
      return await next();
    }

    const key = rawKey.trim();
    if (key.length < 1 || key.length > 128) {
      throw new BadRequestError('Idempotency-Key header must be between 1 and 128 characters.');
    }

    const prisma: PrismaClient = options.prisma || (c as any).prisma || getLegacyPrisma();
    if (!prisma?.idempotencyRecord) {
      return await next();
    }

    const principal = c.get('principal');
    const orgId = principal?.organisationId || c.get('orgId') || 'default-org';
    const principalId = principal?.id || c.get('userId') || 'anonymous';
    const operation = options.operation;

    // Read and buffer request body for hashing
    let rawBody = '';
    try {
      rawBody = await c.req.text();
    } catch {
      rawBody = '';
    }

    // Reset request body so downstream handlers can parse it
    c.req.raw = new Request(c.req.raw.url, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: rawBody,
    });

    const keyHash = await sha256(key);
    const requestHash = await sha256(
      JSON.stringify({
        method: c.req.method,
        path: c.req.path,
        operation,
        principalId,
        body: rawBody,
      }),
    );

    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000);
    const expiresAt = new Date(now.getTime() + retentionHours * 3600 * 1000);

    // Look for existing idempotency record
    const existing = await prisma.idempotencyRecord.findUnique({
      where: {
        organisationId_principalId_operation_keyHash: {
          organisationId: orgId,
          principalId,
          operation,
          keyHash,
        },
      },
    });

    if (existing) {
      const state = existing.state || (existing as any).status;
      const status = existing.responseStatus || (existing as any).statusCode || 200;

      if (state === 'COMPLETED') {
        if (existing.requestHash && existing.requestHash !== requestHash) {
          throw new ConflictError(
            'Idempotency key was previously used with a different request payload.',
          );
        }
        // Return cached response
        c.header('Idempotency-Key', key);
        c.header('Idempotency-Replayed', 'true');
        c.header('X-Idempotent-Replay', 'true');
        const replayStatus = status === 201 ? 200 : status;
        return c.json(existing.responseBody, replayStatus as any);
      }

      if (state === 'IN_PROGRESS' && existing.leaseUntil && existing.leaseUntil > now) {
        throw new ConflictError(
          'A request with this idempotency key is currently in progress. Please retry shortly.',
        );
      }

      // Reclaim expired lease
      await prisma.idempotencyRecord.update({
        where: { id: existing.id },
        data: {
          state: 'IN_PROGRESS',
          requestHash,
          leaseUntil,
        },
      });
    } else {
      // Reserve lease
      try {
        await prisma.idempotencyRecord.create({
          data: {
            organisationId: orgId,
            principalId,
            operation,
            keyHash,
            requestHash,
            state: 'IN_PROGRESS',
            leaseUntil,
            expiresAt,
          },
        });
      } catch (err: any) {
        // Unique constraint race condition
        throw new ConflictError(
          'A concurrent request with this idempotency key is being processed.',
        );
      }
    }

    try {
      await next();

      // Intercept and store response if 2xx
      if (c.res && c.res.status >= 200 && c.res.status < 300) {
        const status = c.res.status === 201 ? 200 : c.res.status; // Replays return 200 per INK-154
        let responseJson: any = null;
        try {
          const clone = c.res.clone();
          responseJson = await clone.json();
        } catch {
          responseJson = null;
        }

        await prisma.idempotencyRecord.update({
          where: {
            organisationId_principalId_operation_keyHash: {
              organisationId: orgId,
              principalId,
              operation,
              keyHash,
            },
          },
          data: {
            state: 'COMPLETED',
            responseStatus: status,
            responseBody: responseJson ?? {},
          },
        });
      }
    } catch (err) {
      // Mark as FAILED so client can retry with same key
      await prisma.idempotencyRecord
        .delete({
          where: {
            organisationId_principalId_operation_keyHash: {
              organisationId: orgId,
              principalId,
              operation,
              keyHash,
            },
          },
        })
        .catch(() => {});
      throw err;
    }
  };
}
