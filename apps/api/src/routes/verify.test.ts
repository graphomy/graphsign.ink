import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createPublicVerifyRoutes } from './verify.js';
import { errorHandler } from '../middleware/error-handler.js';

describe('Public Verification Routes Integration Tests (INK-17, INK-135, INK-136, INK-137)', () => {
  let app: Hono;
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
              { role: 'signer', status: 'SIGNED', name: 'Alice', email: 'alice@acme.com', signedAt: new Date() },
              { role: 'signer', status: 'SIGNED', name: 'Bob', email: 'bob@acme.com', signedAt: new Date() },
            ],
          },
          certificate: {
            subjectDn: 'CN=Acme Signing',
            issuerDn: 'CN=Acme CA',
            status: 'ACTIVE',
            validFrom: new Date('2026-01-01'),
            validTo: new Date('2027-01-01'),
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
          certificate: { status: 'ACTIVE', validFrom: new Date('2026-01-01'), validTo: new Date('2027-01-01') },
        }),
      },
    };

    const mockKeyCustody = {
      verifySignature: vi.fn().mockResolvedValue(true),
    };

    app = new Hono();
    app.onError(errorHandler);
    app.route(
      '/verify',
      createPublicVerifyRoutes({
        prisma: mockPrisma as any,
        keyCustodyService: mockKeyCustody as any,
      }),
    );
  });

  it('GET /verify/:token returns public verification report without authentication', async () => {
    const res = await app.request('/verify/GS-7f3a9c2e');

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.isValid).toBe(true);
    expect(body.status).toBe('VALID');
    expect(body.documentTitle).toBe('Verified Contract');
    expect(body.totalSigners).toBe(2);
    expect(body.signedSigners).toBe(2);
    expect(body.sealDetails.algorithm).toBe('RSA_2048');
  });

  it('POST /verify/hash verifies document by hash without authentication', async () => {
    const res = await app.request('/verify/hash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash: 'abc123hash' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.isValid).toBe(true);
  });

  it('GET /verify/:token/certificate returns downloadable Certificate of Authenticity details', async () => {
    const res = await app.request('/verify/GS-7f3a9c2e/certificate');

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.certificateTitle).toBe('Certificate of Cryptographic Authenticity');
    expect(body.verificationReport.isValid).toBe(true);
  });

  it('POST /verify/batch executes batch verification up to 100 documents (INK-136)', async () => {
    const res = await app.request('/verify/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { token: 'GS-7f3a9c2e', filename: 'contract_a.pdf' },
          { hash: 'abc123hash', filename: 'contract_b.pdf' },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.totalDocuments).toBe(2);
    expect(body.validSignatures).toBe(2);
    expect(body.results).toHaveLength(2);
  });

  it('POST /verify/batch rejects empty selections with 400 (INK-136 AC)', async () => {
    const res = await app.request('/verify/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error?.message).toContain('Error: No documents selected.');
  });

  it('POST /verify/batch/export generates CSV and PDF reports (INK-136)', async () => {
    // CSV export
    const csvRes = await app.request('/verify/batch/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'csv',
        items: [{ token: 'GS-7f3a9c2e', filename: 'contract_a.pdf' }],
      }),
    });

    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('Content-Type')).toContain('text/csv');
    const csvText = await csvRes.text();
    expect(csvText).toContain('contract_a.pdf');
    expect(csvText).toContain('GS-7f3a9c2e');

    // PDF export
    const pdfRes = await app.request('/verify/batch/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'pdf',
        items: [{ token: 'GS-7f3a9c2e', filename: 'contract_a.pdf' }],
      }),
    });

    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get('Content-Type')).toBe('application/pdf');
    const pdfArrayBuffer = await pdfRes.arrayBuffer();
    expect(pdfArrayBuffer.byteLength).toBeGreaterThan(100);
  });

  it('POST /verify/offline verifies document signature without database access (INK-137)', async () => {
    const meta = Buffer.from(
      JSON.stringify({
        verificationToken: 'GS-7f3a9c2e',
        signature: 'c2lnbmF0dXJl',
        certificatePem: '-----BEGIN CERTIFICATE-----\nMIID...fake\n-----END CERTIFICATE-----',
        signerName: 'Offline User',
      }),
    ).toString('base64');

    const signedPdf = `%PDF-1.7\nDocument body\n%PAdES-B-T-SEAL:GS-7f3a9c2e\n%SIG:c2lnbmF0dXJl\n%META:${meta}\n%%EOF`;

    const res = await app.request('/verify/offline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileData: signedPdf }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.isValid).toBe(true);
    expect(body.status).toBe('VALID');
    expect(body.signerDetails?.name).toBe('Offline User');
  });
});
