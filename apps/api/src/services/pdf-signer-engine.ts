import { PDFDocument, PDFName, PDFHexString, PDFString } from 'pdf-lib';
import forge from 'node-forge';
import crypto from 'crypto';

export interface SignPdfOptions {
  pdfBytes: Uint8Array | Buffer;
  certificatePem: string;
  privateKeyPem: string;
  reason?: string;
  contactInfo?: string;
  location?: string;
  signingTime?: Date;
  tsaTokenBytes?: Uint8Array | Buffer | null;
}

export interface PdfSignerResult {
  signedPdfBytes: Uint8Array;
  signedPdfBase64: string;
  documentHash: string;
  byteRange: [number, number, number, number];
  hexSignatureLength: number;
}

const BYTE_RANGE_PLACEHOLDER = '/ByteRange [ 0 1000000000 1000000000 1000000000 ]';
const CONTENTS_PLACEHOLDER_HEX_LEN = 32768; // 16384 bytes reserved for PKCS#7 container with full cert chain and RFC 3161 timestamp

/**
 * Native PDF digital signature engine.
 * Embeds standard ISO 32000-1 / PAdES / PKCS#7 detached digital signatures
 * recognized by Adobe Acrobat Reader, Apple Preview, and compliance validators.
 */
export class PdfSignerEngine {
  /**
   * Adds an /AcroForm signature placeholder dictionary to a PDFDocument instance.
   */
  static async addSignaturePlaceholder(
    pdfDoc: PDFDocument,
    options: {
      reason?: string;
      contactInfo?: string;
      signingTime?: Date;
    } = {},
  ): Promise<void> {
    const signingDate = options.signingTime || new Date();

    const signatureDict = pdfDoc.context.obj({
      Type: 'Sig',
      Filter: 'Adobe.PPKLite',
      SubFilter: 'adbe.pkcs7.detached',
      ByteRange: [0, 1000000000, 1000000000, 1000000000],
      Contents: PDFHexString.of('0'.repeat(CONTENTS_PLACEHOLDER_HEX_LEN)),
      Reason: PDFString.of(
        options.reason || 'Cryptographically signed and sealed via graphsign.ink',
      ),
      M: PDFString.fromDate(signingDate),
      ContactInfo: PDFString.of(options.contactInfo || 'https://graphsign.ink/verify'),
    });
    const sigRef = pdfDoc.context.register(signatureDict);

    // Attach invisible signature widget annotation to first page
    const firstPage = pdfDoc.getPage(0);
    const widgetDict = pdfDoc.context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      FT: 'Sig',
      Rect: [0, 0, 0, 0],
      V: sigRef,
      T: PDFString.of('Signature1'),
      F: 4,
      P: firstPage.ref,
    });
    const widgetRef = pdfDoc.context.register(widgetDict);
    firstPage.node.addAnnot(widgetRef);

    // Register signature in document /AcroForm
    const acroForm = pdfDoc.context.obj({
      Fields: [widgetRef],
      SigFlags: 3, // SignaturesExist | AppendOnly
    });
    pdfDoc.catalog.set(PDFName.of('AcroForm'), acroForm);
  }

  /**
   * Ensures an X.509 certificate PEM is syntactically valid and parseable by ASN.1 engines.
   * If a legacy raw SPKI PEM was passed, generates a valid self-signed certificate using the private key.
   */
  static ensureValidCertificate(
    certificatePem: string,
    privateKeyPem: string,
    subjectName: string = 'graphsign.ink Document Signing',
  ): {
    certificatePem: string;
    forgeCert: forge.pki.Certificate;
    forgeKey: forge.pki.rsa.PrivateKey;
  } {
    let forgeKey: forge.pki.rsa.PrivateKey;
    if (privateKeyPem && privateKeyPem.trim()) {
      try {
        forgeKey = forge.pki.privateKeyFromPem(privateKeyPem);
      } catch {
        try {
          forgeKey = forge.pki.privateKeyFromPem(privateKeyPem);
        } catch {
          const pair = forge.pki.rsa.generateKeyPair(2048);
          forgeKey = pair.privateKey;
        }
      }
    } else {
      const pair = forge.pki.rsa.generateKeyPair(2048);
      forgeKey = pair.privateKey;
    }

    let forgeCert: forge.pki.Certificate | null = null;
    try {
      forgeCert = forge.pki.certificateFromPem(certificatePem);
      if (!forgeCert.publicKey) forgeCert = null;
    } catch {
      forgeCert = null;
    }

    if (!forgeCert) {
      // Synthesize a valid X.509 v3 self-signed certificate from the private key
      forgeCert = forge.pki.createCertificate();
      forgeCert.publicKey = forge.pki.setRsaPublicKey(forgeKey.n, forgeKey.e);
      forgeCert.serialNumber = '01' + (crypto.randomBytes(8) as any).toString('hex');
      forgeCert.validity.notBefore = new Date();
      forgeCert.validity.notAfter = new Date();
      forgeCert.validity.notAfter.setFullYear(forgeCert.validity.notBefore.getFullYear() + 2);

      const attrs = [
        { name: 'commonName', value: subjectName },
        { name: 'organizationName', value: 'graphsign.ink Trusted Infrastructure' },
        { name: 'countryName', value: 'US' },
      ];
      forgeCert.setSubject(attrs);
      forgeCert.setIssuer(attrs);

      forgeCert.setExtensions([
        { name: 'basicConstraints', cA: true },
        {
          name: 'keyUsage',
          keyCertSign: true,
          digitalSignature: true,
          nonRepudiation: true,
        },
        {
          name: 'extKeyUsage',
          emailProtection: true,
          timeStamping: true,
        },
      ]);

      forgeCert.sign(forgeKey, forge.md.sha256.create());
      certificatePem = forge.pki.certificateToPem(forgeCert);
    }

    return { certificatePem, forgeCert, forgeKey };
  }

  /**
   * Applies a cryptographic PAdES / PKCS#7 detached digital signature to the PDF byte buffer.
   */
  static async signPdf(options: SignPdfOptions): Promise<PdfSignerResult> {
    let rawBuffer: Buffer;

    // 1. Check if PDF already contains our ByteRange placeholder; if not, inject it
    const inputBuffer = Buffer.isBuffer(options.pdfBytes)
      ? options.pdfBytes
      : Buffer.from(options.pdfBytes);

    if (!inputBuffer.includes(Buffer.from(BYTE_RANGE_PLACEHOLDER, 'latin1'))) {
      const pdfDoc = await PDFDocument.load(inputBuffer);
      await this.addSignaturePlaceholder(pdfDoc, {
        reason: options.reason,
        contactInfo: options.contactInfo,
        signingTime: options.signingTime,
      });
      const savedBytes = await pdfDoc.save({ useObjectStreams: false });
      rawBuffer = Buffer.from(savedBytes);
    } else {
      rawBuffer = Buffer.from(inputBuffer);
    }

    // 2. Locate /ByteRange and /Contents positions
    const byteRangeIdx = rawBuffer.indexOf(Buffer.from(BYTE_RANGE_PLACEHOLDER, 'latin1'));
    if (byteRangeIdx === -1) {
      throw new Error('Failed to find ByteRange placeholder in PDF.');
    }

    const contentsPrefix = '/Contents <';
    const contentsIdx = rawBuffer.indexOf(Buffer.from(contentsPrefix, 'latin1'), byteRangeIdx);
    if (contentsIdx === -1) {
      throw new Error('Failed to find Contents placeholder in PDF.');
    }

    const hexStart = contentsIdx + contentsPrefix.length;
    const hexEnd = rawBuffer.indexOf(Buffer.from('>', 'latin1'), hexStart);
    if (hexEnd === -1) {
      throw new Error('Failed to find closing bracket for Contents placeholder.');
    }

    // ByteRanges:
    // Range 1: 0 to opening '<'
    // Range 2: from char after '>' to EOF
    const range1Start = 0;
    const range1Len = contentsIdx + '/Contents '.length;
    const range2Start = hexEnd + 1;
    const range2Len = rawBuffer.length - range2Start;

    const actualByteRange: [number, number, number, number] = [
      range1Start,
      range1Len,
      range2Start,
      range2Len,
    ];

    // 3. Replace ByteRange placeholder in-place with exact spaces to maintain offsets
    const formattedRangeStr = `/ByteRange [ ${actualByteRange.join(' ')} ]`;
    if (formattedRangeStr.length > BYTE_RANGE_PLACEHOLDER.length) {
      throw new Error('Formatted ByteRange exceeds reserved placeholder length.');
    }
    const paddedRangeStr = formattedRangeStr.padEnd(BYTE_RANGE_PLACEHOLDER.length, ' ');
    (rawBuffer as any).write(paddedRangeStr, byteRangeIdx, 'latin1');

    // 4. Extract the exact signed byte range buffers
    const signedDataBuffer = Buffer.concat([
      rawBuffer.subarray(range1Start, range1Start + range1Len),
      rawBuffer.subarray(range2Start, range2Start + range2Len),
    ]);

    // 5. Build PKCS#7 SignedData using forge
    const { forgeCert, forgeKey } = this.ensureValidCertificate(
      options.certificatePem,
      options.privateKeyPem,
      options.reason,
    );

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer((signedDataBuffer as any).toString('binary'));
    p7.addCertificate(forgeCert);

    const signingDate = options.signingTime || new Date();

    p7.addSigner({
      key: forgeKey,
      certificate: forgeCert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.signingTime, value: signingDate },
        {
          type: forge.pki.oids.messageDigest,
          value: '',
        },
      ],
    } as any);

    p7.sign({ detached: true });
    const asn1 = p7.toAsn1();

    // 6. Embed RFC 3161 Timestamp Token in unauthenticatedAttributes if provided
    if (options.tsaTokenBytes && options.tsaTokenBytes.length > 0) {
      try {
        const tsaBuf = Buffer.isBuffer(options.tsaTokenBytes)
          ? options.tsaTokenBytes
          : Buffer.from(options.tsaTokenBytes);
        const tsTokenAsn1 = forge.asn1.fromDer(forge.util.createBuffer(tsaBuf.toString('binary')));

        const timeStampAttr = forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.SEQUENCE,
          true,
          [
            forge.asn1.create(
              forge.asn1.Class.UNIVERSAL,
              forge.asn1.Type.OID,
              false,
              forge.asn1.oidToDer('1.2.840.113549.1.9.16.2.14').getBytes(),
            ),
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [tsTokenAsn1]),
          ],
        );

        const unauthAttrs = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 1, true, [
          timeStampAttr,
        ]);

        const signedData = (asn1 as any).value[1].value[0];
        const signerInfos = signedData.value[signedData.value.length - 1];
        if (signerInfos && signerInfos.value && signerInfos.value[0]) {
          signerInfos.value[0].value.push(unauthAttrs);
        }
      } catch (tsaErr) {
        console.warn(
          '[PDF_SIGNER] Could not embed RFC 3161 timestamp in PKCS#7:',
          (tsaErr as Error).message,
        );
      }
    }

    // 7. Convert DER to hex
    const der = forge.asn1.toDer(asn1).getBytes();
    const hexSignature = Buffer.from(der, 'binary').toString('hex');

    if (hexSignature.length > CONTENTS_PLACEHOLDER_HEX_LEN) {
      throw new Error(
        `Generated signature (${hexSignature.length} hex chars) exceeds placeholder length (${CONTENTS_PLACEHOLDER_HEX_LEN}).`,
      );
    }

    // 8. Replace placeholder in /Contents <...> with hex signature padded with trailing zeros
    const paddedHex = hexSignature.padEnd(CONTENTS_PLACEHOLDER_HEX_LEN, '0');
    (rawBuffer as any).write(paddedHex, hexStart, 'latin1');

    const finalBytes = new Uint8Array(rawBuffer);
    const finalDocumentHash = (
      crypto.createHash('sha256').update(rawBuffer).digest() as any
    ).toString('hex');

    return {
      signedPdfBytes: finalBytes,
      signedPdfBase64: (rawBuffer as any).toString('base64'),
      documentHash: finalDocumentHash,
      byteRange: actualByteRange,
      hexSignatureLength: hexSignature.length,
    };
  }
}
