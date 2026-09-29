import { describe, it, expect } from 'vitest';
import { KeyCustodyService } from './key-custody-service.js';

describe('KeyCustodyService (PKCS#11 / Software Key Custody)', () => {
  const service = new KeyCustodyService();

  it('generates RSA-2048 key pairs with valid SPKI and PKCS#8 PEM formats', async () => {
    const keyPair = await service.generateKeyPair('RSA_2048');

    expect(keyPair.keyId).toMatch(/^key_/);
    expect(keyPair.algorithm).toBe('RSA_2048');
    expect(keyPair.publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(keyPair.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');
    expect(keyPair.fingerprint).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/);
  });

  it('generates ECDSA-P256 key pairs with valid PEM formats', async () => {
    const keyPair = await service.generateKeyPair('ECDSA_P256');

    expect(keyPair.keyId).toMatch(/^key_/);
    expect(keyPair.algorithm).toBe('ECDSA_P256');
    expect(keyPair.publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(keyPair.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');
    expect(keyPair.fingerprint).toBeDefined();
  });

  it('generates ECDSA-P384 key pairs', async () => {
    const keyPair = await service.generateKeyPair('ECDSA_P384');

    expect(keyPair.keyId).toBeDefined();
    expect(keyPair.algorithm).toBe('ECDSA_P384');
  });

  it('performs end-to-end cryptographic sign and verify round-trip with RSA', async () => {
    const keyPair = await service.generateKeyPair('RSA_2048');
    const rawData = 'Document content digest for PAdES sealing test';
    const digestBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawData));
    const digestBase64 = service.bytesToBase64(new Uint8Array(digestBuffer));

    const signatureBase64 = await service.signHash({
      keyId: keyPair.keyId,
      privateKeyPem: keyPair.privateKeyPem,
      algorithm: 'RSA_2048',
      hashBase64: digestBase64,
    });

    expect(signatureBase64).toBeDefined();
    expect(signatureBase64.length).toBeGreaterThan(50);

    const isValid = await service.verifySignature(
      keyPair.publicKeyPem,
      'RSA_2048',
      digestBase64,
      signatureBase64,
    );

    expect(isValid).toBe(true);

    // Tampered digest should fail verification
    const tamperedDigest = service.bytesToBase64(new Uint8Array(32).fill(0xff));
    const isTamperedValid = await service.verifySignature(
      keyPair.publicKeyPem,
      'RSA_2048',
      tamperedDigest,
      signatureBase64,
    );

    expect(isTamperedValid).toBe(false);
  });

  it('performs end-to-end cryptographic sign and verify round-trip with ECDSA', async () => {
    const keyPair = await service.generateKeyPair('ECDSA_P256');
    const rawData = 'ECDSA digest test';
    const digestBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawData));
    const digestBase64 = service.bytesToBase64(new Uint8Array(digestBuffer));

    const signatureBase64 = await service.signHash({
      keyId: keyPair.keyId,
      privateKeyPem: keyPair.privateKeyPem,
      algorithm: 'ECDSA_P256',
      hashBase64: digestBase64,
    });

    expect(signatureBase64).toBeDefined();

    const isValid = await service.verifySignature(
      keyPair.publicKeyPem,
      'ECDSA_P256',
      digestBase64,
      signatureBase64,
    );

    expect(isValid).toBe(true);
  });
});
