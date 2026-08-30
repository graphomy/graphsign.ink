import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPublicVerifyRoutes } from './verify.js';

describe('Public Verification Routes Integration Tests', () => {
  let app: any;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      documentSeal: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'seal-1',
          verificationToken: 'GS-7f3a9c2e',
          documentHash: 'abc123hash',
          status: 'SUCCESS',
          algorithm: 'RSA_2048',
          padesLevel: 'B_T',
          tsaUrl: 'http://timestamp.digicert.com',
          tsaTimestamp: new Date('2026-08-30T10:00:00Z'),
          createdAt: new Date('2026-08-30T10:00:00Z'),
          metadata: { tsaProvider: 'DigiCert' },
          agreement: {
            title: 'Verified Contract',
            completedAt: new Date('2026-08-30T10:00:00Z'),
            organisation: { name: 'Acme Corp' },
            recipients: [
              { role: 'signer', status: 'SIGNED' },
              { role: 'signer', status: 'SIGNED' },
            ],
          },
          certificate: {
            subjectDn: 'CN=Acme Signing',
            issuerDn: 'CN=Acme CA',
            status: 'ACTIVE',
          },
        }),
        findFirst: vi.fn().mockResolvedValue({
          id: 'seal-1',
          verificationToken: 'GS-7f3a9c2e',
          documentHash: 'abc123hash',
          status: 'SUCCESS',
          algorithm: 'RSA_2048',
          padesLevel: 'B_T',
          tsaUrl: null,
          tsaTimestamp: null,
          createdAt: new Date(),
          metadata: {},
          agreement: {
            title: 'Verified Contract',
            completedAt: new Date(),
            organisation: { name: 'Acme Corp' },
            recipients: [],
          },
          certificate: { status: 'ACTIVE' },
        }),
      },
    };

    app = createPublicVerifyRoutes({ prisma: mockPrisma as any });
  });

  it('GET /:token returns public verification report without authentication', async () => {
    const res = await app.request('/GS-7f3a9c2e');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isValid).toBe(true);
    expect(body.status).toBe('VALID');
    expect(body.documentTitle).toBe('Verified Contract');
    expect(body.totalSigners).toBe(2);
    expect(body.signedSigners).toBe(2);
    expect(body.sealDetails.algorithm).toBe('RSA_2048');
  });

  it('POST /hash verifies document by hash without authentication', async () => {
    const res = await app.request('/hash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash: 'abc123hash' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isValid).toBe(true);
  });

  it('GET /:token/certificate returns downloadable Certificate of Authenticity details', async () => {
    const res = await app.request('/GS-7f3a9c2e/certificate');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.certificateTitle).toBe('Certificate of Cryptographic Authenticity');
    expect(body.verificationReport.isValid).toBe(true);
  });
});
