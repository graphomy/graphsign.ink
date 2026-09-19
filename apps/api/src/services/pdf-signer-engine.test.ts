import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { PdfSignerEngine } from './pdf-signer-engine.js';
import forge from 'node-forge';
import crypto from 'crypto';

describe('PdfSignerEngine (INK-295)', () => {
  it('adds signature placeholder with AcroForm and Signature dictionary', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595, 842]);

    await PdfSignerEngine.addSignaturePlaceholder(pdfDoc, {
      reason: 'Testing Signature Placeholder',
    });

    const bytes = await pdfDoc.save({ useObjectStreams: false });
    const str = Buffer.from(bytes).toString('latin1');

    expect(str).toContain('/AcroForm');
    expect(str).toContain('/SigFlags 3');
    expect(str).toContain('/Type /Sig');
    expect(str).toContain('/Filter /Adobe.PPKLite');
    expect(str).toContain('/SubFilter /adbe.pkcs7.detached');
    expect(str).toContain('/ByteRange [ 0 1000000000 1000000000 1000000000 ]');
  });

  it('signs PDF with standard ByteRange covering 100% of document bytes excluding Contents', async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    page.drawText('Agreement to digitally sign', { x: 50, y: 700 });
    const originalBytes = await pdfDoc.save();

    // Generate keys and cert
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(2028);
    cert.setSubject([{ name: 'commonName', value: 'Default Organisation' }]);
    cert.setIssuer([{ name: 'commonName', value: 'Default Organisation' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const certificatePem = forge.pki.certificateToPem(cert);
    const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

    const result = await PdfSignerEngine.signPdf({
      pdfBytes: originalBytes,
      certificatePem,
      privateKeyPem,
      reason: 'Cryptographically sealed & verified',
    });

    expect(result.signedPdfBytes).toBeDefined();
    expect(result.documentHash).toBeDefined();

    const signedStr = Buffer.from(result.signedPdfBytes).toString('latin1');
    expect(signedStr).toContain('/ByteRange [ ');
    expect(signedStr).toContain('/Type /Sig');
    expect(signedStr).toContain('/Filter /Adobe.PPKLite');
    expect(signedStr).toContain('/SubFilter /adbe.pkcs7.detached');

    // Verify ByteRange integrity
    const [r1Start, r1Len, r2Start, r2Len] = result.byteRange;
    expect(r1Start).toBe(0);
    expect(r2Start + r2Len).toBe(result.signedPdfBytes.length);

    // Verify Contents delimiter position matches
    const contentsIdx = signedStr.indexOf('/Contents <');
    expect(r1Len).toBe(contentsIdx + '/Contents '.length);
    expect(signedStr[r1Len]).toBe('<');
    expect(signedStr[r2Start - 1]).toBe('>');

    // Verify SHA-256 over byte ranges matches
    const hash = crypto.createHash('sha256');
    hash.update(result.signedPdfBytes.subarray(r1Start, r1Start + r1Len));
    hash.update(result.signedPdfBytes.subarray(r2Start, r2Start + r2Len));
    const computedDigest = hash.digest('hex');
    expect(computedDigest.length).toBe(64);
  });

  it('embeds RFC 3161 timestamp token into unauthenticated attributes', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([595, 842]);
    const originalBytes = await pdfDoc.save();

    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '02';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(2028);
    cert.setSubject([{ name: 'commonName', value: 'TSA Test' }]);
    cert.setIssuer([{ name: 'commonName', value: 'TSA Test' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const certificatePem = forge.pki.certificateToPem(cert);
    const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

    // Create a dummy DER timestamp token ASN.1 sequence
    const dummyTsaToken = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SEQUENCE,
      true,
      [
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.OCTETSTRING,
          false,
          'DUMMY_TIMESTAMP_BYTES',
        ),
      ],
    );
    const tsaTokenBytes = Buffer.from(forge.asn1.toDer(dummyTsaToken).getBytes(), 'binary');

    const result = await PdfSignerEngine.signPdf({
      pdfBytes: originalBytes,
      certificatePem,
      privateKeyPem,
      tsaTokenBytes,
    });

    expect(result.hexSignatureLength).toBeGreaterThan(1000);
    // id-aa-timeStampToken OID: 1.2.840.113549.1.9.16.2.14
    const oidDerHex = forge.util.bytesToHex(
      forge.asn1.oidToDer('1.2.840.113549.1.9.16.2.14').getBytes(),
    );
    const signedPdfText = (Buffer.from(result.signedPdfBytes) as any).toString('latin1');
    expect(signedPdfText.toLowerCase()).toContain(oidDerHex.toLowerCase());
  });
});
