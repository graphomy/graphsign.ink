import { describe, it, expect, vi } from 'vitest';
import { BatchVerificationService } from './batch-verification-service.js';

describe('BatchVerificationService Unit Tests (INK-136)', () => {
  it('throws error when no documents are selected (empty list)', async () => {
    const mockVerificationService: any = {};
    const service = new BatchVerificationService(mockVerificationService);

    await expect(service.processBatch([])).rejects.toThrow('Error: No documents selected.');
  });

  it('throws error when batch exceeds maximum limit of 100 documents', async () => {
    const mockVerificationService: any = {};
    const service = new BatchVerificationService(mockVerificationService);

    const items = Array.from({ length: 101 }, (_, i) => ({ token: `GS-${i}` }));

    await expect(service.processBatch(items)).rejects.toThrow(
      'Batch verification exceeds maximum limit of 100 documents per job.',
    );
  });

  it('processes batch of documents and returns summary and individual results', async () => {
    const mockVerificationService: any = {
      verifyByToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === 'GS-valid') {
          return {
            isValid: true,
            status: 'VALID',
            verificationToken: 'GS-valid',
            documentTitle: 'Valid Doc',
            documentHash: 'hash-valid',
            completedAt: '2026-09-01T10:00:00Z',
            totalSigners: 1,
            signedSigners: 1,
            signerDetails: { name: 'Alice' },
            sealDetails: {
              algorithm: 'RSA_2048',
              padesLevel: 'B_T',
              tsaUrl: null,
              tsaTimestamp: null,
            },
            organisationName: 'Acme',
            sealedAt: '2026-09-01T10:00:00Z',
          };
        } else {
          return {
            isValid: false,
            status: 'TAMPERED',
            message: 'Invalid: Document has been altered or signature is corrupted.',
            verificationToken: 'GS-tampered',
            documentTitle: 'Tampered Doc',
            documentHash: 'hash-tampered',
            completedAt: null,
            totalSigners: 1,
            signedSigners: 0,
            sealDetails: {
              algorithm: 'RSA_2048',
              padesLevel: 'B_T',
              tsaUrl: null,
              tsaTimestamp: null,
            },
            organisationName: 'Acme',
            sealedAt: '2026-09-01T10:00:00Z',
          };
        }
      }),
    };

    const mockAudit: any = { log: vi.fn().mockResolvedValue({}) };
    const service = new BatchVerificationService(mockVerificationService, mockAudit);

    const batch = await service.processBatch([
      { token: 'GS-valid', filename: 'contract1.pdf' },
      { token: 'GS-tampered', filename: 'contract2.pdf' },
    ]);

    expect(batch.totalDocuments).toBe(2);
    expect(batch.validSignatures).toBe(1);
    expect(batch.invalidSignatures).toBe(1);
    expect(batch.errors).toHaveLength(1);
    expect(batch.errors[0]?.status).toBe('TAMPERED');
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BATCH_VERIFICATION_COMPLETED' }),
    );

    // Test CSV Report Generation
    const csv = service.generateCsvReport(batch);
    expect(csv).toContain('contract1.pdf');
    expect(csv).toContain('contract2.pdf');
    expect(csv).toContain('VALID');
    expect(csv).toContain('TAMPERED');

    // Test PDF Report Generation
    const pdfBytes = await service.generatePdfReport(batch);
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(100);
  });
});
