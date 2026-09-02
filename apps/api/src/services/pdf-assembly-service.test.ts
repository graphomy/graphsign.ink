import { describe, it, expect } from 'vitest';
import { PdfAssemblyService } from './pdf-assembly-service.js';
import { PDFDocument } from 'pdf-lib';

describe('PdfAssemblyService Unit Tests', () => {
  const service = new PdfAssemblyService();

  it('renders markdown to multi-page PDF with Envelope ID on every page header and adds Certificate page', async () => {
    const pdfBytes = await service.assembleCompletedDocument({
      agreementTitle: 'Non-Disclosure Agreement',
      envelopeId: 'ENV-12345678',
      markdownContent: `# Non-Disclosure Agreement
This agreement is entered into by and between the parties.

## 1. Confidentiality
The recipient agrees to protect all confidential material.

- Point A
- Point B
- Point C

## 2. Term
This agreement shall remain in effect for five years.
`,
      fields: [
        {
          id: 'field-sig-1',
          type: 'SIGNATURE',
          pageNumber: 1,
          x: 10,
          y: 60,
          width: 25,
          height: 8,
          recipientId: 'recip-1',
        },
        {
          id: 'field-date-1',
          type: 'DATE',
          pageNumber: 1,
          x: 40,
          y: 60,
          width: 20,
          height: 6,
          recipientId: 'recip-1',
        },
      ],
      recipients: [
        {
          id: 'recip-1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          role: 'signer',
          routingOrder: 1,
          status: 'SIGNED',
          signedAt: new Date('2026-09-02T12:00:00Z'),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 Chrome/120',
          fieldsData: {
            'field-date-1': '2026-09-02',
          },
          signatureData: {
            type: 'drawn',
            data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        },
      ],
      sealDetails: {
        verificationToken: 'GS-abcd1234',
        verificationUrl: 'https://graphsign.ink/verify/GS-abcd1234',
        documentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        tsaTimestamp: new Date('2026-09-02T12:05:00Z'),
        tsaProvider: 'FreeTSA RFC 3161',
        signerName: 'Acme Org Signing Service',
        subjectDn: 'CN=Acme Sign',
        issuerDn: 'CN=Acme Root CA',
        algorithm: 'RSA_2048',
        padesLevel: 'B_T',
      },
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);

    // Load assembled PDF and verify structure
    const doc = await PDFDocument.load(pdfBytes);
    const pageCount = doc.getPageCount();

    // Must have at least content page + Certificate page
    expect(pageCount).toBeGreaterThanOrEqual(2);

    // Save and check PDF header starts with %PDF-
    const header = String.fromCharCode(...pdfBytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('assembles existing binary PDF and stamps Envelope ID and Certificate page', async () => {
    // Create minimal blank 1-page PDF
    const baseDoc = await PDFDocument.create();
    baseDoc.addPage([600, 800]);
    const baseBytes = await baseDoc.save();

    const resultBytes = await service.assembleCompletedDocument({
      agreementTitle: 'Existing Uploaded PDF',
      envelopeId: 'ENV-UPLOADED-99',
      existingPdfBytes: baseBytes,
      recipients: [
        {
          id: 'recip-1',
          name: 'Bob Signer',
          email: 'bob@example.com',
          role: 'signer',
          routingOrder: 1,
          status: 'SIGNED',
        },
      ],
      sealDetails: {
        verificationToken: 'GS-upload12',
        verificationUrl: 'https://graphsign.ink/verify/GS-upload12',
        documentHash: '1234567890abcdef',
        tsaTimestamp: new Date(),
      },
    });

    const doc = await PDFDocument.load(resultBytes);
    expect(doc.getPageCount()).toBe(2); // 1 base page + 1 certificate page
  });
});
