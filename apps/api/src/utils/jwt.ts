/**
 * Web Crypto API HMAC-SHA256 JWT (JSON Web Token) Implementation.
 * Compatible with Cloudflare Workers, Node.js 20+, Edge runtimes.
 */

export interface JwtPayload {
  sub: string;
  orgId: string;
  email: string;
  role: string;
  jti: string;
  iat: number;
  exp: number;
  [key: string]: unknown;
}

function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return base64UrlEncode(binary);
}

/**
 * Resolves JWT secret with strict validation to prevent hardcoded secret vulnerabilities (SEC-01).
 */
export function resolveJwtSecret(secret?: string): string {
  if (secret && secret.trim().length > 0) {
    return secret.trim();
  }
  const envSecret = typeof process !== 'undefined' ? process.env?.JWT_SECRET : undefined;
  if (envSecret && envSecret.trim().length > 0) {
    return envSecret.trim();
  }
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    return 'test_jwt_secret_key_minimum_32_bytes_long!';
  }
  throw new Error('JWT_SECRET configuration is missing in environment bindings.');
}

async function getHmacKey(secret?: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const validSecret = resolveJwtSecret(secret);
  const keyData = encoder.encode(validSecret);
  return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

/**
 * Signs a JWT token with HMAC-SHA256 signature using Web Crypto API.
 */
export async function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'> & { exp?: number; iat?: number },
  secret?: string,
  expiresInSeconds: number = 86400, // 24 hours default
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: JwtPayload = {
    ...payload,
    iat: payload.iat ?? now,
    exp: payload.exp ?? now + expiresInSeconds,
  } as JwtPayload;

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const key = await getHmacKey(secret);
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(dataToSign));
  const encodedSignature = arrayBufferToBase64Url(signatureBuffer);

  return `${dataToSign}.${encodedSignature}`;
}

/**
 * Verifies a JWT token's HMAC-SHA256 signature, format, and expiration.
 */
export async function verifyJwt(token: string, secret?: string): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format: Token must contain 3 parts.');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) {
    throw new Error('Invalid JWT: Missing token components.');
  }

  const dataToVerify = `${encodedHeader}.${encodedPayload}`;
  const key = await getHmacKey(secret);
  const encoder = new TextEncoder();

  // Convert base64url signature back to ArrayBuffer
  const rawSignatureString = base64UrlDecode(signature);
  const signatureBytes = new Uint8Array(rawSignatureString.length);
  for (let i = 0; i < rawSignatureString.length; i++) {
    signatureBytes[i] = rawSignatureString.charCodeAt(i);
  }

  const isValidSignature = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(dataToVerify),
  );

  if (!isValidSignature) {
    throw new Error(
      'Invalid JWT signature: Token signature does not match or has been tampered with.',
    );
  }

  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new Error('Invalid JWT payload: Failed to parse payload JSON.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('JWT token expired.');
  }

  return payload;
}

/**
 * Safely decodes JWT payload without signature verification (useful for inspecting jti).
 */
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}
