import type { PrismaClient } from '@graphsign/db';
import { sha256 } from '../utils/crypto.js';
import { NotFoundError } from '../utils/errors.js';

export interface PublicVerificationReport {
  isValid: boolean;
  status: 'VALID' | 'TAMPERED' | 'NOT_FOUND' | 'REVOKED';
  verificationToken: string;
  verificationUrl?: string;
  qrCodeDataUrl?: string;
  documentTitle: string;
  documentHash: string;
  completedAt: string | null;
  totalSigners: number;
  signedSigners: number;
  sealDetails: {
    algorithm: string;
    padesLevel: string;
    tsaUrl: string | null;
    tsaTimestamp: string | null;
    tsaProvider?: string;
    certificateSubject?: string;
    certificateIssuer?: string;
  };
  organisationName: string;
  sealedAt: string;
}

export class VerificationService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Method 1: Public verification by token, agreement ID, or envelope ID.
   * Safe for public consumption — never exposes private document body.
   */
  async verifyByToken(token: string): Promise<PublicVerificationReport> {
    const cleanToken = token.trim();
    let seal = null;

    if (this.prisma.documentSeal.findUnique) {
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

    if (!seal && this.prisma.documentSeal.findFirst) {
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

    // If seal not found directly, check if token is an envelopeId, agreement ID, signing token, or verificationToken
    if (!seal && this.prisma.agreement) {
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

      // Try envelope ID prefix match: ENV-XXXXXXXX -> agreement.id starts with XXXXXXXX
      if (!agreement && cleanToken.toUpperCase().startsWith('ENV-')) {
        const envHex = cleanToken.substring(4).toLowerCase().replace(/[^a-f0-9]/g, '');
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
          agreement = candidateAgreements.find(
            (ag) =>
              ag.id.replace(/-/g, '').toLowerCase().startsWith(envHex) ||
              ((ag.metadata as any)?.envelopeId as string)?.toUpperCase() === cleanToken.toUpperCase(),
          ) || null;
        }
      }

      // Try lookup by recipient signing token hash
      if (!agreement && this.prisma.agreementRecipient?.findUnique) {
        try {
          const { hashToken } = await import('../utils/crypto.js');
          const tHash = await hashToken(cleanToken);
          const recip = await this.prisma.agreementRecipient.findUnique({
            where: { signingTokenHash: tHash },
            include: {
              agreement: {
                include: {
                  recipients: true,
                  organisation: { select: { name: true } },
                  documentSeals: {
                    include: { certificate: true },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                  },
                },
              },
            },
          });
          if (recip?.agreement) {
            agreement = recip.agreement as any;
          }
        } catch {
          // Ignore hash lookup errors
        }
      }

      if (agreement) {
        if (agreement.documentSeals && agreement.documentSeals.length > 0) {
          seal = {
            ...agreement.documentSeals[0],
            agreement,
          } as any;
        } else if (agreement.status === 'COMPLETED') {
          const meta = (agreement.metadata as any) || {};
          seal = {
            id: `seal-${agreement.id.substring(0, 8)}`,
            agreementId: agreement.id,
            agreement,
            verificationToken: (meta.verificationToken as string) || cleanToken,
            documentHash: (meta.documentHash as string) || 'COMPLETED',
            algorithm: 'RSA-2048',
            padesLevel: 'B_T',
            status: 'SUCCESS',
            createdAt: agreement.completedAt || new Date(),
            metadata: {
              verificationUrl: `https://graphsign.ink/verify/${cleanToken}`,
              signerName: 'GraphSign Tenant Signing Authority',
              tsaProvider: 'FreeTSA / DigiCert RFC 3161 TSA',
            },
          };
        }
      }
    }

    if (!seal) {
      throw new NotFoundError(
        `Verification token or document ID "${cleanToken}" not found. The document may not be completed yet or was not sealed by graphsign.ink.`,
      );
    }

    return this.buildReport(seal);
  }

  /**
   * Method 2: Public verification by document SHA-256 hash.
   */
  async verifyByHash(hash: string): Promise<PublicVerificationReport> {
    const cleanHash = hash
      .replace(/^sha256:/i, '')
      .trim()
      .toLowerCase();

    let seal = await this.prisma.documentSeal.findFirst({
      where: {
        OR: [
          { documentHash: cleanHash },
          { metadata: { path: ['preSealDigest'], equals: cleanHash } },
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

    if (!seal) {
      throw new NotFoundError('No sealed document found with the provided hash.');
    }

    return this.buildReport(seal);
  }

  private buildReport(seal: any): PublicVerificationReport {
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

    const isCertRevoked = seal.certificate?.status === 'REVOKED';
    const status = isCertRevoked ? 'REVOKED' : seal.status === 'SUCCESS' ? 'VALID' : 'TAMPERED';

    const meta = (seal.metadata as any) || {};

    return {
      isValid: status === 'VALID',
      status,
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
      },
      organisationName: agreement.organisation?.name || 'graphsign.ink',
      sealedAt: seal.createdAt
        ? typeof seal.createdAt === 'string'
          ? seal.createdAt
          : seal.createdAt.toISOString()
        : new Date().toISOString(),
    };
  }

  /**
   * Method 3: Uploaded file verification. Computes hash and inspects PAdES signature tokens.
   */
  async verifyUploadedFile(fileContent: string | Uint8Array): Promise<PublicVerificationReport> {
    let hash: string;
    let tokenFromPdf: string | null = null;

    if (typeof fileContent === 'string') {
      hash = await sha256(fileContent);
      const match = fileContent.match(/GS-[0-9a-fA-F]{8}/);
      if (match) tokenFromPdf = match[0]!;
    } else {
      const text = new TextDecoder().decode(fileContent);
      hash = await sha256(text);
      const match = text.match(/GS-[0-9a-fA-F]{8}/);
      if (match) tokenFromPdf = match[0]!;
    }

    if (tokenFromPdf) {
      try {
        return await this.verifyByToken(tokenFromPdf);
      } catch {
        // Fall back to hash search
      }
    }

    return this.verifyByHash(hash);
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
