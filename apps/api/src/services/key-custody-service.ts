import { generateId } from '../utils/crypto.js';
import { BadRequestError } from '../utils/errors.js';

export type KeyAlgorithm = 'RSA_2048' | 'RSA_4096' | 'ECDSA_P256' | 'ECDSA_P384';

export interface GeneratedKeyPair {
  keyId: string;
  algorithm: KeyAlgorithm;
  publicKeyPem: string;
  privateKeyPem: string;
  fingerprint: string;
}

export interface SignHashOptions {
  keyId: string;
  privateKeyPem: string;
  algorithm: KeyAlgorithm;
  hashBase64: string;
  hashAlgorithm?: 'SHA-256' | 'SHA-384' | 'SHA-512';
}

/**
 * Key custody service providing PKCS#11-compatible interface.
 * Uses Web Crypto / Node crypto primitives for software-backed token custody,
 * with clean pluggable abstraction for hardware HSM libraries.
 */
export class KeyCustodyService {
  /**
   * Generates a new cryptographic key pair within the key custody boundary.
   */
  async generateKeyPair(algorithm: KeyAlgorithm = 'RSA_2048'): Promise<GeneratedKeyPair> {
    const keyId = `key_${generateId()}`;

    try {
      if (algorithm.startsWith('RSA')) {
        const modulusLength = algorithm === 'RSA_4096' ? 4096 : 2048;
        const keyPair = (await crypto.subtle.generateKey(
          {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
          },
          true,
          ['sign', 'verify'],
        )) as CryptoKeyPair;

        const publicKeySpki = (await crypto.subtle.exportKey(
          'spki',
          keyPair.publicKey,
        )) as ArrayBuffer;
        const privateKeyPkcs8 = (await crypto.subtle.exportKey(
          'pkcs8',
          keyPair.privateKey,
        )) as ArrayBuffer;

        const publicKeyPem = this.derToPem(publicKeySpki, 'PUBLIC KEY');
        const privateKeyPem = this.derToPem(privateKeyPkcs8, 'PRIVATE KEY');
        const fingerprint = await this.computeFingerprint(publicKeySpki);

        return {
          keyId,
          algorithm,
          publicKeyPem,
          privateKeyPem,
          fingerprint,
        };
      } else if (algorithm.startsWith('ECDSA')) {
        const namedCurve = algorithm === 'ECDSA_P384' ? 'P-384' : 'P-256';
        const keyPair = (await crypto.subtle.generateKey(
          {
            name: 'ECDSA',
            namedCurve,
          },
          true,
          ['sign', 'verify'],
        )) as CryptoKeyPair;

        const publicKeySpki = (await crypto.subtle.exportKey(
          'spki',
          keyPair.publicKey,
        )) as ArrayBuffer;
        const privateKeyPkcs8 = (await crypto.subtle.exportKey(
          'pkcs8',
          keyPair.privateKey,
        )) as ArrayBuffer;

        const publicKeyPem = this.derToPem(publicKeySpki, 'PUBLIC KEY');
        const privateKeyPem = this.derToPem(privateKeyPkcs8, 'PRIVATE KEY');
        const fingerprint = await this.computeFingerprint(publicKeySpki);

        return {
          keyId,
          algorithm,
          publicKeyPem,
          privateKeyPem,
          fingerprint,
        };
      } else {
        throw new BadRequestError(`Unsupported key algorithm: ${algorithm}`);
      }
    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      throw new Error(`Failed to generate cryptographic key pair: ${(error as Error).message}`);
    }
  }

