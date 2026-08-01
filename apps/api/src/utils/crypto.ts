import { v7 as uuidv7 } from 'uuid';
import { scrypt as scryptAsync } from 'scrypt-js';

/**
 * Scrypt parameters — OWASP-recommended for password hashing.
 * N=32768 (2^15), r=8, p=1, keyLen=32 bytes.
 */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LEN = 32;

/**
 * Generates a UUID v7 (time-ordered) identifier.
 * Required by database.md — never use auto-increment.
 */
export function generateId(): string {
  return uuidv7();
}

/**
 * Hashes a password using scrypt (memory-hard, OWASP-approved).
 * Stores in self-describing format: $scrypt$N$r$p$salt$hash
 *
 * Replaces argon2id for Cloudflare Workers compatibility.
 * scrypt-js is a pure-JS implementation that runs in V8 isolates.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordBytes = new TextEncoder().encode(password);

  const derived = await scryptAsync(passwordBytes, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_KEY_LEN);

  return `$scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${toHex(salt)}$${toHex(new Uint8Array(derived))}`;
}

/**
 * Verifies a password against a scrypt hash.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  // Format: $scrypt$N$r$p$salt$hash → ['', 'scrypt', N, r, p, salt, hash]
  if (parts.length !== 7 || parts[1] !== 'scrypt') {
    return false;
  }

  const n = parseInt(parts[2]!, 10);
  const r = parseInt(parts[3]!, 10);
  const p = parseInt(parts[4]!, 10);
  const salt = fromHex(parts[5]!);
  const expectedHash = fromHex(parts[6]!);

  const passwordBytes = new TextEncoder().encode(password);
  const derived = await scryptAsync(passwordBytes, salt, n, r, p, expectedHash.length);

  return timingSafeEqual(new Uint8Array(derived), expectedHash);
}

/**
 * Generates a cryptographically secure random token (hex-encoded).
 * Uses Web Crypto API (globally available in Workers).
 */
export function generateToken(bytes: number = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return toHex(buf);
}

/**
 * Hashes a token with SHA-256 for safe database storage.
 * Raw tokens are never stored — only their hashes.
 *
 * Now async — Web Crypto's digest is promise-based.
 */
export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(hash));
}

/**
 * Computes SHA-256 hash of arbitrary data for audit log chain.
 *
 * Now async — Web Crypto's digest is promise-based.
 */
export async function sha256(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return toHex(new Uint8Array(hash));
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Converts a Uint8Array to a hex string. */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Converts a hex string to a Uint8Array. */
function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Constant-time comparison to prevent timing attacks.
 * Returns true only if both arrays have equal length and content.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
}
