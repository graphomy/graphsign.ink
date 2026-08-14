import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt, decodeJwt } from './jwt.js';

describe('JWT Utility (Web Crypto HMAC-SHA256)', () => {
  const mockPayload = {
    sub: '00000000-0000-7000-8000-000000000001',
    orgId: '00000000-0000-7000-8000-000000000002',
    email: 'user@example.com',
    role: 'admin',
    jti: 'jwt_jti_12345',
  };

  it('should sign and verify a valid JWT token', async () => {
    const token = await signJwt(mockPayload);
    expect(token).toBeDefined();
    expect(token.split('.')).toHaveLength(3);

    const verified = await verifyJwt(token);
    expect(verified.sub).toBe(mockPayload.sub);
    expect(verified.orgId).toBe(mockPayload.orgId);
    expect(verified.email).toBe(mockPayload.email);
    expect(verified.role).toBe(mockPayload.role);
    expect(verified.jti).toBe(mockPayload.jti);
    expect(verified.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('should decode payload without signature verification using decodeJwt', async () => {
    const token = await signJwt(mockPayload);
    const decoded = decodeJwt(token);

    expect(decoded).not.toBeNull();
    expect(decoded?.sub).toBe(mockPayload.sub);
    expect(decoded?.jti).toBe(mockPayload.jti);
  });

  it('should reject tampered token signatures', async () => {
    const token = await signJwt(mockPayload);
    const parts = token.split('.');

    // Tamper payload
    const tamperedPayload = btoa(JSON.stringify({ ...mockPayload, role: 'superadmin' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    await expect(verifyJwt(tamperedToken)).rejects.toThrow('Invalid JWT signature');
  });

  it('should reject token signed with a different secret', async () => {
    const token = await signJwt(mockPayload, 'secret-1');
    await expect(verifyJwt(token, 'secret-2')).rejects.toThrow('Invalid JWT signature');
  });

  it('should reject expired tokens', async () => {
    const now = Math.floor(Date.now() / 1000);
    const expiredPayload = {
      ...mockPayload,
      iat: now - 3600,
      exp: now - 10, // Expired 10 seconds ago
    };

    const token = await signJwt(expiredPayload);
    await expect(verifyJwt(token)).rejects.toThrow('JWT token expired');
  });
});
