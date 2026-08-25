import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createSignRoutes } from './sign.js';
import { errorHandler } from '../middleware/error-handler.js';

describe('Sign Route Integration Tests (Public Signer Endpoints)', () => {
  let app: Hono;
  let mockWorkflowService: any;

  beforeEach(() => {
    mockWorkflowService = {
      getPublicSigningSession: vi.fn().mockResolvedValue({
        recipient: { id: 'r-1', name: 'Signer One', email: 'signer@example.com', role: 'signer' },
        agreement: { id: 'ag-1', title: 'NDA Agreement', status: 'SENT' },
        isTurn: true,
      }),
      trackRecipientView: vi.fn().mockResolvedValue({ success: true }),
      submitRecipientSignature: vi.fn().mockResolvedValue({
        success: true,
        isCompleted: true,
      }),
      declineRecipientSignature: vi.fn().mockResolvedValue({ success: true }),
    };

    app = new Hono();
    app.onError(errorHandler);
    app.route(
      '/api/v1/sign',
      createSignRoutes({
        workflowService: mockWorkflowService,
      }),
    );
  });

  it('GET /api/v1/sign/:token returns signer session', async () => {
    const res = await app.request('/api/v1/sign/token-123', {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.agreement.title).toBe('NDA Agreement');
    expect(mockWorkflowService.getPublicSigningSession).toHaveBeenCalledWith('token-123');
  });

  it('POST /api/v1/sign/:token/view marks document as viewed', async () => {
    const res = await app.request('/api/v1/sign/token-123/view', {
      method: 'POST',
      headers: {
        'x-forwarded-for': '127.0.0.1',
        'user-agent': 'vitest-browser',
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(mockWorkflowService.trackRecipientView).toHaveBeenCalledWith(
      'token-123',
      '127.0.0.1',
      'vitest-browser',
    );
  });

  it('POST /api/v1/sign/:token/complete completes signing', async () => {
    const res = await app.request('/api/v1/sign/token-123/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fieldsData: { 'field-1': 'Jane Doe' },
        signatureData: {
          type: 'DRAWN',
          data: 'data:image/png;base64,...',
          consentGiven: true,
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.isCompleted).toBe(true);
    expect(mockWorkflowService.submitRecipientSignature).toHaveBeenCalled();
  });

  it('POST /api/v1/sign/:token/decline records decline', async () => {
    const res = await app.request('/api/v1/sign/token-123/decline', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '127.0.0.1',
        'user-agent': 'vitest-browser',
      },
      body: JSON.stringify({
        reason: 'Price does not match quote.',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(mockWorkflowService.declineRecipientSignature).toHaveBeenCalledWith(
      'token-123',
      { reason: 'Price does not match quote.' },
      '127.0.0.1',
      'vitest-browser',
    );
  });

  it('POST /api/v1/sign/:token/consent records electronic consent (INK-99)', async () => {
    mockWorkflowService.recordElectronicConsent = vi.fn().mockResolvedValue({
      success: true,
      consentTimestamp: new Date().toISOString(),
      ersdVersion: 'v1.0',
    });

    const res = await app.request('/api/v1/sign/token-123/consent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '127.0.0.1',
        'user-agent': 'vitest-browser',
      },
      body: JSON.stringify({
        consentGiven: true,
        ersdVersion: 'v1.0',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(mockWorkflowService.recordElectronicConsent).toHaveBeenCalledWith(
      'token-123',
      { consentGiven: true, ersdVersion: 'v1.0' },
      '127.0.0.1',
      'vitest-browser',
    );
  });

  it('GET /api/v1/sign/:token/download downloads markdown document (INK-105)', async () => {
    mockWorkflowService.getSigningDocumentFile = vi.fn().mockResolvedValue({
      id: 'ag-1',
      title: 'Sales Agreement',
      fileName: 'sales-agreement.pdf',
      markdownContent: '# Sales Agreement\nTerms here...',
      status: 'SENT',
    });

    const res = await app.request('/api/v1/sign/token-123/download', {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('# Sales Agreement');
    expect(res.headers.get('Content-Disposition')).toContain('sales-agreement.md');
  });

  it('GET /api/v1/sign/:token/download streams PDF binary (INK-105)', async () => {
    const fakeBase64 = Buffer.from('%PDF-1.4 simulated pdf content').toString('base64');
    mockWorkflowService.getSigningDocumentFile = vi.fn().mockResolvedValue({
      id: 'ag-1',
      title: 'Contract PDF',
      fileName: 'contract.pdf',
      mimeType: 'application/pdf',
      fileData: fakeBase64,
      status: 'COMPLETED',
    });

    const res = await app.request('/api/v1/sign/token-123/download', {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('contract.pdf');
  });
});
