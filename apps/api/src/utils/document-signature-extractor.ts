import { sha256 } from './crypto.js';

export type SupportedFormat = 'pdf' | 'docx' | 'html' | 'unknown';

export interface ExtractedSignerDetails {
  name?: string;
  email?: string;
  timestamp?: string;
}

export interface ExtractedSignature {
  format: SupportedFormat;
  hasSignature: boolean;
  verificationToken: string | null;
  signatureBase64: string | null;
  certificatePem: string | null;
  publicKeyPem: string | null;
  algorithm: string | null;
  timestampToken: string | null;
  signerDetails: ExtractedSignerDetails | null;
  signedContentDigest: string | null;
  rawContentBytes: Uint8Array;
}

/**
 * Universal document signature extractor for PDF, DOCX, and HTML files.
 * Extracts embedded cryptographic signatures, certificates, and metadata.
 */
export class DocumentSignatureExtractor {
  /**
   * Identifies format and extracts embedded signature parameters.
   */
  static async extract(fileData: string | Uint8Array): Promise<ExtractedSignature> {
    let rawBytes: Buffer;
    if (typeof fileData === 'string') {
      if (fileData.startsWith('data:')) {
        rawBytes = Buffer.from(fileData.split(',')[1] || '', 'base64');
      } else if (
        !fileData.includes('<') &&
        !fileData.includes('%PDF') &&
        !fileData.includes('\n') &&
        /^[A-Za-z0-9+/=]+$/.test(fileData.trim()) &&
        fileData.trim().length % 4 === 0
      ) {
        rawBytes = Buffer.from(fileData.trim(), 'base64');
      } else {
        rawBytes = Buffer.from(fileData, 'utf-8');
      }
    } else {
      rawBytes = Buffer.from(fileData);
    }

    const rawString = new TextDecoder('utf-8').decode(rawBytes);
    const format = this.detectFormat(rawBytes, rawString);

    switch (format) {
      case 'pdf':
        return this.extractPdfSignature(rawBytes, rawString);
      case 'docx':
        return this.extractDocxSignature(rawBytes, rawString);
      case 'html':
        return this.extractHtmlSignature(rawBytes, rawString);
      default:
        return {
          format: 'unknown',
          hasSignature: false,
          verificationToken: null,
          signatureBase64: null,
          certificatePem: null,
          publicKeyPem: null,
          algorithm: null,
          timestampToken: null,
          signerDetails: null,
          signedContentDigest: null,
          rawContentBytes: new Uint8Array(rawBytes),
        };
    }
  }

  /**
   * Detects the document format using magic bytes and signatures.
   */
  private static detectFormat(bytes: Buffer, text: string): SupportedFormat {
    if (
      bytes.length >= 4 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    ) {
      return 'pdf';
    }
    // ZIP magic bytes: PK\x03\x04
    if (
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04
    ) {
      return 'docx';
    }
    // HTML detection
    const trimmed = text.trimStart().toLowerCase();
    if (
      trimmed.startsWith('<!doctype html') ||
      trimmed.startsWith('<html') ||
      /<head[\s>]|<body[\s>]/.test(trimmed)
    ) {
      return 'html';
    }

    return 'unknown';
  }

  /**
   * Extracts PAdES B-T cryptographic signature trailer from PDF.
   */
  private static async extractPdfSignature(
    bytes: Buffer,
    text: string,
  ): Promise<ExtractedSignature> {
    const tokenMatch = text.match(/%PAdES-B-T-SEAL:\s*([A-Za-z0-9_-]+)/);
    const sigMatch = text.match(/%SIG:\s*([A-Za-z0-9+/=]+)/);
    const tsaMatch = text.match(/%TSA:\s*([A-Za-z0-9+/=]+)/);
    const metaMatch = text.match(/%META:\s*([A-Za-z0-9+/=]+)/);

    // Also look for token pattern in general PDF text (e.g. GS-12345678)
    const genericTokenMatch = text.match(/GS-[0-9a-fA-F]{8}/);

    let verificationToken = tokenMatch?.[1] || genericTokenMatch?.[0] || null;
    let signatureBase64 = sigMatch?.[1] || null;
    let timestampToken = tsaMatch?.[1] || null;
    let certificatePem: string | null = null;
    let algorithm: string | null = null;
    let signerDetails: ExtractedSignerDetails | null = null;

    if (metaMatch?.[1]) {
      try {
        const decoded = JSON.parse(Buffer.from(metaMatch[1], 'base64').toString('utf-8'));
        if (decoded.verificationToken) verificationToken = decoded.verificationToken;
        if (decoded.signature) signatureBase64 = decoded.signature;
        if (decoded.timestampToken) timestampToken = decoded.timestampToken;
        if (decoded.certificatePem) certificatePem = decoded.certificatePem;
        if (decoded.algorithm) algorithm = decoded.algorithm;
        if (decoded.signerName || decoded.signerEmail) {
          signerDetails = {
            name: decoded.signerName,
            email: decoded.signerEmail,
            timestamp: decoded.signingTime,
          };
        }
      } catch {
        // Ignore JSON parse errors in trailer
      }
    }

    // Identify pre-seal byte slice for hash verification
    const sealMarkerIndex = bytes.lastIndexOf(Buffer.from('%PAdES-B-T-SEAL:'));
    let preSealBytes = bytes;
    if (sealMarkerIndex > 0) {
      preSealBytes = bytes.subarray(0, sealMarkerIndex);
    }
    const signedContentDigest = await sha256(new Uint8Array(preSealBytes));

    const hasSignature = !!(tokenMatch || sigMatch || metaMatch);

    return {
      format: 'pdf',
      hasSignature,
      verificationToken,
      signatureBase64,
      certificatePem,
      publicKeyPem: null,
      algorithm: algorithm || 'RSA_2048',
      timestampToken,
      signerDetails,
      signedContentDigest,
      rawContentBytes: new Uint8Array(bytes),
    };
  }

