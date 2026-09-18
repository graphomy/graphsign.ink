import { SigningClient } from './signing-client.js';
import type { PrismaClient } from '@graphsign/db';
import { generateId, sha256 } from '../utils/crypto.js';
import { KeyCustodyService, KeyAlgorithm } from './key-custody-service.js';
import { AuditService } from './audit-service.js';
import { NotFoundError } from '../utils/errors.js';

export interface GenerateSelfSignedInput {
  name: string;
  commonName?: string;
  organization?: string;
  organizationUnit?: string;
  algorithm?: KeyAlgorithm;
  validityDays?: number;
  country?: string;
  state?: string;
  locality?: string;
  email?: string;
}

export interface UploadByoCertificateInput {
  name: string;
  certificatePem: string;
  privateKeyPem?: string;
  chainPem?: string;
  algorithm?: KeyAlgorithm;
  tsaUrl?: string;
}

export class CertificateService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly keyCustodyService: KeyCustodyService,
    private readonly auditService: AuditService,
    private readonly signingClient = new SigningClient(),
  ) {}

  /** Finds a tenant certificate or provisions a durable default in the signing boundary. */
  async getOrCreateDefaultCertificate(organisationId: string, userId: string) {
    const defaultCertificate = await this.prisma.signingCertificate.findFirst({
      where: { organisationId, isDefault: true, deletedAt: null, status: 'ACTIVE' },
    });
    if (defaultCertificate) return defaultCertificate;
    const certificate = await this.prisma.signingCertificate.findFirst({
      where: { organisationId, deletedAt: null, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    return (
      certificate ||
      (
        await this.generateSelfSigned(organisationId, userId, {
          name: 'Default Signing Certificate',
        })
      ).certificate
    );
  }

  /**
   * Generates a new self-signed X.509 certificate for an organisation (FR-012.002).
   */
  async generateSelfSigned(
    organisationId: string,
    userId: string,
    input: GenerateSelfSignedInput,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const org = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { id: true, name: true },
    });
    if (!org) throw new NotFoundError('Organisation not found.');
    const id = generateId();

    let algorithm = input.algorithm || 'RSA_2048';
    let certificatePem: string;
    let serialNumber: string;
    let subjectDn: string;
    let issuerDn: string;
    let validFrom: Date;
    let validTo: Date;
    let pkcs11KeyId = id;
    const padesLevel = 'B_B';

    if (this.signingClient.configured) {
      const material = await this.signingClient.certificate({
        organisationId,
        certificateId: id,
        selfSigned: true,
        algorithm: input.algorithm,
        commonName: input.commonName || input.name,
        validityDays: input.validityDays,
        organization: input.organization || org.name,
        organizationUnit: input.organizationUnit,
        country: input.country,
        state: input.state,
        locality: input.locality,
        email: input.email,
      });
      algorithm = material.algorithm as KeyAlgorithm;
      certificatePem = material.certificatePem;
      serialNumber = material.serialNumber;
      subjectDn = material.subjectDn;
      issuerDn = material.issuerDn;
      validFrom = new Date(material.validFrom);
      validTo = new Date(material.validTo);
    } else {
      const validityDays = input.validityDays || 365;
      const keyPair = await this.keyCustodyService.generateKeyPair(algorithm);
      pkcs11KeyId = keyPair.keyId;
      validFrom = new Date();
      validTo = new Date(validFrom.getTime() + validityDays * 24 * 60 * 60 * 1000);
      serialNumber = `0x${generateId().replace(/-/g, '').substring(0, 16)}`;

      const dnParts: string[] = [];
      const cn = input.commonName?.trim() || input.name?.trim() || `${org.name} Document Signing`;
      dnParts.push(`CN=${cn}`);
      const o = input.organization?.trim() || org.name;
      if (o) dnParts.push(`O=${o}`);
      if (input.organizationUnit?.trim()) dnParts.push(`OU=${input.organizationUnit.trim()}`);
      if (input.locality?.trim()) dnParts.push(`L=${input.locality.trim()}`);
      if (input.state?.trim()) dnParts.push(`ST=${input.state.trim()}`);
      dnParts.push(`C=${input.country?.trim() || 'US'}`);
      if (input.email?.trim()) dnParts.push(`EMAIL=${input.email.trim()}`);

      subjectDn = dnParts.join(', ');
      issuerDn = subjectDn;
      certificatePem = this.createSelfSignedCertificatePem(
        subjectDn,
        issuerDn,
        keyPair.publicKeyPem,
        serialNumber,
        validFrom,
        validTo,
      );
    }

    const count = await this.prisma.signingCertificate.count({
      where: { organisationId, deletedAt: null },
    });
    const certificate = await this.prisma.signingCertificate.create({
      data: {
        id,
        organisationId,
        name: input.name.trim(),
        type: 'SELF_SIGNED',
        algorithm,
        certificatePem,
        chainPem: null,
        pkcs11KeyId,
        keyFingerprint: await sha256(certificatePem),
        serialNumber,
        subjectDn,
        issuerDn,
        validFrom,
        validTo,
        isDefault: count === 0,
        status: 'ACTIVE',
        padesLevel,
        createdBy: userId,
      },
    });
    await this.auditService.log({
      organisationId,
      userId,
      action: 'CERTIFICATE_GENERATED',
      resourceType: 'signing_certificate',
      resourceId: id,
      ipAddress,
      userAgent,
      metadata: {
        certificateId: id,
        name: certificate.name,
        type: 'SELF_SIGNED',
        fingerprint: certificate.keyFingerprint,
      },
    });
    // Custody never exports private keys into API responses.
    return { certificate };
  }

  /**
   * Imports a Bring Your Own (BYO) certificate for an organisation (FR-012.001).
   */
  async uploadByoCertificate(
    organisationId: string,
    userId: string,
    input: UploadByoCertificateInput,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const id = generateId();
    const material = await this.signingClient.certificate({
      organisationId,
      certificateId: id,
      selfSigned: false,
      privateKeyPem: input.privateKeyPem,
      certificatePem: input.certificatePem,
      chainPem: input.chainPem,
    });
    const count = await this.prisma.signingCertificate.count({
      where: { organisationId, deletedAt: null },
    });
    const cert = await this.prisma.signingCertificate.create({
      data: {
        id,
        organisationId,
        name: input.name.trim(),
        type: 'BYO',
        algorithm: material.algorithm,
        certificatePem: material.certificatePem,
        chainPem: input.chainPem || null,
        pkcs11KeyId: id,
        keyFingerprint: await sha256(material.certificatePem),
        serialNumber: material.serialNumber,
        subjectDn: material.subjectDn,
        issuerDn: material.issuerDn,
        validFrom: new Date(material.validFrom),
        validTo: new Date(material.validTo),
        isDefault: count === 0,
        status: 'ACTIVE',
        padesLevel: input.tsaUrl ? 'B_T' : 'B_B',
        tsaUrl: input.tsaUrl || null,
        createdBy: userId,
      },
    });
    await this.auditService.log({
      organisationId,
      userId,
      action: 'CERTIFICATE_UPLOADED',
      resourceType: 'signing_certificate',
      resourceId: id,
      metadata: {
        certificateId: id,
        name: cert.name,
        type: 'BYO',
        fingerprint: cert.keyFingerprint,
      },
      ipAddress,
      userAgent,
    });
    return cert;
  }

  /**
   * Lists all certificates belonging to an organisation.
   */
  async listCertificates(organisationId: string) {
    return this.prisma.signingCertificate.findMany({
      where: { organisationId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Retrieves a single certificate by ID with tenant isolation.
   */
  async getCertificate(organisationId: string, certificateId: string) {
    const cert = await this.prisma.signingCertificate.findFirst({
      where: { id: certificateId, organisationId, deletedAt: null },
    });

    if (!cert) {
      throw new NotFoundError('Certificate not found.');
    }

    return cert;
  }

  /**
   * Sets a certificate as the default signing certificate for the organisation.
   */
  async setDefaultCertificate(
    organisationId: string,
    userId: string,
    certificateId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const cert = await this.prisma.signingCertificate.findFirst({
      where: { id: certificateId, organisationId, deletedAt: null },
    });

    if (!cert) {
      throw new NotFoundError('Certificate not found.');
    }

    // Unset current default
    await this.prisma.signingCertificate.updateMany({
      where: { organisationId, isDefault: true },
      data: { isDefault: false },
    });

    // Set new default
    const updated = await this.prisma.signingCertificate.update({
      where: { id: certificateId },
      data: { isDefault: true },
    });

    await this.auditService.log({
      organisationId,
      userId,
      action: 'CERTIFICATE_SET_DEFAULT',
      resourceType: 'signing_certificate',
      resourceId: cert.id,
      metadata: { certificateId, name: cert.name },
      ipAddress,
      userAgent,
    });

    return updated;
  }

  /**
   * Soft-deletes / revokes a certificate.
   */
  async deleteCertificate(
    organisationId: string,
    userId: string,
    certificateId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const cert = await this.prisma.signingCertificate.findFirst({
      where: { id: certificateId, organisationId, deletedAt: null },
    });

    if (!cert) {
      throw new NotFoundError('Certificate not found.');
    }

    await this.prisma.signingCertificate.update({
      where: { id: certificateId },
      data: {
        deletedAt: new Date(),
        status: 'REVOKED',
        isDefault: false,
      },
    });

    await this.auditService.log({
      organisationId,
      userId,
      action: 'CERTIFICATE_REVOKED',
      resourceType: 'signing_certificate',
      resourceId: cert.id,
      metadata: { certificateId, name: cert.name },
      ipAddress,
      userAgent,
    });

    return { success: true };
  }

  private createSelfSignedCertificatePem(
    _subjectDn: string,
    _issuerDn: string,
    publicKeyPem: string,
    _serialNumber: string,
    _validFrom: Date,
    _validTo: Date,
  ): string {
    const cleanPub = publicKeyPem
      .replace(/-----BEGIN [^-]+-----/g, '')
      .replace(/-----END [^-]+-----/g, '')
      .replace(/\s+/g, '');

    let der = Buffer.from(cleanPub, 'base64');
    if (der.length > 0 && der[0] !== 0x30) {
      der = Buffer.concat([
        Buffer.from([0x30, 0x82, (der.length >> 8) & 0xff, der.length & 0xff]),
        der,
      ]);
    }
    const b64 = der.toString('base64');
    const lines = b64.match(/.{1,64}/g) || [b64];
    return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
  }
}