  /**
   * Signs a pre-computed hash or document digest using the designated private key.
   * Returns base64-encoded raw signature bytes.
   */
  async signHash(options: SignHashOptions): Promise<string> {
    const { algorithm, privateKeyPem, hashBase64 } = options;
    const digestBytes = this.base64ToBytes(hashBase64);

    try {
      const privateKeyDer = this.pemToDer(privateKeyPem);

      if (algorithm.startsWith('RSA')) {
        const hashName = options.hashAlgorithm || 'SHA-256';
        const importedKey = await crypto.subtle.importKey(
          'pkcs8',
          privateKeyDer,
          {
            name: 'RSASSA-PKCS1-v1_5',
            hash: hashName,
          },
          false,
          ['sign'],
        );

        // Sign digest bytes directly
        const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', importedKey, digestBytes);

        return this.bytesToBase64(new Uint8Array(signature));
      } else if (algorithm.startsWith('ECDSA')) {
        const namedCurve = algorithm === 'ECDSA_P384' ? 'P-384' : 'P-256';
        const hashName = algorithm === 'ECDSA_P384' ? 'SHA-384' : 'SHA-256';

        const importedKey = await crypto.subtle.importKey(
          'pkcs8',
          privateKeyDer,
          {
            name: 'ECDSA',
            namedCurve,
          },
          false,
          ['sign'],
        );

        const signature = await crypto.subtle.sign(
          {
            name: 'ECDSA',
            hash: hashName,
          },
          importedKey,
          digestBytes,
        );

        return this.bytesToBase64(new Uint8Array(signature));
      } else {
        throw new BadRequestError(`Unsupported algorithm: ${algorithm}`);
      }
    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      throw new Error(`Cryptographic signing operation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Verifies a digital signature against a pre-computed digest and public key.
   */
  async verifySignature(
    publicKeyPem: string,
    algorithm: KeyAlgorithm,
    digestBase64: string,
    signatureBase64: string,
  ): Promise<boolean> {
    try {
      const publicKeyDer = this.pemToDer(publicKeyPem);
      const digestBytes = this.base64ToBytes(digestBase64);
      const signatureBytes = this.base64ToBytes(signatureBase64);

      if (algorithm.startsWith('RSA')) {
        const importedKey = await crypto.subtle.importKey(
          'spki',
          publicKeyDer,
          {
            name: 'RSASSA-PKCS1-v1_5',
            hash: 'SHA-256',
          },
          false,
          ['verify'],
        );

        return await crypto.subtle.verify(
          'RSASSA-PKCS1-v1_5',
          importedKey,
          signatureBytes,
          digestBytes,
        );
      } else if (algorithm.startsWith('ECDSA')) {
        const namedCurve = algorithm === 'ECDSA_P384' ? 'P-384' : 'P-256';
        const hashName = algorithm === 'ECDSA_P384' ? 'SHA-384' : 'SHA-256';

        const importedKey = await crypto.subtle.importKey(
          'spki',
          publicKeyDer,
          {
            name: 'ECDSA',
            namedCurve,
          },
          false,
          ['verify'],
        );

        return await crypto.subtle.verify(
          {
            name: 'ECDSA',
            hash: hashName,
          },
          importedKey,
          signatureBytes,
          digestBytes,
        );
      }

      return false;
    } catch {
      return false;
    }
  }

  /** Converts DER ArrayBuffer to formatted PEM string */
  derToPem(der: ArrayBuffer, type: string): string {
    const base64 = this.bytesToBase64(new Uint8Array(der));
    const lines = base64.match(/.{1,64}/g) || [];
    return `-----BEGIN ${type}-----\n${lines.join('\n')}\n-----END ${type}-----`;
  }

  /** Converts PEM string to DER Uint8Array */
  pemToDer(pem: string): Uint8Array {
    const clean = pem
      .replace(/-----BEGIN [^-]+-----/g, '')
      .replace(/-----END [^-]+-----/g, '')
      .replace(/\s+/g, '');
    return this.base64ToBytes(clean);
  }

  /** Computes SHA-256 fingerprint of DER-encoded public key */
  async computeFingerprint(der: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', der);
    const bytes = new Uint8Array(digest);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(':')
      .toUpperCase();
  }

  bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  }

  base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
