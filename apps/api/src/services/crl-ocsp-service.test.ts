import { describe, it, expect, vi } from 'vitest';
import { CrlOcspService } from './crl-ocsp-service.js';

describe('CrlOcspService Unit Tests (INK-139)', () => {
  it('validates active, non-expired certificate successfully', async () => {
    const service = new CrlOcspService();
    const result = await service.validateCertificate({
      validFrom: new Date(Date.now() - 3600000),
      validTo: new Date(Date.now() + 86400000),
      storedStatus: 'ACTIVE',
    });

    expect(result.isValid).toBe(true);
    expect(result.status).toBe('ACTIVE');
  });

  it('rejects expired certificate with clear warning and reason', async () => {
    const service = new CrlOcspService();
    const pastDate = new Date(Date.now() - 100000);
    const result = await service.validateCertificate({
      validFrom: new Date(Date.now() - 500000),
      validTo: pastDate,
      storedStatus: 'ACTIVE',
    });

    expect(result.isValid).toBe(false);
    expect(result.status).toBe('EXPIRED');
    expect(result.warning).toBe("Warning: Signer's certificate has expired.");
    expect(result.reason).toContain('Certificate expired on');
  });

  it('rejects revoked certificate with revocation status and warning', async () => {
    const mockPrisma: any = {
      signingCertificate: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'cert-revoked',
          status: 'REVOKED',
          validFrom: new Date(Date.now() - 100000),
          validTo: new Date(Date.now() + 10000000),
        }),
      },
    };

    const service = new CrlOcspService(mockPrisma);
    const result = await service.validateCertificate({
      certificateId: 'cert-revoked',
    });

    expect(result.isValid).toBe(false);
    expect(result.status).toBe('REVOKED');
    expect(result.warning).toBe("Warning: Signer's certificate has been revoked.");
  });
});