  /**
   * Extracts digital signature from DOCX package or embedded seal comment.
   */
  private static async extractDocxSignature(
    bytes: Buffer,
    text: string,
  ): Promise<ExtractedSignature> {
    const sealCommentMatch = text.match(/GRAPHSIGN-SEAL:([A-Za-z0-9+/=]+)/);
    const tokenMatch = text.match(/GS-[0-9a-fA-F]{8}/);

    let verificationToken = tokenMatch?.[0] || null;
    let signatureBase64: string | null = null;
    let certificatePem: string | null = null;
    let timestampToken: string | null = null;
    let algorithm: string | null = null;
    let signerDetails: ExtractedSignerDetails | null = null;

    if (sealCommentMatch?.[1]) {
      try {
        const decoded = JSON.parse(Buffer.from(sealCommentMatch[1], 'base64').toString('utf-8'));
        if (decoded.verificationToken) verificationToken = decoded.verificationToken;
        if (decoded.signature) signatureBase64 = decoded.signature;
        if (decoded.certificatePem) certificatePem = decoded.certificatePem;
        if (decoded.timestampToken) timestampToken = decoded.timestampToken;
        if (decoded.algorithm) algorithm = decoded.algorithm;
        if (decoded.signerName || decoded.signerEmail) {
          signerDetails = {
            name: decoded.signerName,
            email: decoded.signerEmail,
            timestamp: decoded.signingTime,
          };
        }
      } catch {
        // Ignore metadata parse error
      }
    }

    const signedContentDigest = await sha256(new Uint8Array(bytes));
    const hasSignature = !!(sealCommentMatch || verificationToken);

    return {
      format: 'docx',
      hasSignature,
      verificationToken,
      signatureBase64,
      certificatePem,
      publicKeyPem: null,
      algorithm: algorithm || 'RSA_2048',
      timestampToken,
      signerDetails,
      signedContentDigest,
      rawContentBytes: new Uint8Array(bytes),
    };
  }

  /**
   * Extracts seal metadata and signatures from HTML comment / meta tags.
   */
  private static async extractHtmlSignature(
    bytes: Buffer,
    text: string,
  ): Promise<ExtractedSignature> {
    const commentMatch = text.match(/<!--\s*GRAPHSIGN-SEAL:([A-Za-z0-9+/=]+)\s*-->/);
    const metaMatch = text.match(/<meta\s+name=["']graphsign-seal["']\s+content=["']([^"']+)["']/i);
    const tokenMatch = text.match(/GS-[0-9a-fA-F]{8}/);

    let rawPayload = commentMatch?.[1] || metaMatch?.[1];
    let verificationToken = tokenMatch?.[0] || null;
    let signatureBase64: string | null = null;
    let certificatePem: string | null = null;
    let timestampToken: string | null = null;
    let algorithm: string | null = null;
    let signerDetails: ExtractedSignerDetails | null = null;

    if (rawPayload) {
      try {
        const decoded = JSON.parse(Buffer.from(rawPayload, 'base64').toString('utf-8'));
        if (decoded.verificationToken) verificationToken = decoded.verificationToken;
        if (decoded.signature) signatureBase64 = decoded.signature;
        if (decoded.certificatePem) certificatePem = decoded.certificatePem;
        if (decoded.timestampToken) timestampToken = decoded.timestampToken;
        if (decoded.algorithm) algorithm = decoded.algorithm;
        if (decoded.signerName || decoded.signerEmail) {
          signerDetails = {
            name: decoded.signerName,
            email: decoded.signerEmail,
            timestamp: decoded.signingTime,
          };
        }
      } catch {
        // Ignore JSON decode error
      }
    }

    const signedContentDigest = await sha256(new Uint8Array(bytes));
    const hasSignature = !!(rawPayload || verificationToken);

    return {
      format: 'html',
      hasSignature,
      verificationToken,
      signatureBase64,
      certificatePem,
      publicKeyPem: null,
      algorithm: algorithm || 'RSA_2048',
      timestampToken,
      signerDetails,
      signedContentDigest,
      rawContentBytes: new Uint8Array(bytes),
    };
  }
}
