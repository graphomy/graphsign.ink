import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { VerificationService } from '../services/verification-service.js';
import { verifyHashSchema } from '../validators/certificate-validators.js';
import { BadRequestError } from '../utils/errors.js';
import type { Env } from '../index.js';

export interface VerifyDeps {
  prisma?: PrismaClient;
}

export function createPublicVerifyRoutes(deps?: VerifyDeps) {
  const verify = new Hono<{ Bindings: Env }>();

  function getServices(c: any) {
    let prisma = deps?.prisma;
    if (!prisma) {
      const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL;
      const isValidUrl =
        dbUrl &&
        typeof dbUrl === 'string' &&
        dbUrl.trim() !== '' &&
        (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'));

      if (isValidUrl) {
        prisma = createPrismaClient(dbUrl);
      } else {
        prisma = getLegacyPrisma();
      }
    }

    const verificationService = new VerificationService(prisma);
    return { verificationService };
  }

  // GET /verify/:token (Public lookup by token from QR or URL)
  verify.get('/:token', async (c) => {
    const { verificationService } = getServices(c);
    const token = c.req.param('token');
    const report = await verificationService.verifyByToken(token);
    return c.json(report, 200);
  });

  // POST /verify/hash (Public lookup by client-computed hash)
  verify.post('/hash', async (c) => {
    const { verificationService } = getServices(c);
    const body = await c.req.json().catch(() => ({}));
    const parseResult = verifyHashSchema.safeParse(body);

    if (!parseResult.success) {
      return c.json(
        {
          valid: false,
          error: 'Invalid payload: ' + parseResult.error.issues.map((e) => e.message).join(', '),
        },
        400,
      );
    }
    const report = await verificationService.verifyByHash(parseResult.data.hash);
    return c.json(report, 200);
  });

  // POST /verify/file (Public lookup by file payload)
  verify.post('/file', async (c) => {
    const { verificationService } = getServices(c);
    const body = await c.req.json().catch(() => ({}));

    if (!body.fileData) {
      throw new BadRequestError('Missing fileData in request payload.');
    }

    const report = await verificationService.verifyUploadedFile(body.fileData);
    return c.json(report, 200);
  });

  // GET /verify/:token/certificate (Public download certificate of authenticity)
  verify.get('/:token/certificate', async (c) => {
    const { verificationService } = getServices(c);
    const token = c.req.param('token');
    const cert = await verificationService.generateVerificationCertificate(token);
    return c.json(cert, 200);
  });

  return verify;
}
