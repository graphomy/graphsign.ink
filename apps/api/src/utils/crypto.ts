import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';

/**
 * Generates a UUID v7 (time-ordered) identifier.
 * Required by database.md — never use auto-increment.
 */
export function generateId(): string {
  return uuidv7();
}

/**
 * Hashes a password using argon2id.
 * argon2id is the recommended variant: memory-hard, side-channel resistant.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verifies a password against an argon2id hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * Generates a cryptographically secure random token (hex-encoded).
 */
export function generateToken(bytes: number = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Hashes a token with SHA-256 for safe database storage.
 * Raw tokens are never stored — only their hashes.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Computes SHA-256 hash of arbitrary data for audit log chain.
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}
