import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { createWorkflowRoutes } from './workflow.js';
import { signJwt } from '../utils/jwt.js';
import { errorHandler } from '../middleware/error-handler.js';

describe('Workflow Route Integration Tests (INK-86 to INK-95)', () => {
  let app: Hono;
  let mockWorkflowService: any;
  let validToken: string;

  const mockUser = {
    id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice Author',
    organisationId: 'org-1',
    role: 'member',
  };

  beforeEach(async () => {
    validToken = await signJwt({
      sub: mockUser.id,
      email: mockUser.email,
      orgId: mockUser.organisationId,
      role: mockUser.role,
      name: mockUser.name,
    });

    mockWorkflowService = {
      submitForReview: vi.fn().mockResolvedValue({ id: 'ag-1', status: 'IN_REVIEW' }),
      approveAgreement: vi.fn().mockResolvedValue({ id: 'ag-1', status: 'APPROVED' }),
      rejectAgreement: vi.fn().mockResolvedValue({ id: 'ag-1', status: 'REJECTED' }),
      sendForSignature: vi.fn().mockResolvedValue({
        agreement: { id: 'ag-1', status: 'SENT' },
        recipients: [{ id: 'r-1', email: 'signer@example.com', status: 'INVITED' }],
      }),
      cancelAgreement: vi.fn().mockResolvedValue({ id: 'ag-1', status: 'CANCELLED' }),
      checkExpiredAgreements: vi.fn().mockResolvedValue({ expiredCount: 2 }),
    };

    const mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ ...mockUser, status: 'active' }),
      },
      organisation: {
        findUnique: vi.fn().mockResolvedValue({ id: 'org-1', status: 'active' }),
      },
    };

    app = new Hono();
    app.onError(errorHandler);
    app.route(
      '/api/v1/agreements',
      createWorkflowRoutes({
        prisma: mockPrisma as any,
        workflowService: mockWorkflowService,
      }),
    );
  });

  it('POST /api/v1/agreements/:id/review/submit submits for review', async () => {
    const res = await app.request('/api/v1/agreements/ag-1/review/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        reviewerEmail: 'reviewer@example.com',
        notes: 'Please check section 2.',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(mockWorkflowService.submitForReview).toHaveBeenCalledWith(
      expect.objectContaining({ userId: mockUser.id }),
      'ag-1',
      expect.objectContaining({ reviewerEmail: 'reviewer@example.com' }),
    );
  });

  it('POST /api/v1/agreements/:id/review/approve approves agreement', async () => {
    const res = await app.request('/api/v1/agreements/ag-1/review/approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ comments: 'All good' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(mockWorkflowService.approveAgreement).toHaveBeenCalled();
  });

  it('POST /api/v1/agreements/:id/review/reject rejects agreement', async () => {
    const res = await app.request('/api/v1/agreements/ag-1/review/reject', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ comments: 'Missing terms' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(mockWorkflowService.rejectAgreement).toHaveBeenCalled();
  });

  it('POST /api/v1/agreements/:id/send sends agreement for signature', async () => {
    const res = await app.request('/api/v1/agreements/ag-1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        signingOrder: 'SEQUENTIAL',
        recipients: [
          { name: 'Signer 1', email: 's1@example.com', role: 'signer', routingOrder: 1 },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(mockWorkflowService.sendForSignature).toHaveBeenCalled();
  });

  it('POST /api/v1/agreements/:id/cancel cancels agreement', async () => {
    const res = await app.request('/api/v1/agreements/ag-1/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({ reason: 'Client requested cancellation.' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(mockWorkflowService.cancelAgreement).toHaveBeenCalled();
  });
});
