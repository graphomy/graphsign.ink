import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSigningRoutes } from './signing.js';
import { signJwt } from '../utils/jwt.js';

describe('Signing Routes Integration Tests (FR-012.004, FR-012.005, INK-132)', () => {
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
      agreement: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'agr-1',
          organisationId: 'org-123',
          title: 'Agreement to Seal',
          markdownContent: '# Content',
          recipients: [],
          author: { name: 'Alice', email: 'alice@acme.com' },
        }),
      },
      signingCertificate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'cert-1',
          organisationId: 'org-123',
          name: 'Default Cert',
          algorithm: 'RSA_2048',
          certificatePem: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
          pkcs11KeyId: 'key_123',
          isDefault: true,
          status: 'ACTIVE',
        }),
      },
      documentSeal: {
        create: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'seal-1', ...data }),
        ),
        findUnique: vi.fn().mockResolvedValue({
          id: 'seal-1',
          verificationToken: 'GS-12345678',
          documentHash: 'abc',
          status: 'SUCCESS',
          algorithm: 'RSA_2048',
          padesLevel: 'B_T',
          tsaUrl: null,
          tsaTimestamp: null,
          createdAt: new Date(),
          metadata: {},
          agreement: {
            title: 'Doc',
            completedAt: new Date(),
            organisation: { name: 'Acme' },
            recipients: [],
          },
          certificate: { status: 'ACTIVE' },
        }),
      },
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue({}),
    };

    app = createSigningRoutes({
      prisma: mockPrisma as any,
      audit: mockAudit as any,
    });
  });

  it('POST /seal/:agreementId applies PAdES seal and generates verification token', async () => {
    const res = await app.request('/seal/agr-1', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('SUCCESS');
    expect(body.verificationToken).toMatch(/^GS-[0-9a-f]{8}$/);
    expect(body.qrCodeDataUrl).toBeDefined();
    expect(body.sealedPdfBase64).toBeDefined();
  });

  it('POST /batch seals multiple agreements', async () => {
    const res = await app.request('/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agreementIds: ['a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002'],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.successfulCount).toBe(2);
  });

  it('POST /verify validates document seal report', async () => {
    const res = await app.request('/verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: 'GS-12345678',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isValid).toBe(true);
    expect(body.documentTitle).toBe('Doc');
  });
});
