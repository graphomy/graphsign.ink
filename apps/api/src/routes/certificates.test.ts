import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCertificateRoutes } from './certificates.js';
import { signJwt } from '../utils/jwt.js';

describe('Certificate Routes Integration Tests (FR-012.001 & FR-012.002)', () => {
  let app: any;
  let token: string;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(async () => {
    token = await signJwt({
      sub: 'usr-123',
      email: 'admin@acme.com',
      orgId: 'org-123',
      role: 'org_admin',
    });

    mockPrisma = {
      organisation: {
        findUnique: vi.fn().mockResolvedValue({ id: 'org-123', name: 'Acme Corp' }),
      },
      signingCertificate: {
        count: vi.fn().mockResolvedValue(0),
        create: vi
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve({ id: 'cert-new', ...data })),
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'cert-1', name: 'Cert 1', isDefault: true, status: 'ACTIVE' }]),
        findFirst: vi.fn().mockResolvedValue({
          id: 'cert-1',
          name: 'Cert 1',
          organisationId: 'org-123',
          isDefault: true,
          status: 'ACTIVE',
        }),
        update: vi.fn().mockResolvedValue({ id: 'cert-1', isDefault: true }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue({}),
    };

    app = createCertificateRoutes({
      prisma: mockPrisma as any,
      audit: mockAudit as any,
    });
  });

  it('GET / lists organisation certificates', async () => {
    const res = await app.request('/', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('Cert 1');
  });

  it('POST /generate creates a self-signed X.509 certificate', async () => {
    const res = await app.request('/generate', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'New Self-Signed Cert',
        algorithm: 'RSA_2048',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.certificate.name).toBe('New Self-Signed Cert');
    expect(body.certificate.type).toBe('SELF_SIGNED');
  });

  it('POST /upload imports BYO certificate', async () => {
    const res = await app.request('/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'AATL Partner Cert',
        certificatePem: '-----BEGIN CERTIFICATE-----\nTEST_DATA\n-----END CERTIFICATE-----',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('AATL Partner Cert');
    expect(body.type).toBe('BYO');
  });

  it('PUT /:id/default sets default certificate', async () => {
    const res = await app.request('/cert-1/default', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
  });

  it('DELETE /:id revokes certificate', async () => {
    const res = await app.request('/cert-1', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
  });
});
