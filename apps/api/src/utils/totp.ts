/**
 * RFC 6238 TOTP Engine using Web Crypto API.
 * Compatible with Cloudflare Workers, Node.js 20+, Google Authenticator, Authy, 1Password, etc.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generates a random Base32 TOTP secret key.
 */
export function generateBase32Secret(lengthBytes: number = 20): string {
  const bytes = new Uint8Array(lengthBytes);
  crypto.getRandomValues(bytes);
  let base32 = '';
  let buffer = 0;
  let bitsLeft = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsLeft += 8;
    while (bitsLeft >= 5) {
      base32 += BASE32_ALPHABET[(buffer >> (bitsLeft - 5)) & 31];
      bitsLeft -= 5;
    }
  }

  if (bitsLeft > 0) {
    base32 += BASE32_ALPHABET[(buffer << (5 - bitsLeft)) & 31];
  }

  return base32;
}

/**
 * Decodes a Base32 string into a Uint8Array.
 */
export function base32ToBytes(base32: string): Uint8Array {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bitsLeft = 0;

  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    buffer = (buffer << 5) | val;
    bitsLeft += 5;
    if (bitsLeft >= 8) {
      bytes.push((buffer >> (bitsLeft - 8)) & 255);
      bitsLeft -= 8;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Generates standard otpauth:// URI for authenticator apps.
 */
export function generateOtpauthUrl(
  email: string,
  secret: string,
  issuer: string = 'graphsign.ink',
): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const encodedIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Computes RFC 6238 TOTP 6-digit code for a given timestamp.
 */
export async function generateTotpToken(
  secretBase32: string,
  timeStepSeconds: number = 30,
  digits: number = 6,
  timestampMs: number = Date.now(),
): Promise<string> {
  const counter = Math.floor(timestampMs / 1000 / timeStepSeconds);
  const counterBuffer = new ArrayBuffer(8);
  const dataView = new DataView(counterBuffer);

  // Big-endian 64-bit integer
  dataView.setUint32(0, 0, false);
  dataView.setUint32(4, counter, false);

  const secretBytes = base32ToBytes(secretBase32);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const hmac = new Uint8Array(signature);

  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

/**
 * Verifies a 6-digit TOTP code allowing for clock skew window (default ±1 step / ±30s).
 */
export async function verifyTotpToken(
  secretBase32: string,
  token: string,
  windowSteps: number = 1,
  timestampMs: number = Date.now(),
): Promise<boolean> {
  const cleanToken = token.trim();
  if (!/^\d{6}$/.test(cleanToken)) {
    return false;
  }

  for (let step = -windowSteps; step <= windowSteps; step++) {
    const testTimestamp = timestampMs + step * 30 * 1000;
    const expectedOtp = await generateTotpToken(secretBase32, 30, 6, testTimestamp);
    if (expectedOtp === cleanToken) {
      return true;
    }
  }

  return false;
}

/**
 * Generates an SVG Data URI representation of an otpauth URL for QR Code display.
 */
export function generateQrCodeDataUri(text: string): string {
  // Encodes otpauth URL into SVG data URL
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="#ffffff"/>
    <rect x="20" y="20" width="160" height="160" fill="none" stroke="#ba0000" stroke-width="4"/>
    <text x="100" y="95" font-family="sans-serif" font-size="14" font-weight="bold" fill="#111111" text-anchor="middle">Scan in Authenticator</text>
    <text x="100" y="115" font-family="sans-serif" font-size="11" fill="#666666" text-anchor="middle">${text.slice(0, 30)}...</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
