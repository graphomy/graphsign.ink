import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PadesSealingService } from './pades-sealing-service.js';
import { KeyCustodyService } from './key-custody-service.js';
import { TsaService } from './tsa-service.js';

describe('PadesSealingService Unit Tests', () => {
  let sealingService: PadesSealingService;
  let mockPrisma: any;
  let mockAudit: any;
  let keyCustody: KeyCustodyService;
  let tsaService: TsaService;

  beforeEach(() => {
    mockPrisma = {
      agreement: {
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      signingCertificate: {
        findFirst: vi.fn(),
        create: vi
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve({ id: 'cert-auto', ...data })),
      },
      documentSeal: {
        create: vi.fn(),
      },
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue({}),
    };

    keyCustody = new KeyCustodyService();
    tsaService = new TsaService();
    sealingService = new PadesSealingService(
      mockPrisma as any,
      keyCustody,
      tsaService,
      mockAudit as any,
    );
  });

  it('seals a completed agreement with PAdES B-T signature and QR verification code', async () => {
    mockPrisma.agreement.findFirst.mockResolvedValueOnce({
      id: 'agr-1',
      organisationId: 'org-1',
      title: 'Master Services Agreement',
      markdownContent: '# Contract Content',
      recipients: [
        { id: 'rec-1', role: 'signer', status: 'SIGNED' },
        { id: 'rec-2', role: 'signer', status: 'SIGNED' },
      ],
      author: { name: 'Alice', email: 'alice@acme.com' },
    });

    mockPrisma.signingCertificate.findFirst.mockResolvedValueOnce({
      id: 'cert-1',
      organisationId: 'org-1',
      name: 'Default Cert',
      algorithm: 'RSA_2048',
      certificatePem: '-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----',
      pkcs11KeyId: 'key_123',
      subjectDn: 'CN=Acme Sign',
      issuerDn: 'CN=Acme Sign',
      padesLevel: 'B_T',
      tsaUrl: null,
    });

    mockPrisma.documentSeal.create.mockImplementationOnce(({ data }: any) =>
      Promise.resolve({ id: 'seal-1', ...data }),
    );

    const result = await sealingService.sealAgreement({
      agreementId: 'agr-1',
      organisationId: 'org-1',
      userId: 'usr-1',
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.verificationToken).toMatch(/^GS-[0-9a-f]{8}$/);
    expect(result.verificationUrl).toContain(result.verificationToken);
    expect(result.qrCodeDataUrl).toContain('data:image/png;base64');
    expect(result.documentHash).toBeDefined();
    expect(result.padesLevel).toBe('B_T');
    expect(result.sealedPdfBase64).toBeDefined();
    const decodedContainer = Buffer.from(result.sealedPdfBase64, 'base64').toString('utf-8');
    expect(decodedContainer).toContain('%PAdES-B-T-SEAL:');
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_SEALED',
      }),
    );
  });

  it('batch seals multiple agreements', async () => {
    mockPrisma.agreement.findFirst.mockResolvedValue({
      id: 'agr-batch',
      organisationId: 'org-1',
      title: 'Batch Doc',
      recipients: [],
      author: { name: 'Alice', email: 'alice@acme.com' },
    });

    mockPrisma.signingCertificate.findFirst.mockResolvedValue({
      id: 'cert-1',
      organisationId: 'org-1',
      name: 'Default Cert',
      algorithm: 'RSA_2048',
      certificatePem: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
      pkcs11KeyId: 'key_123',
      padesLevel: 'B_T',
    });

    mockPrisma.documentSeal.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'seal-batch', ...data }),
    );

    const batchRes = await sealingService.batchSeal('org-1', 'usr-1', ['agr-1', 'agr-2']);

    expect(batchRes.total).toBe(2);
    expect(batchRes.successfulCount).toBe(2);
    expect(batchRes.failedCount).toBe(0);
    expect(batchRes.results).toHaveLength(2);
  });
});
