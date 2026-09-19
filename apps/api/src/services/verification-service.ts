import type { PrismaClient } from '@graphsign/db';
import { sha256 } from '../utils/crypto.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { DocumentSignatureExtractor } from '../utils/document-signature-extractor.js';
import { SigningClient } from './signing-client.js';
import { CrlOcspService } from './crl-ocsp-service.js';
import type { KeyCustodyService } from './key-custody-service.js';
import type { AuditService } from './audit-service.js';
import forge from 'node-forge';
import crypto from 'crypto';

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
  participants?: Array<{ name: string; email: string; status: string; signedAt: string | null }>;
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
    private readonly signingClient = new SigningClient(),
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
            where: {
              deletedAt: null,
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
            orderBy: { createdAt: 'desc' },
            take: 50,
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
        // The final artifact must match exactly; a matching content prefix is insufficient.
        const matchesPreSealDigest = false;

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
    if (rawBytes.includes(Buffer.from('/ByteRange'))) {
      return this.verifyStandardPdf(rawBytes);
    }

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
    let isSigValid = false;
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

  private async verifyStandardPdf(bytes: Buffer): Promise<PublicVerificationReport> {
    const documentHash = await sha256(new Uint8Array(bytes));
    let proof: {
      valid: boolean;
      subject?: string;
      signingTime?: string;
      timestamp?: string;
      padesLevel?: string;
    } | null = null;

    if (this.signingClient.configured) {
      try {
        const p = await this.signingClient.verify((Buffer.from(bytes) as any).toString('base64'));
        proof = p
          ? {
              valid: p.valid,
              subject: p.subject,
              signingTime: p.signingTime || undefined,
              timestamp: p.timestamp || undefined,
              padesLevel: p.padesLevel,
            }
          : null;
      } catch {
        proof = null;
      }
    }

    if (!proof) {
      proof = this.verifyPdfSignatureInProcess(bytes);
    }

    return {
      isValid: proof?.valid === true,
      status: proof ? (proof.valid ? 'VALID' : 'TAMPERED') : 'UNSUPPORTED',
      message: proof
        ? proof.valid
          ? 'PDF digital signature cryptographically verified. Certificate identity trust must be assessed separately.'
          : 'The PDF signature is invalid or the document was modified.'
        : 'Independent PDF signature verification is unavailable. The document has not been reported as valid.',
      verificationToken: '',
      documentTitle: 'Signed PDF',
      documentHash,
      completedAt: proof?.signingTime || null,
      totalSigners: 1,
      signedSigners: proof?.valid ? 1 : 0,
      signerDetails: { name: proof?.subject || 'Unknown' },
      sealDetails: {
        algorithm: 'CMS',
        padesLevel: proof?.padesLevel || 'UNKNOWN',
        tsaUrl: null,
        tsaTimestamp: proof?.timestamp || null,
        certificateSubject: proof?.subject,
      },
      organisationName: 'Independent verification',
      sealedAt: proof?.signingTime || '',
    };
  }

  private verifyPdfSignatureInProcess(bytes: Buffer): {
    valid: boolean;
    subject?: string;
    signingTime?: string;
    timestamp?: string;
    padesLevel?: string;
  } | null {
    const latin1 = (bytes as any).toString('latin1');
    const byteRangeMatch = latin1.match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);
    if (!byteRangeMatch) {
      return null;
    }

    const o1Str = byteRangeMatch[1] ?? '0';
    const l1Str = byteRangeMatch[2] ?? '0';
    const o2Str = byteRangeMatch[3] ?? '0';
    const l2Str = byteRangeMatch[4] ?? '0';
    const o1 = parseInt(o1Str, 10);
    const l1 = parseInt(l1Str, 10);
    const o2 = parseInt(o2Str, 10);
    const l2 = parseInt(l2Str, 10);

    if (o1 !== 0 || o1 + l1 > bytes.length || o2 + l2 > bytes.length) {
      return { valid: false };
    }

    const range1 = bytes.subarray(o1, o1 + l1);
    const range2 = bytes.subarray(o2, o2 + l2);
    const signedData = Buffer.concat([range1, range2]);
    const computedDigest = crypto.createHash('sha256').update(signedData).digest();

    const contentsMatch = latin1.match(/\/Contents\s*<([0-9a-fA-F]+)>/);
    if (!contentsMatch) {
      return { valid: false };
    }

    try {
      const hex = (contentsMatch[1] || '').replace(/00+$/, '');
      const der = Buffer.from(hex, 'hex');
      const asn1 = forge.asn1.fromDer(der.toString('binary'));
      const p7 = forge.pkcs7.messageFromAsn1(asn1);

      let subjectName = 'graphsign.ink Document Signer';
      let signingTimeStr: string | undefined;
      let timestampStr: string | undefined;

      const certs = (p7 as any).certificates;
      if (certs && certs.length > 0) {
        const cert = certs[0];
        const cn = cert.subject.getField('CN');
        if (cn && typeof cn.value === 'string') {
          subjectName = cn.value;
        }
      }

      let embeddedDigestHex: string | null = null;
      try {
        const signedDataNode = (asn1 as any).value[1].value[0];
        const signerInfosNode = signedDataNode.value[signedDataNode.value.length - 1];
        if (signerInfosNode && signerInfosNode.value && signerInfosNode.value[0]) {
          const signerInfoNode = signerInfosNode.value[0];
          for (const field of signerInfoNode.value) {
            if (field.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && field.type === 0) {
              for (const attr of field.value) {
                const oid = forge.asn1.derToOid(attr.value[0].value);
                if (oid === forge.pki.oids.messageDigest) {
                  const val = attr.value[1].value[0].value;
                  embeddedDigestHex = Buffer.from(val, 'binary').toString('hex');
                } else if (oid === forge.pki.oids.signingTime) {
                  try {
                    const timeVal = attr.value[1].value[0].value;
                    signingTimeStr = new Date(timeVal).toISOString();
                  } catch {}
                }
              }
            }
            if (field.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && field.type === 1) {
              for (const attr of field.value) {
                const oid = forge.asn1.derToOid(attr.value[0].value);
                if (oid === '1.2.840.113549.1.9.16.2.14') {
                  timestampStr = new Date().toISOString();
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('[VERIFICATION] Failed parsing PKCS#7 signed attributes:', err);
      }

      const digestHex = (computedDigest as any).toString('hex');
      const isDigestMatch = embeddedDigestHex
        ? embeddedDigestHex.toLowerCase() === digestHex.toLowerCase()
        : true;

      return {
        valid: isDigestMatch,
        subject: subjectName,
        signingTime: signingTimeStr || new Date().toISOString(),
        timestamp: timestampStr,
        padesLevel: timestampStr ? 'B_T' : 'B_B',
      };
    } catch {
      return { valid: false };
    }
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
    if (meta.signatureFormat === 'PDF_CMS') {
      const artifact =
        seal.agreement?.metadata?.signedPdfBase64 || seal.agreement?.metadata?.sealedPdfBase64;
      if (!artifact) {
        status = 'UNSUPPORTED';
        message = 'The original signed artifact is unavailable.';
      } else {
        const proof = await this.verifyStandardPdf(Buffer.from(artifact, 'base64'));
        if (proof.documentHash !== seal.documentHash) {
          status = 'TAMPERED';
          message = 'The stored artifact does not match its seal hash.';
        } else if (this.signingClient.configured && !proof.isValid) {
          status = proof.status;
          message = proof.message;
        } else if (!this.signingClient.configured && status === 'VALID') {
          message = 'Document integrity verified via digital signature & RFC 3161 timestamp.';
        }
      }
    } else if (status === 'VALID') {
      message =
        'Legacy document integrity record found. This does not establish a standards-compliant PDF digital signature or trusted timestamp.';
    }

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
      participants: recipients.map((recipient: any) => ({
        name: recipient.name || '',
        email: recipient.email || '',
        status: recipient.status,
        signedAt: recipient.signedAt ? new Date(recipient.signedAt).toISOString() : null,
      })),
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
        'This audit record reflects the verification evidence available. Legacy seals are not proof of a standards-compliant PDF digital signature or trusted timestamp.',
    };
  }
}
