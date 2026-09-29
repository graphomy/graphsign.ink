import { Hono } from 'hono';
import { z } from 'zod';
import type { PrismaClient } from '@graphsign/db';
import { getDbClient } from '../utils/db.js';
import { apiAuth, requireScopes } from '../middleware/api-auth.js';
import { API_SCOPES } from '../types/principal.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import type { Env } from '../index.js';

const createClientBindingSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  clientId: z.string().min(1).max(255),
  issuer: z.string().min(1).max(255).default('graphsign-local'),
  scopes: z.array(z.string()).min(1),
  actingUserId: z.string().uuid().optional(),
});

const updateClientBindingSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).optional(),
  scopes: z.array(z.string()).optional(),
  status: z.enum(['active', 'disabled', 'revoked']).optional(),
});

export function createApiClientRoutes(deps?: { prisma?: PrismaClient }) {
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
   * GET /api/v1/organisations/me/api-clients
   * INK-148, FR-016.006: List trusted machine client bindings
   */
  router.get('/', requireScopes(API_SCOPES.API_CLIENTS_MANAGE), async (c) => {
    const prisma = getPrisma(c);
    const principal = c.get('principal');

    const clients = await prisma.apiClientBinding.findMany({
      where: {
        organisationId: principal.organisationId,
        deletedAt: null,
      },
      include: {
        actingUser: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return c.json({ data: clients });
  });

  /**
   * POST /api/v1/organisations/me/api-clients
   * INK-148: Register a machine API client
   */
  router.post('/', requireScopes(API_SCOPES.API_CLIENTS_MANAGE), async (c) => {
    const prisma = getPrisma(c);
    const principal = c.get('principal');

    const body = await c.req.json().catch(() => ({}));
    const parseResult = createClientBindingSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues.map((i) => i.message).join(', '));
    }

    const input = parseResult.data;

    const binding = await prisma.apiClientBinding.create({
      data: {
        organisationId: principal.organisationId,
        clientId: input.clientId,
        issuer: input.issuer,
        name: input.name,
        description: input.description,
        scopes: input.scopes,
        actingUserId: input.actingUserId,
        status: 'active',
      },
    });

    return c.json(binding, 201);
  });

  /**
   * PATCH /api/v1/organisations/me/api-clients/:id
   */
  router.patch('/:id', requireScopes(API_SCOPES.API_CLIENTS_MANAGE), async (c) => {
    const prisma = getPrisma(c);
    const principal = c.get('principal');
    const id = c.req.param('id');

    const existing = await prisma.apiClientBinding.findFirst({
      where: { id, organisationId: principal.organisationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('API client binding not found');

    const body = await c.req.json().catch(() => ({}));
    const parseResult = updateClientBindingSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues.map((i) => i.message).join(', '));
    }

    const input = parseResult.data;
    const updated = await prisma.apiClientBinding.update({
      where: { id },
      data: {
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        scopes: input.scopes !== undefined ? input.scopes : (existing.scopes as any),
        status: input.status ?? existing.status,
      },
    });

    return c.json(updated);
  });

  /**
   * DELETE /api/v1/organisations/me/api-clients/:id
   */
  router.delete('/:id', requireScopes(API_SCOPES.API_CLIENTS_MANAGE), async (c) => {
    const prisma = getPrisma(c);
    const principal = c.get('principal');
    const id = c.req.param('id');

    const existing = await prisma.apiClientBinding.findFirst({
      where: { id, organisationId: principal.organisationId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('API client binding not found');

    await prisma.apiClientBinding.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'revoked',
      },
    });

    return c.body(null, 204);
  });

  return router;
}
