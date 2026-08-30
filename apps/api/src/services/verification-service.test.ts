import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerificationService } from './verification-service.js';

describe('VerificationService Unit Tests', () => {
  let verificationService: VerificationService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      documentSeal: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
    };
    verificationService = new VerificationService(mockPrisma as any);
  });

  it('verifies document by public token (Method 1: Token Lookup)', async () => {
    mockPrisma.documentSeal.findUnique.mockResolvedValueOnce({
      id: 'seal-1',
      verificationToken: 'GS-7f3a9c2e',
      documentHash: 'a1b2c3d4e5f6',
      status: 'SUCCESS',
      algorithm: 'RSA_2048',
      padesLevel: 'B_T',
      tsaUrl: 'http://timestamp.digicert.com',
      tsaTimestamp: new Date('2026-08-30T10:00:00Z'),
      createdAt: new Date('2026-08-30T10:00:00Z'),
      metadata: { tsaProvider: 'DigiCert' },
      agreement: {
        title: 'Service Level Agreement',
        completedAt: new Date('2026-08-30T10:00:00Z'),
        organisation: { name: 'Acme Corp' },
        recipients: [
          { role: 'signer', status: 'SIGNED' },
          { role: 'signer', status: 'SIGNED' },
        ],
      },
      certificate: {
        subjectDn: 'CN=Acme Sign',
        issuerDn: 'CN=Acme Sign',
        status: 'ACTIVE',
      },
    });

    const report = await verificationService.verifyByToken('GS-7f3a9c2e');

    expect(report.isValid).toBe(true);
    expect(report.status).toBe('VALID');
    expect(report.documentTitle).toBe('Service Level Agreement');
    expect(report.totalSigners).toBe(2);
    expect(report.signedSigners).toBe(2);
    expect(report.sealDetails.padesLevel).toBe('B_T');
    expect(report.sealDetails.tsaProvider).toBe('DigiCert');
  });

  it('verifies document by hash (Method 2: Hash Match)', async () => {
    mockPrisma.documentSeal.findFirst.mockResolvedValueOnce({
      id: 'seal-1',
      verificationToken: 'GS-7f3a9c2e',
      documentHash: 'a1b2c3d4e5f6',
      status: 'SUCCESS',
      algorithm: 'RSA_2048',
      padesLevel: 'B_T',
      tsaUrl: 'http://timestamp.digicert.com',
      tsaTimestamp: new Date(),
      createdAt: new Date(),
      metadata: {},
      agreement: {
        title: 'Hash Match Doc',
        completedAt: new Date(),
        organisation: { name: 'Acme Corp' },
        recipients: [],
      },
      certificate: { status: 'ACTIVE' },
    });

    const report = await verificationService.verifyByHash('sha256:a1b2c3d4e5f6');

    expect(report.isValid).toBe(true);
    expect(report.verificationToken).toBe('GS-7f3a9c2e');
  });

  it('generates Certificate of Authenticity details', async () => {
    mockPrisma.documentSeal.findUnique.mockResolvedValueOnce({
      id: 'seal-1',
      verificationToken: 'GS-7f3a9c2e',
      documentHash: 'a1b2c3d4e5f6',
      status: 'SUCCESS',
      algorithm: 'RSA_2048',
      padesLevel: 'B_T',
      tsaUrl: null,
      tsaTimestamp: null,
      createdAt: new Date(),
      metadata: {},
      agreement: {
        title: 'NDA',
        completedAt: new Date(),
        organisation: { name: 'Acme' },
        recipients: [],
      },
      certificate: { status: 'ACTIVE' },
    });

    const cert = await verificationService.generateVerificationCertificate('GS-7f3a9c2e');

    expect(cert.certificateTitle).toBe('Certificate of Cryptographic Authenticity');
    expect(cert.verificationReport.isValid).toBe(true);
    expect(cert.issuedAt).toBeDefined();
  });
});
