import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerificationService } from './verification-service.js';
import { PDFDocument } from 'pdf-lib';
import { PdfSignerEngine } from './pdf-signer-engine.js';

describe('VerificationService Unit Tests (INK-17, INK-135, INK-137, INK-139)', () => {
  let verificationService: VerificationService;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(() => {
    mockPrisma = {
      documentSeal: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      agreement: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      signingCertificate: {
        findUnique: vi.fn(),
      },
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue({}),
    };

    verificationService = new VerificationService(
      mockPrisma as any,
      undefined,
      undefined,
      mockAudit as any,
    );
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
          {
            role: 'signer',
            status: 'SIGNED',
            name: 'Alice',
            email: 'alice@acme.com',
            signedAt: new Date(),
          },
          {
            role: 'signer',
            status: 'SIGNED',
            name: 'Bob',
            email: 'bob@acme.com',
            signedAt: new Date(),
          },
        ],
      },
      certificate: {
        subjectDn: 'CN=Acme Sign',
        issuerDn: 'CN=Acme Sign',
        status: 'ACTIVE',
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2027-01-01'),
      },
    });

    const report = await verificationService.verifyByToken('GS-7f3a9c2e');

    expect(report.isValid).toBe(true);
    expect(report.status).toBe('VALID');
    expect(report.documentTitle).toBe('Service Level Agreement');
    expect(report.totalSigners).toBe(2);
    expect(report.signedSigners).toBe(2);
    expect(report.signerDetails?.name).toBe('Alice');
    expect(mockAudit.log).toHaveBeenCalled();
  });

  it('CORRECTNESS FIX: completed agreement with NO seal returns UNSIGNED instead of synthesized valid seal', async () => {
    // Agreement is completed, but has no documentSeals
    mockPrisma.agreement.findFirst.mockResolvedValueOnce({
      id: '00000000-0000-0000-0000-000000000001',
      organisationId: '00000000-0000-0000-0000-000000000099',
      title: 'Unsealed Contract',
      status: 'COMPLETED',
      completedAt: new Date(),
      recipients: [{ role: 'signer', status: 'SIGNED' }],
      documentSeals: [],
    });

    const report = await verificationService.verifyByToken('00000000-0000-0000-0000-000000000001');

    expect(report.isValid).toBe(false);
    expect(report.status).toBe('UNSIGNED');
    expect(report.message).toBe('Error: No cryptographic seal found for this document.');
  });

  it('CORRECTNESS FIX: uploaded file containing token but altered content returns TAMPERED', async () => {
    // DB has seal for GS-7f3a9c2e with documentHash 'hash-original'
    mockPrisma.documentSeal.findUnique.mockResolvedValueOnce({
      id: 'seal-1',
      verificationToken: 'GS-7f3a9c2e',
      documentHash: 'original-hash-matching-unmodified-document',
      status: 'SUCCESS',
      algorithm: 'RSA_2048',
      padesLevel: 'B_T',
      agreement: {
        title: 'Tampered Contract',
        recipients: [],
      },
      certificate: {
        status: 'ACTIVE',
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2027-01-01'),
      },
      metadata: {},
    });

    // File contains token string 'GS-7f3a9c2e', but modified content produces different hash
    const tamperedPdf = `%PDF-1.7\nTampered malicious content inserted\n%PAdES-B-T-SEAL:GS-7f3a9c2e\n%%EOF`;

    const report = await verificationService.verifyUploadedFile(tamperedPdf);

    expect(report.isValid).toBe(false);
    expect(report.status).toBe('TAMPERED');
    expect(report.message).toBe('Invalid: Document has been altered or signature is corrupted.');
  });

  it('verifies offline signature with embedded certificate (INK-137)', async () => {
    const meta = Buffer.from(
      JSON.stringify({
        verificationToken: 'GS-7f3a9c2e',
        signature: 'c2lnbmF0dXJl',
        certificatePem: '-----BEGIN CERTIFICATE-----\nMIID...fake\n-----END CERTIFICATE-----',
        signerName: 'Offline Auditor',
      }),
    ).toString('base64');

    const signedPdf = `%PDF-1.7\nDocument body\n%PAdES-B-T-SEAL:GS-7f3a9c2e\n%SIG:c2lnbmF0dXJl\n%META:${meta}\n%%EOF`;

    const report = await verificationService.verifyOffline(signedPdf);

    expect(report.isValid).toBe(false);
    expect(report.status).toBe('TAMPERED');
    expect(report.signerDetails?.name).toBe('Offline Auditor');
  });

  it('throws error during offline verification if no public key or certificate is available', async () => {
    const meta = Buffer.from(
      JSON.stringify({
        verificationToken: 'GS-7f3a9c2e',
        signature: 'c2lnbmF0dXJl',
        // No certificatePem provided
      }),
    ).toString('base64');

    const signedPdf = `%PDF-1.7\nDocument body\n%PAdES-B-T-SEAL:GS-7f3a9c2e\n%SIG:c2lnbmF0dXJl\n%META:${meta}\n%%EOF`;

    await expect(verificationService.verifyOffline(signedPdf)).rejects.toThrow(
      'Error: Public key required for offline verification.',
    );
  });

  it('verifies native PDF with /ByteRange and CMS signature in-process and detects tampering', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 400]);
    page.drawText('Sample Legal Agreement Content', { x: 50, y: 350 });
    const baseBytes = await doc.save();

    const signed = await PdfSignerEngine.signPdf({
      pdfBytes: baseBytes,
      certificatePem: '',
      privateKeyPem: '',
      reason: 'Cryptographic Test Signature',
    });

    const report = await verificationService.verifyOffline(signed.signedPdfBytes);
    expect(report.isValid).toBe(true);
    expect(report.status).toBe('VALID');
    expect(report.sealDetails.algorithm).toBe('CMS');
    expect(report.sealDetails.certificateSubject).toBe('Cryptographic Test Signature');

    // Tamper: modify byte in first range (outside signature contents)
    const tamperedBytes = Buffer.from(signed.signedPdfBytes);
    tamperedBytes[10] = tamperedBytes[10] ^ 0xff;

    const tamperedReport = await verificationService.verifyOffline(tamperedBytes);
    expect(tamperedReport.isValid).toBe(false);
    expect(tamperedReport.status).toBe('TAMPERED');
  });
});
