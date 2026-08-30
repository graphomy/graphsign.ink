import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCscRoutes } from './csc.js';
import { signJwt } from '../utils/jwt.js';

describe('CSC v2.2 Remote Signature API Routes Integration Tests', () => {
  let app: any;
  let token: string;
  let mockPrisma: any;

  beforeEach(async () => {
    token = await signJwt({
      sub: 'usr-123',
      email: 'admin@acme.com',
      orgId: 'org-123',
      role: 'org_admin',
    });

    mockPrisma = {
      signingCertificate: {
        findMany: vi.fn().mockResolvedValue([{ id: 'cert-1', name: 'Cert 1', isDefault: true }]),
        findFirst: vi.fn().mockResolvedValue({
          id: 'cert-1',
          name: 'Cert 1',
          organisationId: 'org-123',
          algorithm: 'RSA_2048',
          status: 'ACTIVE',
          certificatePem: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
          chainPem: null,
          issuerDn: 'CN=Acme CA',
          subjectDn: 'CN=Acme Sign',
          validFrom: new Date(),
          validTo: new Date(),
          pkcs11KeyId: 'key_123',
          padesLevel: 'B_T',
        }),
      },
    };

    app = createCscRoutes({ prisma: mockPrisma as any });
  });

  it('POST /info returns CSC v2.2 capabilities specification', async () => {
    const res = await app.request('/info', { method: 'POST' });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.specs).toBe('2.2.0.0');
    expect(body.methods).toContain('signatures/signHash');
    expect(body.algorithms).toContain('1.2.840.113549.1.1.11');
  });

  it('POST /credentials/list lists tenant signing credentials', async () => {
    const res = await app.request('/credentials/list', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credentialIDs).toContain('cert-1');
  });

  it('POST /credentials/info returns credential certificate chain and key details', async () => {
    const res = await app.request('/credentials/info', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ credentialID: 'cert-1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.description).toBe('Cert 1');
    expect(body.key.algo).toContain('1.2.840.113549.1.1.11');
  });

  it('POST /credentials/authorize issues SAD token', async () => {
    const res = await app.request('/credentials/authorize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ credentialID: 'cert-1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.SAD).toMatch(/^sad_/);
    expect(body.expiresIn).toBe(300);
  });

  it('POST /signatures/signHash produces standard CSC signatures', async () => {
    const res = await app.request('/signatures/signHash', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        credentialID: 'cert-1',
        hash: ['YWJjZGVmMTIzNDU2'],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signatures).toBeDefined();
    expect(body.signatures).toHaveLength(1);
  });

  it('POST /signatures/timestamp issues RFC 3161 timestamp token', async () => {
    const res = await app.request('/signatures/timestamp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash: 'YWJjZGVmMTIzNDU2' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timestamp).toBeDefined();
  });
});
