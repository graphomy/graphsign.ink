import type { PrismaClient } from '@graphsign/db';
import QRCode from 'qrcode';
import { generateId, generateToken, sha256 } from '../utils/crypto.js';
import { KeyCustodyService } from './key-custody-service.js';
import { TsaService } from './tsa-service.js';
import { AuditService } from './audit-service.js';
import { CertificateService } from './certificate-service.js';
import { PdfAssemblyService } from './pdf-assembly-service.js';
import { PdfSignerEngine } from './pdf-signer-engine.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { SigningClient } from './signing-client.js';
import { PrismaAuditService } from './audit-service.js';

export interface SealAgreementOptions {
  agreementId: string;
  organisationId: string;
  userId?: string;
  certificateId?: string;
  pdfData?: string | Uint8Array; // Raw or base64 PDF binary
  ipAddress?: string;
  userAgent?: string;
}

export interface SealResult {
  sealId: string;
  agreementId: string;
  verificationToken: string;
  verificationUrl: string;
  qrCodeDataUrl: string;
  documentHash: string;
  padesLevel: string;
  algorithm: string;
  tsaUrl: string;
  tsaTimestamp: Date | null;
  sealedPdfBase64: string;
  status: 'SUCCESS' | 'FAILED';
}

export class PadesSealingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly keyCustodyService: KeyCustodyService,
    private readonly tsaService: TsaService,
    private readonly auditService: AuditService,
    private readonly signingClient = new SigningClient(),
  ) {}

  /**
   * Seals a completed agreement with an embedded CMS cryptographic signature,
   * RFC 3161 timestamp, and QR verification badge.
   */
  async sealAgreement(options: SealAgreementOptions): Promise<SealResult> {
    if ('$transaction' in this.prisma && '$executeRaw' in this.prisma) {
      return this.prisma.$transaction(
        async (transaction) => {
          await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${options.agreementId}))`;
          await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`signing:${options.organisationId}`}))`;
          const service = new PadesSealingService(
            transaction as PrismaClient,
            this.keyCustodyService,
            this.tsaService,
            new PrismaAuditService(transaction as PrismaClient),
            this.signingClient,
          );
          return service.sealAgreementUnlocked(options);
        },
        { timeout: 90000 },
      );
    }
    return this.sealAgreementUnlocked(options);
  }

  private async sealAgreementUnlocked(options: SealAgreementOptions): Promise<SealResult> {
    const { agreementId, organisationId, userId, ipAddress, userAgent } = options;

    const agreement = await this.prisma.agreement.findFirst({
      where: { id: agreementId, organisationId, deletedAt: null },
      include: {
        recipients: true,
        author: { select: { name: true, email: true } },
      },
    });

    if (!agreement) {
      throw new NotFoundError('Agreement not found.');
    }

    const meta = (agreement.metadata as Record<string, unknown>) || {};
    if (meta.signedPdfBase64 && meta.verificationToken && this.prisma.documentSeal?.findFirst) {
      const existing = await this.prisma.documentSeal.findFirst({
        where: { agreementId, organisationId, status: 'SUCCESS' },
        orderBy: { createdAt: 'desc' },
      });
      if (existing)
        return {
          sealId: existing.id,
          agreementId,
          verificationToken: existing.verificationToken,
          verificationUrl: `https://graphsign.ink/verify/${existing.verificationToken}`,
          qrCodeDataUrl: await QRCode.toDataURL(
            `https://graphsign.ink/verify/${existing.verificationToken}`,
          ),
          documentHash: existing.documentHash,
          padesLevel: existing.padesLevel,
          algorithm: existing.algorithm,
          tsaUrl: existing.tsaUrl || '',
          tsaTimestamp: existing.tsaTimestamp,
          sealedPdfBase64: meta.signedPdfBase64 as string,
          status: 'SUCCESS',
        };
    }

    if (agreement.status !== 'COMPLETED')
      throw new BadRequestError(
        'An agreement can only be digitally sealed after all required recipients have completed signing.',
      );
    // Resolve signing certificate
    let cert = null;
    if (options.certificateId && this.prisma.signingCertificate?.findFirst) {
      cert = await this.prisma.signingCertificate.findFirst({
        where: { id: options.certificateId, organisationId, deletedAt: null, status: 'ACTIVE' },
      });
    }

    if (options.certificateId && !cert)
      throw new NotFoundError('Active signing certificate not found for this organisation.');
    if (!cert && this.prisma.signingCertificate?.findFirst) {
      // Find default active cert
      cert = await this.prisma.signingCertificate.findFirst({
        where: { organisationId, isDefault: true, deletedAt: null, status: 'ACTIVE' },
      });
    }

    if (!cert && this.prisma.signingCertificate?.findFirst) {
      // Find any active cert
      cert = await this.prisma.signingCertificate.findFirst({
        where: { organisationId, deletedAt: null, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!cert) {
      // Auto-provision default self-signed signing certificate for tenant
      const certService = new CertificateService(
        this.prisma,
        this.keyCustodyService,
        this.auditService,
        this.signingClient,
      );
      const isUuid =
        userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
      const effectiveUserId = isUuid ? userId : agreement.authorId;
      cert = await certService.getOrCreateDefaultCertificate(organisationId, effectiveUserId);
    }

    // Legacy profiles are preserved for historical verification; renew into a new profile.
    if (
      cert.type === 'SELF_SIGNED' &&
      !Buffer.from(cert.certificatePem.replace(/-----[^-]+-----|\s/g, ''), 'base64')
        .subarray(0, 1)
        .equals(Buffer.from([0x30]))
    ) {
      if (options.certificateId)
        throw new BadRequestError(
          'This legacy certificate must be renewed before digitally signing new documents.',
        );
      cert = (
        await new CertificateService(
          this.prisma,
          this.keyCustodyService,
          this.auditService,
          this.signingClient,
        ).generateSelfSigned(organisationId, agreement.authorId, {
          name: 'Document Signing Certificate',
        })
      ).certificate;
    }

    // Generate unique verification token (e.g., GS-7f3a9c2e)
    const rawTokenHex = generateToken(4).toLowerCase();
    const verificationToken = `GS-${rawTokenHex}`;
    const verificationUrl = `https://graphsign.ink/verify/${verificationToken}`;

    // Generate QR Code data URL
    const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
      width: 160,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    const envelopeId =
      (meta.envelopeId as string) ||
      (agreement as any).envelopeId ||
      `ENV-${agreement.id.replace(/-/g, '').substring(0, 8).toUpperCase()}`;

    // Assemble the complete PDF with Envelope ID on every page, flattened fields, and Certificate page
    const pdfAssembly = new PdfAssemblyService();
    const existingPdfBase64 =
      (meta.signedPdfBase64 as string | undefined) ||
      (meta.fileBase64 as string | undefined) ||
      (meta.fileData as string | undefined) ||
      (typeof options.pdfData === 'string' ? options.pdfData : undefined);
    const existingPdfBytes = options.pdfData instanceof Uint8Array ? options.pdfData : undefined;

    const assembledPdfBytes = await pdfAssembly.assembleCompletedDocument({
      agreementTitle: agreement.title,
      envelopeId,
      markdownContent: agreement.markdownContent,
      existingPdfBytes,
      existingPdfBase64,
      fields: (agreement.fields as any)?.fields || [],
      recipients: (agreement.recipients as any[]) || [],
      sealDetails: {
        verificationToken,
        verificationUrl,
        documentHash: 'PENDING_SEAL',
        tsaTimestamp: null,
        tsaProvider: 'Timestamp evidence is recorded in the final digital signature',
        signerName: cert.name,
        subjectDn: cert.subjectDn,
        issuerDn: cert.issuerDn,
        algorithm: cert.algorithm,
        padesLevel: 'PENDING',
      },
    });

    let sealedPdfBase64: string;
    let sealedPdfBytes: Uint8Array;
    let sealAlgorithm = cert.algorithm;
    let sealPadesLevel = cert.padesLevel || 'B_T';
    let tsaResult: { tsaUrl: string; timestamp: Date | null; provider: string };

    if (this.signingClient.configured) {
      const signed = await this.signingClient.sign({
        pdfBase64: Buffer.from(assembledPdfBytes).toString('base64'),
        organisationId,
        certificateId: cert.id,
        certificatePem: cert.certificatePem,
        verificationToken,
        selfSigned: cert.type === 'SELF_SIGNED',
        tsaUrl: cert.tsaUrl,
      });
      sealedPdfBase64 = signed.pdfBase64;
      sealedPdfBytes = Buffer.from(sealedPdfBase64, 'base64');
      sealAlgorithm = signed.algorithm;
      sealPadesLevel = signed.padesLevel;
      tsaResult = {
        tsaUrl: cert.tsaUrl || '',
        timestamp: signed.timestamp ? new Date(signed.timestamp) : null,
        provider: signed.timestamp ? 'RFC 3161 verified' : 'No trusted timestamp',
      };
      if (cert.certificatePem !== signed.certificatePem && this.prisma.signingCertificate?.update) {
        await this.prisma.signingCertificate.update({
          where: { id: cert.id },
          data: {
            certificatePem: signed.certificatePem,
            keyFingerprint: await sha256(signed.certificatePem),
            subjectDn: signed.subjectDn,
            issuerDn: signed.issuerDn,
            serialNumber: signed.serialNumber,
            validFrom: new Date(signed.validFrom),
            validTo: new Date(signed.validTo),
            algorithm: signed.algorithm,
          },
        });
      }
    } else {
      // In-process sealing using native PdfSignerEngine (Adobe Acrobat recognized PAdES B-T)
      const preSealDigest = await sha256(assembledPdfBytes);
      const tsa = await this.tsaService.requestTimestamp(preSealDigest, cert.tsaUrl || undefined);
      tsaResult = {
        tsaUrl: tsa.tsaUrl || '',
        timestamp: tsa.timestamp,
        provider: tsa.provider,
      };
      sealPadesLevel = cert.padesLevel || 'B_T';
      sealAlgorithm = cert.algorithm;

      const keys = await this.keyCustodyService.generateKeyPair(cert.algorithm as any);
      const tsaTokenBytes = tsa.tokenBase64
        ? Buffer.from(tsa.tokenBase64, 'base64')
        : null;

      const signResult = await PdfSignerEngine.signPdf({
        pdfBytes: assembledPdfBytes,
        certificatePem: cert.certificatePem,
        privateKeyPem: keys.privateKeyPem,
        reason: `Cryptographically sealed by ${cert.name || 'graphsign.ink'}`,
        contactInfo: `https://graphsign.ink/verify/${verificationToken}`,
        tsaTokenBytes,
      });

      sealedPdfBase64 = signResult.signedPdfBase64;
      sealedPdfBytes = signResult.signedPdfBytes;
    }

    // Compute document hash over final sealed PDF container bytes for client hash verification
    const documentHash = await sha256(sealedPdfBytes);

    const sealId = generateId();

    // Persist DocumentSeal record
    const sealData = {
      id: sealId,
      organisationId,
      agreementId,
      certificateId: cert.id,
      algorithm: sealAlgorithm,
      padesLevel: sealPadesLevel,
      tsaUrl: tsaResult.tsaUrl,
      tsaTimestamp: tsaResult.timestamp,
      documentHash,
      sealedFileUrl: agreement.fileUrl || null,
      verificationToken,
      status: 'SUCCESS' as const,
      metadata: {
        signerName: cert.name,
        subjectDn: cert.subjectDn,
        issuerDn: cert.issuerDn,
        tsaProvider: tsaResult.provider,
        qrCodeGenerated: true,
        verificationUrl,
        signatureFormat: 'PDF_CMS',
      },
    };

    let seal = sealData as any;
    if ((this.prisma as any).documentSeal?.create) {
      seal = await this.prisma.documentSeal.create({
        data: sealData,
      });
    }

    // Update agreement with sealed PDF container and metadata
    if (this.prisma.agreement?.update) {
      await this.prisma.agreement.update({
        where: { id: agreement.id },
        data: {
          mimeType: 'application/pdf',
          metadata: {
            ...meta,
            signedPdfBase64: sealedPdfBase64,
            sealedPdfBase64,
            envelopeId,
            verificationToken,
            documentHash,
            padesLevel: sealPadesLevel,
            sealingStatus: 'READY',
            sealedAt: new Date().toISOString(),
          },
        },
      });
    }

    await this.auditService.log({
      organisationId,
      userId,
      action: 'DOCUMENT_SEALED',
      resourceType: 'agreement',
      resourceId: agreementId,
      metadata: {
        sealId: seal.id,
        verificationToken,
        documentHash,
        padesLevel: seal.padesLevel,
        algorithm: sealAlgorithm,
        tsaUrl: tsaResult.tsaUrl,
        tsaTimestamp: tsaResult.timestamp?.toISOString(),
      },
      ipAddress,
      userAgent,
    });

    return {
      sealId: seal.id,
      agreementId,
      verificationToken,
      verificationUrl,
      qrCodeDataUrl,
      documentHash,
      padesLevel: sealPadesLevel,
      algorithm: sealAlgorithm,
      tsaUrl: tsaResult.tsaUrl,
      tsaTimestamp: tsaResult.timestamp,
      sealedPdfBase64,
      status: 'SUCCESS',
    };
  }

  /**
   * Batch seals multiple agreements (FR-012 Stories / INK-132).
   */
  async batchSeal(
    organisationId: string,
    userId: string,
    agreementIds: string[],
    certificateId?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (!agreementIds || agreementIds.length === 0) {
      throw new BadRequestError('No agreements specified for batch sealing.');
    }

    if (agreementIds.length > 100) {
      throw new BadRequestError('Batch sealing exceeds maximum limit of 100 documents per job.');
    }

    const results: Array<{
      agreementId: string;
      success: boolean;
      seal?: SealResult;
      error?: string;
    }> = [];

    for (const agreementId of agreementIds) {
      try {
        const seal = await this.sealAgreement({
          agreementId,
          organisationId,
          userId,
          certificateId,
          ipAddress,
          userAgent,
        });
        results.push({ agreementId, success: true, seal });
      } catch (err) {
        results.push({
          agreementId,
          success: false,
          error: (err as Error).message,
        });
      }
    }

    const successfulCount = results.filter((r) => r.success).length;

    await this.auditService.log({
      organisationId,
      userId,
      action: 'BATCH_SEAL_COMPLETED',
      resourceType: 'agreement',
      resourceId: agreementIds[0]!,
      metadata: {
        total: agreementIds.length,
        successfulCount,
        failedCount: agreementIds.length - successfulCount,
      },
      ipAddress,
      userAgent,
    });

    return {
      total: agreementIds.length,
      successfulCount,
      failedCount: agreementIds.length - successfulCount,
      results,
    };
  }
}
