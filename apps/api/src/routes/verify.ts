import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, getLegacyPrisma } from '@graphsign/db';
import { VerificationService } from '../services/verification-service.js';
import { BatchVerificationService } from '../services/batch-verification-service.js';
import { CrlOcspService } from '../services/crl-ocsp-service.js';
import { KeyCustodyService } from '../services/key-custody-service.js';
import { PrismaAuditService, type AuditService } from '../services/audit-service.js';
import { verifyHashSchema } from '../validators/certificate-validators.js';
import { BadRequestError } from '../utils/errors.js';
import type { Env } from '../index.js';

export interface VerifyDeps {
  prisma?: PrismaClient;
  verificationService?: VerificationService;
  batchService?: BatchVerificationService;
  keyCustodyService?: KeyCustodyService;
  crlOcspService?: CrlOcspService;
  auditService?: AuditService;
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

    const keyCustody = deps?.keyCustodyService || new KeyCustodyService();
    const crlOcsp = deps?.crlOcspService || new CrlOcspService(prisma);
    const audit = deps?.auditService || new PrismaAuditService(prisma);

    const verificationService =
      deps?.verificationService || new VerificationService(prisma, keyCustody, crlOcsp, audit);
    const batchService =
      deps?.batchService || new BatchVerificationService(verificationService, audit);

    const context = {
      ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || undefined,
      userAgent: c.req.header('user-agent') || undefined,
    };

    return { verificationService, batchService, context };
  }

  // GET /verify/:token (Public lookup by token from QR or URL)
  verify.get('/:token', async (c) => {
    const { verificationService, context } = getServices(c);
    const token = c.req.param('token');
    const report = await verificationService.verifyByToken(token, context);
    return c.json(report, 200);
  });

  // POST /verify/hash (Public lookup by client-computed hash)
  verify.post('/hash', async (c) => {
    const { verificationService, context } = getServices(c);
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
    const report = await verificationService.verifyByHash(parseResult.data.hash, context);
    return c.json(report, 200);
  });

  // POST /verify/file (Public lookup by file payload - INK-135)
  verify.post('/file', async (c) => {
    const { verificationService, context } = getServices(c);
    const body = await c.req.json().catch(() => ({}));

    if (!body.fileData) {
      throw new BadRequestError('Missing fileData in request payload.');
    }

    const report = await verificationService.verifyUploadedFile(body.fileData, {
      expectedToken: body.expectedToken,
      context,
    });
    return c.json(report, 200);
  });

  // POST /verify/offline (Offline verification without DB/network - INK-137)
  verify.post('/offline', async (c) => {
    const { verificationService } = getServices(c);
    const body = await c.req.json().catch(() => ({}));

    if (!body.fileData) {
      throw new BadRequestError('Missing fileData in request payload.');
    }

    const report = await verificationService.verifyOffline(body.fileData, body.certificatePem);
    return c.json(report, 200);
  });

  // POST /verify/batch (Batch verify up to 100 documents - INK-136)
  verify.post('/batch', async (c) => {
    const { batchService, context } = getServices(c);
    const body = await c.req.json().catch(() => ({}));

    if (!body.items || !Array.isArray(body.items)) {
      throw new BadRequestError('Error: No documents selected.');
    }

    const result = await batchService.processBatch(body.items, { context });
    return c.json(result, 200);
  });

  // POST /verify/batch/export (Download batch verification report CSV/PDF - INK-136)
  verify.post('/batch/export', async (c) => {
    const { batchService, context } = getServices(c);
    const body = await c.req.json().catch(() => ({}));

    if (!body.items || !Array.isArray(body.items)) {
      throw new BadRequestError('Error: No documents selected.');
    }

    const format = body.format === 'pdf' ? 'pdf' : 'csv';
    const batchResult = await batchService.processBatch(body.items, { context });

    if (format === 'pdf') {
      const pdfBytes = await batchService.generatePdfReport(batchResult);
      return new Response(pdfBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="batch-verification-report.pdf"',
        },
      });
    }

    const csv = batchService.generateCsvReport(batchResult);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="batch-verification-report.csv"',
      },
    });
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
