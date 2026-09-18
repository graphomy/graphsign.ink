import { Hono } from 'hono';
import { z } from 'zod';
import type { PrismaClient } from '@graphsign/db';
import { getDbClient } from '../utils/db.js';
import { apiAuth, requireScopes } from '../middleware/api-auth.js';
import { API_SCOPES } from '../types/principal.js';
import { BadRequestError } from '../utils/errors.js';
import type { Env } from '../index.js';

const logQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  route: z.string().optional(),
  method: z.string().optional(),
  statusCode: z.coerce.number().int().optional(),
  requestId: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export function createApiLogRoutes(deps?: { prisma?: PrismaClient }) {
  const router = new Hono<{ Bindings: Env }>();

  function getPrisma(c: any): PrismaClient {
    return getDbClient(c, deps?.prisma);
  }

  router.use('/*', async (c, next) => {
    (c as any).prisma = getPrisma(c);
    await next();
  });
  router.use('/*', apiAuth({ prisma: deps?.prisma }));

  /**
   * GET /api/v1/organisations/me/api-logs
   * INK-152, FR-016.010: Searchable redacted API request logs
   */
  router.get('/', requireScopes(API_SCOPES.API_LOGS_READ), async (c) => {
    const prisma = getPrisma(c);
    const principal = c.get('principal');

    const query = c.req.query();
    const parseResult = logQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues.map((i) => i.message).join(', '));
    }

    const { page, limit, route, method, statusCode, requestId, from, to } = parseResult.data;

    const where: any = {
      organisationId: principal.organisationId,
    };

    if (route) where.routeTemplate = { contains: route, mode: 'insensitive' };
    if (method) where.method = method.toUpperCase();
    if (statusCode) where.statusCode = statusCode;
    if (requestId) where.requestId = requestId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      prisma.apiRequestLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.apiRequestLog.count({ where }),
    ]);

    return c.json({
      data: logs.map((log) => ({
        id: log.id,
        requestId: log.requestId,
        route: log.routeTemplate,
        method: log.method,
        statusCode: log.statusCode,
        durationMs: log.durationMs,
        requestSummary: log.requestSummary,
        responseSummary: log.responseSummary,
        ipAddress: log.ipAddress,
        errorMessage: log.errorMessage,
        createdAt: log.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  return router;
}
