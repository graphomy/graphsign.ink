import { describe, it, expect } from 'vitest';
import { DocumentSignatureExtractor } from './document-signature-extractor.js';

describe('DocumentSignatureExtractor Unit Tests (INK-135, INK-137)', () => {
  it('detects and extracts PAdES signature trailer from signed PDF', async () => {
    const meta = Buffer.from(
      JSON.stringify({
        verificationToken: 'GS-7f3a9c2e',
        signature: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...',
        timestampToken: 'MIAGCSqGSIb3DQEHAqCAMIACAQExDz...',
        signerName: 'Alice Signer',
        signerEmail: 'alice@acme.com',
        signingTime: '2026-09-01T12:00:00Z',
      }),
    ).toString('base64');

    const fakePdf = `%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%PAdES-B-T-SEAL:GS-7f3a9c2e\n%SIG:c2lnbmF0dXJl\n%TSA:dGltZXN0YW1w\n%META:${meta}\n%%EOF`;

    const result = await DocumentSignatureExtractor.extract(Buffer.from(fakePdf));

    expect(result.format).toBe('pdf');
    expect(result.hasSignature).toBe(true);
    expect(result.verificationToken).toBe('GS-7f3a9c2e');
    expect(result.signatureBase64).toBe('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...');
    expect(result.signerDetails?.name).toBe('Alice Signer');
    expect(result.signerDetails?.email).toBe('alice@acme.com');
  });

  it('detects and extracts embedded seal from DOCX archive', async () => {
    // DOCX starts with PK\x03\x04
    const header = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const payload = Buffer.from(
      JSON.stringify({
        verificationToken: 'GS-11223344',
        signature: 'c2lnLWRvY3g=',
        signerName: 'Bob Corp',
        signerEmail: 'bob@example.com',
      }),
    ).toString('base64');

    const fakeDocx = Buffer.concat([
      header,
      Buffer.from(`\nword/document.xml\nGRAPHSIGN-SEAL:${payload}\nGS-11223344`),
    ]);

    const result = await DocumentSignatureExtractor.extract(fakeDocx);

    expect(result.format).toBe('docx');
    expect(result.hasSignature).toBe(true);
    expect(result.verificationToken).toBe('GS-11223344');
    expect(result.signatureBase64).toBe('c2lnLWRvY3g=');
    expect(result.signerDetails?.name).toBe('Bob Corp');
  });

  it('detects and extracts embedded seal from signed HTML document', async () => {
    const payload = Buffer.from(
      JSON.stringify({
        verificationToken: 'GS-99887766',
        signature: 'c2lnLWh0bWw=',
        signerName: 'Charlie Admin',
        signerEmail: 'charlie@web.org',
      }),
    ).toString('base64');

    const fakeHtml = `<!DOCTYPE html><html><head><title>Contract</title><!-- GRAPHSIGN-SEAL:${payload} --></head><body><h1>Agreement</h1></body></html>`;

    const result = await DocumentSignatureExtractor.extract(fakeHtml);

    expect(result.format).toBe('html');
    expect(result.hasSignature).toBe(true);
    expect(result.verificationToken).toBe('GS-99887766');
    expect(result.signatureBase64).toBe('c2lnLWh0bWw=');
    expect(result.signerDetails?.name).toBe('Charlie Admin');
  });

  it('handles unknown or unsigned file formats gracefully', async () => {
    const randomBytes = Buffer.from('Plain raw text with no headers');
    const result = await DocumentSignatureExtractor.extract(randomBytes);

    expect(result.format).toBe('unknown');
    expect(result.hasSignature).toBe(false);
    expect(result.verificationToken).toBeNull();
  });
});
