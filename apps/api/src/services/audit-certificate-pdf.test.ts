import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { createAuditCertificatePdf } from './audit-certificate-pdf.js';
import type { PublicVerificationReport } from './verification-service.js';

describe('audit certificate PDF', () => {
  it('creates a real paginated PDF for long document titles and preserves the report status', async () => {
    const report: PublicVerificationReport = {
      isValid: false,
      status: 'UNSUPPORTED',
      verificationToken: 'GS-test',
      documentTitle: 'Long agreement '.repeat(300),
      documentHash: 'a'.repeat(64),
      completedAt: null,
      totalSigners: 0,
      signedSigners: 0,
      sealDetails: { algorithm: 'CMS', padesLevel: 'UNKNOWN', tsaUrl: null, tsaTimestamp: null },
      organisationName: 'Example',
      sealedAt: '',
    };
    const bytes = await createAuditCertificatePdf(report);
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
    expect(report.status).toBe('UNSUPPORTED');
  });
});
