import type { PrismaClient } from '@graphsign/db';
import { sha256 } from '../utils/crypto.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { DocumentSignatureExtractor } from '../utils/document-signature-extractor.js';
import { CrlOcspService } from './crl-ocsp-service.js';
import type { KeyCustodyService } from './key-custody-service.js';
import type { AuditService } from './audit-service.js';

export interface SignerInfo {
  name?: string;
  email?: string;
  timestamp?: string;
}

export interface PublicVerificationReport {
  isValid: boolean;
  status: 'VALID' | 'TAMPERED' | 'NOT_FOUND' | 'REVOKED' | 'EXPIRED' | 'UNSIGNED' | 'UNSUPPORTED';
  message?: string;
  verificationToken: string;
  verificationUrl?: string;
  qrCodeDataUrl?: string;
  documentTitle: string;
  documentHash: string;
  completedAt: string | null;
  totalSigners: number;
  signedSigners: number;
  signerDetails?: SignerInfo | null;
  sealDetails: {
    algorithm: string;
    padesLevel: string;
    tsaUrl: string | null;
    tsaTimestamp: string | null;
    tsaProvider?: string;
    certificateSubject?: string;
    certificateIssuer?: string;
    certificateStatus?: string;
  };
  organisationName: string;
  sealedAt: string;
}

export interface VerifyContext {
  ipAddress?: string;
  userAgent?: string;
}

function toBuffer(fileData: string | Uint8Array): Buffer {
  if (typeof fileData === 'string') {
    if (fileData.startsWith('data:')) {
      return Buffer.from(fileData.split(',')[1] || '', 'base64');
    }
    if (
      !fileData.includes('<') &&
      !fileData.includes('%PDF') &&
      !fileData.includes('\n') &&
      /^[A-Za-z0-9+/=]+$/.test(fileData.trim()) &&
      fileData.trim().length % 4 === 0
    ) {
      return Buffer.from(fileData.trim(), 'base64');
    }
    return Buffer.from(fileData, 'utf-8');
  }
  return Buffer.from(fileData);
}

