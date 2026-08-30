import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CertificateService } from './certificate-service.js';
import { KeyCustodyService } from './key-custody-service.js';

describe('CertificateService Unit Tests', () => {
  let certService: CertificateService;
  let mockPrisma: any;
  let mockAudit: any;
  let keyCustody: KeyCustodyService;

  beforeEach(() => {
    mockPrisma = {
      organisation: {
        findUnique: vi.fn(),
      },
      signingCertificate: {
        count: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue({}),
    };

    keyCustody = new KeyCustodyService();
    certService = new CertificateService(mockPrisma as any, keyCustody, mockAudit as any);
  });

  it('generates self-signed X.509 certificate for tenant (FR-012.002)', async () => {
    mockPrisma.organisation.findUnique.mockResolvedValueOnce({
      id: 'org-1',
      name: 'Acme Corp',
    });
    mockPrisma.signingCertificate.count.mockResolvedValueOnce(0);
    mockPrisma.signingCertificate.create.mockImplementationOnce(({ data }: any) =>
      Promise.resolve({ id: 'cert-1', ...data }),
    );

    const result = await certService.generateSelfSigned('org-1', 'usr-1', {
      name: 'Corporate Signing Certificate',
      algorithm: 'RSA_2048',
    });

    expect(result.certificate).toBeDefined();
    expect(result.certificate.name).toBe('Corporate Signing Certificate');
    expect(result.certificate.type).toBe('SELF_SIGNED');
    expect(result.certificate.isDefault).toBe(true);
    expect(result.certificate.certificatePem).toContain('-----BEGIN CERTIFICATE-----');
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICATE_GENERATED',
        organisationId: 'org-1',
      }),
    );
  });

  it('imports BYO certificate with chain metadata (FR-012.001)', async () => {
    mockPrisma.organisation.findUnique.mockResolvedValueOnce({
      id: 'org-1',
      name: 'Acme Corp',
    });
    mockPrisma.signingCertificate.count.mockResolvedValueOnce(1);
    mockPrisma.signingCertificate.create.mockImplementationOnce(({ data }: any) =>
      Promise.resolve({ id: 'cert-byo', ...data }),
    );

    const result = await certService.uploadByoCertificate('org-1', 'usr-1', {
      name: 'AATL Commercial Certificate',
      certificatePem:
        '-----BEGIN CERTIFICATE-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...\n-----END CERTIFICATE-----',
      chainPem: '-----BEGIN CERTIFICATE-----\nCA_CHAIN_DATA\n-----END CERTIFICATE-----',
      algorithm: 'RSA_2048',
    });

    expect(result.id).toBeDefined();
    expect(result.type).toBe('BYO');
    expect(result.padesLevel).toBe('B_LTA');
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICATE_UPLOADED',
      }),
    );
  });

  it('sets default certificate for organisation', async () => {
    mockPrisma.signingCertificate.findFirst.mockResolvedValueOnce({
      id: 'cert-2',
      name: 'New Default',
      organisationId: 'org-1',
    });
    mockPrisma.signingCertificate.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.signingCertificate.update.mockResolvedValueOnce({
      id: 'cert-2',
      isDefault: true,
    });

    const updated = await certService.setDefaultCertificate('org-1', 'usr-1', 'cert-2');

    expect(mockPrisma.signingCertificate.updateMany).toHaveBeenCalledWith({
      where: { organisationId: 'org-1', isDefault: true },
      data: { isDefault: false },
    });
    expect(updated.isDefault).toBe(true);
  });

  it('soft-deletes / revokes certificate', async () => {
    mockPrisma.signingCertificate.findFirst.mockResolvedValueOnce({
      id: 'cert-1',
      name: 'Old Cert',
      organisationId: 'org-1',
    });
    mockPrisma.signingCertificate.update.mockResolvedValueOnce({
      id: 'cert-1',
      status: 'REVOKED',
    });

    const res = await certService.deleteCertificate('org-1', 'usr-1', 'cert-1');

    expect(res.success).toBe(true);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CERTIFICATE_REVOKED',
      }),
    );
  });
});
