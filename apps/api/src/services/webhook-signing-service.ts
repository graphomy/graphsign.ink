/**
 * Webhook Cryptographic Signing Service (INK-159, FR-017.009).
 * Signs UTF-8 payload bytes with HMAC-SHA256 via Web Crypto API.
 */
export class WebhookSigningService {
  /**
   * Generates a secure random 256-bit hexadecimal secret.
   */
  static generateSecret(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  generateSecret(): string {
    return WebhookSigningService.generateSecret();
  }

  /**
   * Computes HMAC-SHA256 signature for exact raw body string.
   */
  static async sign(body: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(body),
    );

    const bytes = new Uint8Array(signatureBuffer);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Alias for sign.
   */
  static async signPayload(body: string, secret: string): Promise<string> {
    return this.sign(body, secret);
  }

  /**
   * Constant-time comparison to prevent timing attacks.
   */
  static constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
      mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
  }

  /**
   * Verifies an incoming signature.
   */
  static async verify(body: string, secret: string, expectedSignatureHeader: string): Promise<boolean> {
    const cleanHeader = expectedSignatureHeader.trim();
    const prefix = 'sha256=';
    const signature = cleanHeader.startsWith(prefix) ? cleanHeader.substring(prefix.length) : cleanHeader;

    const calculated = await this.sign(body, secret);
    return this.constantTimeEqual(calculated, signature);
  }

  /**
   * Alias for verify with (body, signature, secret).
   */
  static async verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
    return this.verify(body, secret, signature);
  }
}