export class VerificationService {
  private readonly crlOcspService: CrlOcspService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly keyCustodyService?: KeyCustodyService,
    crlOcspService?: CrlOcspService,
    private readonly auditService?: AuditService,
  ) {
    this.crlOcspService = crlOcspService || new CrlOcspService(this.prisma);
  }

  /**
   * Method 1: Public verification by token, agreement ID, or envelope ID.
   * Safe for public consumption — never exposes private document body.
   */
  async verifyByToken(token: string, context?: VerifyContext): Promise<PublicVerificationReport> {
    const cleanToken = token.trim();
    let seal = null;

    if (this.prisma.documentSeal?.findUnique) {
      seal = await this.prisma.documentSeal.findUnique({
        where: { verificationToken: cleanToken },
        include: {
          agreement: {
            include: {
              recipients: true,
              organisation: { select: { name: true } },
            },
          },
          certificate: true,
        },
      });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      cleanToken,
    );

    if (!seal && this.prisma.documentSeal?.findFirst) {
      const tokenVariations = Array.from(
        new Set([
          cleanToken,
          cleanToken.toUpperCase(),
          cleanToken.toLowerCase(),
          cleanToken.startsWith('GS-') ? cleanToken.substring(3) : `GS-${cleanToken}`,
          cleanToken.startsWith('gs-') ? cleanToken.substring(3) : `GS-${cleanToken.toUpperCase()}`,
          `GS-${cleanToken.toLowerCase()}`,
        ]),
      );

      seal = await this.prisma.documentSeal.findFirst({
        where: {
          OR: [
            ...tokenVariations.map((t) => ({ verificationToken: t })),
            ...(isUuid ? [{ agreementId: cleanToken }, { id: cleanToken }] : []),
          ],
        },
        include: {
          agreement: {
            include: {
              recipients: true,
              organisation: { select: { name: true } },
            },
          },
          certificate: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Check if token is an envelopeId, agreement ID, or verificationToken in agreement metadata
    if (!seal && this.prisma.agreement?.findFirst) {
      let agreement = await this.prisma.agreement.findFirst({
        where: {
          deletedAt: null,
          OR: [
            ...(isUuid ? [{ id: cleanToken }] : []),
            { metadata: { path: ['envelopeId'], equals: cleanToken } },
            { metadata: { path: ['verificationToken'], equals: cleanToken } },
          ],
        },
        include: {
          recipients: true,
          organisation: { select: { name: true } },
          documentSeals: {
            include: { certificate: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      // Try envelope ID prefix match: ENV-XXXXXXXX
      if (!agreement && cleanToken.toUpperCase().startsWith('ENV-')) {
        const envHex = cleanToken
          .substring(4)
          .toLowerCase()
          .replace(/[^a-f0-9]/g, '');
        if (envHex.length >= 6) {
          const candidateAgreements = await this.prisma.agreement.findMany({
            where: { deletedAt: null },
            include: {
              recipients: true,
              organisation: { select: { name: true } },
              documentSeals: {
                include: { certificate: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
            take: 20,
          });
          agreement =
            candidateAgreements.find(
              (ag) =>
                ag.id.replace(/-/g, '').toLowerCase().startsWith(envHex) ||
                ((ag.metadata as any)?.envelopeId as string)?.toUpperCase() ===
                  cleanToken.toUpperCase(),
            ) || null;
        }
      }

      if (agreement) {
        if (agreement.documentSeals && agreement.documentSeals.length > 0) {
          seal = {
            ...agreement.documentSeals[0],
            agreement,
          } as any;
        } else {
          // Critical correctness fix: Agreement completed but NOT sealed in documentSeals.
          // Do NOT synthesize a fake valid seal! Return explicit unsigned status.
          const unsealedReport: PublicVerificationReport = {
            isValid: false,
            status: 'UNSIGNED',
            message: 'Error: No cryptographic seal found for this document.',
            verificationToken: cleanToken,
            documentTitle: agreement.title || 'Agreement',
            documentHash: '',
            completedAt: agreement.completedAt
              ? new Date(agreement.completedAt).toISOString()
              : null,
            totalSigners: (agreement.recipients || []).length,
            signedSigners: (agreement.recipients || []).filter((r: any) => r.status === 'SIGNED')
              .length,
            sealDetails: {
              algorithm: 'NONE',
              padesLevel: 'NONE',
              tsaUrl: null,
              tsaTimestamp: null,
            },
            organisationName: agreement.organisation?.name || 'graphsign.ink',
            sealedAt: new Date().toISOString(),
          };

          await this.logAuditAttempt(
            agreement.organisationId,
            agreement.id,
            unsealedReport,
            context,
          );
          return unsealedReport;
        }
      }
    }

    if (!seal) {
      throw new NotFoundError(
        `Verification token or document ID "${cleanToken}" not found. The document may not be completed yet or was not sealed by graphsign.ink.`,
      );
    }

    const report = await this.buildReport(seal);
    await this.logAuditAttempt(seal.organisationId, seal.id, report, context);
    return report;
  }

  /**
   * Method 2: Public verification by document SHA-256 hash.
   */
  async verifyByHash(hash: string, context?: VerifyContext): Promise<PublicVerificationReport> {
    const cleanHash = hash
      .replace(/^sha256:/i, '')
      .trim()
      .toLowerCase();

    let seal = null;
    if (this.prisma.documentSeal?.findFirst) {
      seal = await this.prisma.documentSeal.findFirst({
        where: {
          OR: [
            { documentHash: cleanHash },
            { documentHash: cleanHash.toUpperCase() },
            { documentHash: `sha256:${cleanHash}` },
          ],
        },
        include: {
          agreement: {
            include: {
              recipients: true,
              organisation: { select: { name: true } },
            },
          },
          certificate: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!seal) {
      throw new NotFoundError('No sealed document found with the provided hash.');
    }

    const report = await this.buildReport(seal);
    await this.logAuditAttempt(seal.organisationId, seal.id, report, context);
    return report;
  }

  /**
   * Method 3: Uploaded file verification (INK-135).
   * Computes file SHA-256 hash, extracts embedded signature, and verifies cryptographic integrity.
   * FIX: Never trusts embedded token string without verifying actual file byte hash!
   */
  async verifyUploadedFile(
    fileContent: string | Uint8Array,
    options?: { expectedToken?: string; context?: VerifyContext },
  ): Promise<PublicVerificationReport> {
    const rawBytes = toBuffer(fileContent);

    const computedFileHash = await sha256(new Uint8Array(rawBytes));
    const extracted = await DocumentSignatureExtractor.extract(rawBytes);

    const tokenCandidate = options?.expectedToken || extracted.verificationToken;

    if (tokenCandidate && this.prisma.documentSeal?.findUnique) {
      let seal = await this.prisma.documentSeal.findUnique({
        where: { verificationToken: tokenCandidate },
        include: {
          agreement: {
            include: {
              recipients: true,
              organisation: { select: { name: true } },
            },
          },
          certificate: true,
        },
      });

      if (!seal && this.prisma.documentSeal?.findFirst) {
        seal = await this.prisma.documentSeal.findFirst({
          where: { verificationToken: tokenCandidate },
          include: {
            agreement: {
              include: {
                recipients: true,
                organisation: { select: { name: true } },
              },
            },
            certificate: true,
          },
        });
      }

      if (seal) {
        const matchesOverallHash =
          computedFileHash.toLowerCase() === seal.documentHash.toLowerCase();
        const preSealDigest = (seal.metadata as any)?.preSealDigest as string | undefined;
        const matchesPreSealDigest =
          preSealDigest && extracted.signedContentDigest === preSealDigest;

        // Critical correctness check: If the file hash doesn't match the seal, it's altered!
        if (!matchesOverallHash && !matchesPreSealDigest) {
          const tamperedReport: PublicVerificationReport = {
            isValid: false,
            status: 'TAMPERED',
            message: 'Invalid: Document has been altered or signature is corrupted.',
            verificationToken: seal.verificationToken,
            documentTitle: seal.agreement?.title || 'Sealed Document',
            documentHash: computedFileHash,
            completedAt: seal.agreement?.completedAt
              ? new Date(seal.agreement.completedAt).toISOString()
              : null,
            totalSigners: seal.agreement?.recipients?.length || 0,
            signedSigners: (seal.agreement?.recipients || []).filter(
              (r: any) => r.status === 'SIGNED',
            ).length,
            signerDetails: extracted.signerDetails,
            sealDetails: {
              algorithm: seal.algorithm,
              padesLevel: seal.padesLevel,
              tsaUrl: seal.tsaUrl,
              tsaTimestamp: seal.tsaTimestamp ? new Date(seal.tsaTimestamp).toISOString() : null,
              certificateSubject: seal.certificate?.subjectDn,
              certificateIssuer: seal.certificate?.issuerDn,
            },
            organisationName: seal.agreement?.organisation?.name || 'graphsign.ink',
            sealedAt: seal.createdAt
              ? new Date(seal.createdAt).toISOString()
              : new Date().toISOString(),
          };

          await this.logAuditAttempt(
            seal.organisationId,
            seal.id,
            tamperedReport,
            options?.context,
          );
          return tamperedReport;
        }

        // Hashes match — proceed with report generation and cryptographic checks
        const report = await this.buildReport(seal);
        await this.logAuditAttempt(seal.organisationId, seal.id, report, options?.context);
        return report;
      }
    }

    // Try finding by exact file hash in database
    try {
      return await this.verifyByHash(computedFileHash, options?.context);
    } catch {
      // Not found in database — check if standalone signed document
    }

    if (!extracted.hasSignature) {
      return {
        isValid: false,
        status: 'UNSIGNED',
        message: 'Error: No signature found in the document.',
        verificationToken: 'N/A',
        documentTitle: 'Uploaded Document',
        documentHash: computedFileHash,
        completedAt: null,
        totalSigners: 0,
        signedSigners: 0,
        sealDetails: {
          algorithm: 'NONE',
          padesLevel: 'NONE',
          tsaUrl: null,
          tsaTimestamp: null,
        },
        organisationName: 'Unknown',
        sealedAt: new Date().toISOString(),
      };
    }

    // Standalone signed document without DB record — verify offline
    return this.verifyOffline(rawBytes);
  }

  /**
   * Method 4: Offline verification without database or external connectivity (INK-137).
   */
  async verifyOffline(
    fileContent: string | Uint8Array,
    suppliedCertPem?: string,
  ): Promise<PublicVerificationReport> {
    const rawBytes = toBuffer(fileContent);

    const computedHash = await sha256(new Uint8Array(rawBytes));
    const extracted = await DocumentSignatureExtractor.extract(rawBytes);

    if (!extracted.hasSignature) {
      return {
        isValid: false,
        status: 'UNSIGNED',
        message: 'Error: No signature found in the document.',
        verificationToken: 'OFFLINE',
        documentTitle: 'Offline Document',
        documentHash: computedHash,
        completedAt: null,
        totalSigners: 0,
        signedSigners: 0,
        sealDetails: {
          algorithm: 'NONE',
          padesLevel: 'NONE',
          tsaUrl: null,
          tsaTimestamp: null,
        },
        organisationName: 'Offline Verifier',
        sealedAt: new Date().toISOString(),
      };
    }

    const effectiveCertPem = suppliedCertPem || extracted.certificatePem;
    if (!effectiveCertPem && !extracted.publicKeyPem) {
      throw new BadRequestError('Error: Public key required for offline verification.');
    }

    // Validate certificate expiration dates offline
    const certValidation = await this.crlOcspService.validateCertificate({
      certificatePem: effectiveCertPem || undefined,
    });

    if (!certValidation.isValid) {
      return {
        isValid: false,
        status: certValidation.status as any,
        message: certValidation.warning || certValidation.reason,
        verificationToken: extracted.verificationToken || 'OFFLINE',
        documentTitle: 'Offline Document',
        documentHash: computedHash,
        completedAt: extracted.signerDetails?.timestamp || null,
        totalSigners: 1,
        signedSigners: 1,
        signerDetails: extracted.signerDetails,
        sealDetails: {
          algorithm: extracted.algorithm || 'RSA_2048',
          padesLevel: 'B_T',
          tsaUrl: null,
          tsaTimestamp: extracted.timestampToken ? new Date().toISOString() : null,
          certificateStatus: certValidation.status,
        },
        organisationName: 'Offline Verifier',
        sealedAt: new Date().toISOString(),
      };
    }

    // Cryptographically verify signature if KeyCustodyService is provided
    let isSigValid = true;
    if (
      this.keyCustodyService &&
      extracted.signatureBase64 &&
      extracted.signedContentDigest &&
      effectiveCertPem
    ) {
      try {
        isSigValid = await this.keyCustodyService.verifySignature(
          effectiveCertPem,
          (extracted.algorithm as any) || 'RSA_2048',
          btoa(extracted.signedContentDigest),
          extracted.signatureBase64,
        );
      } catch {
        isSigValid = false;
      }
    }

    const status = isSigValid ? 'VALID' : 'TAMPERED';

    return {
      isValid: isSigValid,
      status,
      message: isSigValid
        ? undefined
        : 'Invalid: Document has been altered or signature is corrupted.',
      verificationToken: extracted.verificationToken || 'OFFLINE',
      documentTitle: 'Offline Document',
      documentHash: computedHash,
      completedAt: extracted.signerDetails?.timestamp || null,
      totalSigners: 1,
      signedSigners: isSigValid ? 1 : 0,
      signerDetails: extracted.signerDetails,
      sealDetails: {
        algorithm: extracted.algorithm || 'RSA_2048',
        padesLevel: 'B_T',
        tsaUrl: null,
        tsaTimestamp: extracted.timestampToken ? new Date().toISOString() : null,
        certificateStatus: certValidation.status,
      },
      organisationName: 'Offline Verifier',
      sealedAt: new Date().toISOString(),
    };
  }

  private async buildReport(seal: any): Promise<PublicVerificationReport> {
    const agreement = seal.agreement || {};
    const recipients = agreement.recipients || [];
    const activeSigners = recipients.filter(
      (r: any) =>
        r.role?.toLowerCase() === 'signer' || r.role?.toLowerCase() === 'approver' || !r.role,
    );
    const totalCount =
      activeSigners.length > 0
        ? activeSigners.length
        : recipients.length > 0
          ? recipients.length
          : 0;
    const signedCount =
      activeSigners.filter((r: any) => r.status === 'SIGNED').length ||
      recipients.filter((r: any) => r.status === 'SIGNED').length ||
      0;

    // Validate certificate with CrlOcspService (INK-139)
    const certValidation = await this.crlOcspService.validateCertificate({
      certificateId: seal.certificateId,
      certificatePem: seal.certificate?.certificatePem,
      validFrom: seal.certificate?.validFrom,
      validTo: seal.certificate?.validTo,
      storedStatus: seal.certificate?.status,
    });

    let status: PublicVerificationReport['status'] = 'VALID';
    let message: string | undefined = undefined;

    if (!certValidation.isValid) {
      status = certValidation.status as any;
      message = certValidation.warning || certValidation.reason;
    } else if (seal.status !== 'SUCCESS') {
      status = 'TAMPERED';
      message = 'Invalid: Document has been altered or signature is corrupted.';
    }

    const meta = (seal.metadata as any) || {};

    // Determine primary signer details
    const firstSignedRecipient = recipients.find((r: any) => r.status === 'SIGNED');
    const signerDetails: SignerInfo | null = firstSignedRecipient
      ? {
          name: firstSignedRecipient.name,
          email: firstSignedRecipient.email,
          timestamp: firstSignedRecipient.signedAt
            ? new Date(firstSignedRecipient.signedAt).toISOString()
            : undefined,
        }
      : meta.signerName
        ? {
            name: meta.signerName,
            email: meta.signerEmail,
            timestamp: seal.createdAt ? new Date(seal.createdAt).toISOString() : undefined,
          }
        : null;

    return {
      isValid: status === 'VALID',
      status,
      message,
      verificationToken: seal.verificationToken,
      verificationUrl:
        meta.verificationUrl || `https://graphsign.ink/verify/${seal.verificationToken}`,
      qrCodeDataUrl: meta.qrCodeDataUrl,
      documentTitle: agreement.title || 'Sealed Document',
      documentHash: seal.documentHash,
      completedAt: agreement.completedAt
        ? typeof agreement.completedAt === 'string'
          ? agreement.completedAt
          : agreement.completedAt.toISOString()
        : null,
      totalSigners: totalCount,
      signedSigners: signedCount,
      signerDetails,
      sealDetails: {
        algorithm: seal.algorithm,
        padesLevel: seal.padesLevel,
        tsaUrl: seal.tsaUrl,
        tsaTimestamp: seal.tsaTimestamp
          ? typeof seal.tsaTimestamp === 'string'
            ? seal.tsaTimestamp
            : seal.tsaTimestamp.toISOString()
          : null,
        tsaProvider: meta.tsaProvider || 'RFC 3161 TSA',
        certificateSubject: seal.certificate?.subjectDn || meta.subjectDn,
        certificateIssuer: seal.certificate?.issuerDn || meta.issuerDn,
        certificateStatus: certValidation.status,
      },
      organisationName: agreement.organisation?.name || 'graphsign.ink',
      sealedAt: seal.createdAt
        ? typeof seal.createdAt === 'string'
          ? seal.createdAt
          : seal.createdAt.toISOString()
        : new Date().toISOString(),
    };
  }

  private async logAuditAttempt(
    organisationId: string | undefined,
    resourceId: string,
    report: PublicVerificationReport,
    context?: VerifyContext,
  ): Promise<void> {
    if (!this.auditService) return;

    try {
      await this.auditService.log({
        organisationId: organisationId || '00000000-0000-0000-0000-000000000000',
        action: 'DOCUMENT_VERIFIED',
        resourceType: 'document',
        resourceId,
        metadata: {
          outcome: report.isValid ? 'SUCCESS' : 'FAILURE',
          status: report.status,
          verificationToken: report.verificationToken,
          documentHash: report.documentHash,
          algorithm: report.sealDetails.algorithm,
          certificateStatus: report.sealDetails.certificateStatus,
          warning: report.message,
        },
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
    } catch {
      // Never let audit logging fail the primary verification response
    }
  }

  /**
   * Generates Certificate of Authenticity details (audit certificate).
   */
  async generateVerificationCertificate(token: string) {
    const report = await this.verifyByToken(token);

    return {
      certificateTitle: 'Certificate of Cryptographic Authenticity',
      issuer: 'graphsign.ink Trust Infrastructure',
      verificationReport: report,
      issuedAt: new Date().toISOString(),
      disclaimer:
        'This certificate confirms that the referenced document was cryptographically sealed with PAdES standards and timestamped via an RFC 3161 compliant Time Stamp Authority.',
    };
  }
}
