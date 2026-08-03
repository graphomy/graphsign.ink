import { describe, it, expect } from 'vitest';
import {
  generateBase32Secret,
  base32ToBytes,
  generateOtpauthUrl,
  generateTotpToken,
  verifyTotpToken,
  generateQrCodeDataUri,
} from './totp';

describe('totp utilities', () => {
  it('should generate a valid Base32 secret string', () => {
    const secret = generateBase32Secret();
    expect(secret).toBeDefined();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  it('should decode Base32 string into bytes correctly', () => {
    const bytes = base32ToBytes('JBSWY3DPEHPK3PXP');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(10);
  });

  it('should generate a valid otpauth URL', () => {
    const url = generateOtpauthUrl('user@graphsign.ink', 'JBSWY3DPEHPK3PXP');
    expect(url).toContain('otpauth://totp/graphsign.ink%3Auser%40graphsign.ink');
    expect(url).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(url).toContain('issuer=graphsign.ink');
  });

  it('should generate a 6-digit TOTP token', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const token = await generateTotpToken(secret, 30, 6, 1700000000000);
    expect(token).toMatch(/^\d{6}$/);
  });

  it('should verify a valid TOTP token at current time', async () => {
    const secret = generateBase32Secret();
    const now = Date.now();
    const token = await generateTotpToken(secret, 30, 6, now);

    const isValid = await verifyTotpToken(secret, token, 1, now);
    expect(isValid).toBe(true);
  });

  it('should verify TOTP token within clock skew window (30s prior)', async () => {
    const secret = generateBase32Secret();
    const pastTime = Date.now() - 30 * 1000;
    const token = await generateTotpToken(secret, 30, 6, pastTime);

    const isValid = await verifyTotpToken(secret, token, 1, Date.now());
    expect(isValid).toBe(true);
  });

  it('should reject invalid TOTP token format', async () => {
    const secret = generateBase32Secret();
    expect(await verifyTotpToken(secret, '12345')).toBe(false);
    expect(await verifyTotpToken(secret, 'abc123')).toBe(false);
  });

  it('should reject wrong TOTP token', async () => {
    const secret = generateBase32Secret();
    expect(await verifyTotpToken(secret, '000000')).toBe(false);
  });

  it('should generate SVG QR Code Data URI', () => {
    const uri = generateQrCodeDataUri('otpauth://totp/graphsign');
    expect(uri).toContain('data:image/svg+xml;utf8');
  });
});
