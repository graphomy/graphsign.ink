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
      expect.objectContaining({ reason: 'Price does not match quote.' }),
      '127.0.0.1',
      'vitest-browser',
    );
  });
});
