import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowService } from './workflow-service';

describe('WorkflowService Unit Tests (INK-86 to INK-96)', () => {
  let mockPrisma: any;
  let mockAudit: any;
  let mockMailer: any;
  let service: WorkflowService;

  const mockCtx = {
    userId: 'user-author-1',
    userEmail: 'author@example.com',
    userName: 'Author Alice',
    organisationId: 'org-1',
    role: 'member',
    ipAddress: '127.0.0.1',
    userAgent: 'vitest-agent',
  };

  const mockAgreement = {
    id: 'ag-1',
    title: 'Consulting Contract',
    status: 'DRAFT',
    authorId: 'user-author-1',
    organisationId: 'org-1',
    currentStep: 1,
    signingOrder: 'PARALLEL',
    author: { name: 'Author Alice', email: 'author@example.com' },
    organisation: { name: 'Acme Corp' },
    recipients: [],
  };

  beforeEach(() => {
    mockPrisma = {
      agreement: {
        findFirst: vi.fn().mockResolvedValue({ ...mockAgreement }),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...mockAgreement, ...data })),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'user-rev-1',
          email: 'reviewer@example.com',
          name: 'Reviewer Bob',
        }),
      },
      agreementRecipient: {
        create: vi
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ ...data, id: 'recip-1' })),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'recip-1', ...data })),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    mockMailer = {
      sendReviewRequestEmail: vi.fn().mockResolvedValue(undefined),
      sendReviewDecisionEmail: vi.fn().mockResolvedValue(undefined),
      sendSigningInvitationEmail: vi.fn().mockResolvedValue(undefined),
      sendAgreementCompletedEmail: vi.fn().mockResolvedValue(undefined),
      sendAgreementCancelledEmail: vi.fn().mockResolvedValue(undefined),
    };

    service = new WorkflowService(mockPrisma, mockAudit, mockMailer);
  });

  it('submits agreement for review and dispatches notification (INK-87)', async () => {
    const res = await service.submitForReview(mockCtx, 'ag-1', {
      reviewerEmail: 'reviewer@example.com',
      notes: 'Please review section 4',
    });

    expect(res.status).toBe('IN_REVIEW');
    expect(mockPrisma.agreement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ag-1' },
        data: expect.objectContaining({ status: 'IN_REVIEW' }),
      }),
    );
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AGREEMENT_SUBMITTED_FOR_REVIEW' }),
    );
    expect(mockMailer.sendReviewRequestEmail).toHaveBeenCalledWith(
      'reviewer@example.com',
      'Consulting Contract',
      'Author Alice',
      'Please review section 4',
    );
  });

  it('approves agreement when reviewer approves (INK-88)', async () => {
    mockPrisma.agreement.findFirst.mockResolvedValueOnce({
      ...mockAgreement,
      status: 'IN_REVIEW',
      reviewerId: 'user-rev-1',
    });

    const res = await service.approveAgreement(
      { ...mockCtx, userId: 'user-rev-1', userName: 'Reviewer Bob' },
      'ag-1',
      { decision: 'APPROVE', comments: 'Looks great!' },
    );

    expect(res.status).toBe('APPROVED');
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AGREEMENT_APPROVED' }),
    );
    expect(mockMailer.sendReviewDecisionEmail).toHaveBeenCalledWith(
      'author@example.com',
      'Consulting Contract',
      'Reviewer Bob',
      'APPROVE',
      'Looks great!',
    );
  });

  it('rejects agreement with feedback comments (INK-89)', async () => {
    mockPrisma.agreement.findFirst.mockResolvedValueOnce({
      ...mockAgreement,
      status: 'IN_REVIEW',
      reviewerId: 'user-rev-1',
    });

    const res = await service.rejectAgreement(
      { ...mockCtx, userId: 'user-rev-1', userName: 'Reviewer Bob' },
      'ag-1',
      { decision: 'REJECT', comments: 'Needs indemnification clause.' },
    );

    expect(res.status).toBe('REJECTED');
    expect(res.rejectionReason).toBe('Needs indemnification clause.');
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AGREEMENT_REJECTED' }),
    );
    expect(mockMailer.sendReviewDecisionEmail).toHaveBeenCalledWith(
      'author@example.com',
      'Consulting Contract',
      'Reviewer Bob',
      'REJECT',
      'Needs indemnification clause.',
    );
  });

  it('sends agreement for signature with sequential order routing (INK-90, INK-91)', async () => {
    const res = await service.sendForSignature(mockCtx, 'ag-1', {
      signingOrder: 'SEQUENTIAL',
      recipients: [
        { name: 'Signer 1', email: 's1@example.com', role: 'signer', routingOrder: 1 },
        { name: 'Signer 2', email: 's2@example.com', role: 'signer', routingOrder: 2 },
      ],
    });

    expect(res.agreement.status).toBe('SENT');
    expect(res.agreement.signingOrder).toBe('SEQUENTIAL');
    expect(res.recipients.length).toBe(2);

    // Only Tier 1 recipient invited initially
    expect(mockMailer.sendSigningInvitationEmail).toHaveBeenCalledTimes(1);
    expect(mockMailer.sendSigningInvitationEmail).toHaveBeenCalledWith(
      's1@example.com',
      'Signer 1',
      'Consulting Contract',
      'Author Alice',
      expect.any(String),
      null,
    );
  });

  it('sends agreement for signature with parallel order routing (INK-92)', async () => {
    const res = await service.sendForSignature(mockCtx, 'ag-1', {
      signingOrder: 'PARALLEL',
      recipients: [
        { name: 'Signer 1', email: 's1@example.com', role: 'signer', routingOrder: 1 },
        { name: 'Signer 2', email: 's2@example.com', role: 'signer', routingOrder: 1 },
      ],
    });

    expect(res.agreement.status).toBe('SENT');
    expect(mockMailer.sendSigningInvitationEmail).toHaveBeenCalledTimes(2);
  });

  it('tracks viewed status when recipient opens signing link (INK-93)', async () => {
    mockPrisma.agreementRecipient.findUnique.mockResolvedValueOnce({
      id: 'recip-1',
      agreementId: 'ag-1',
      email: 's1@example.com',
      name: 'Signer 1',
      status: 'INVITED',
      agreement: { organisationId: 'org-1' },
    });

    const res = await service.trackRecipientView('raw-token-1', '1.2.3.4', 'Mozilla/5.0');
    expect(res.success).toBe(true);
    expect(mockPrisma.agreementRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'recip-1' },
        data: expect.objectContaining({ status: 'VIEWED' }),
      }),
    );
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AGREEMENT_VIEWED' }),
    );
  });

  it('submits recipient signature and completes workflow when final signer signs (INK-94, INK-96)', async () => {
    mockPrisma.agreementRecipient.findUnique.mockResolvedValueOnce({
      id: 'recip-1',
      agreementId: 'ag-1',
      email: 's1@example.com',
      name: 'Signer 1',
      status: 'VIEWED',
      agreement: {
        id: 'ag-1',
        title: 'Consulting Contract',
        organisationId: 'org-1',
        status: 'SENT',
        signingOrder: 'PARALLEL',
        author: { name: 'Author Alice', email: 'author@example.com' },
      },
    });

    mockPrisma.agreementRecipient.findMany.mockResolvedValueOnce([
      {
        id: 'recip-1',
        email: 's1@example.com',
        name: 'Signer 1',
        role: 'signer',
        status: 'SIGNED',
      },
    ]);

    const res = await service.submitRecipientSignature(
      'raw-token-1',
      {
        fieldsData: { 'field-1': 'Jane Doe', 'field-2': true },
        signatureData: {
          type: 'DRAWN',
          data: 'data:image/png;base64,signature...',
          consentGiven: true,
        },
      },
      '1.2.3.4',
      'Mozilla/5.0',
    );

    expect(res.success).toBe(true);
    expect(res.isCompleted).toBe(true);
    expect(mockPrisma.agreement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ag-1' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    expect(mockMailer.sendAgreementCompletedEmail).toHaveBeenCalled();
  });

  it('cancels agreement and notifies recipients (INK-95)', async () => {
    mockPrisma.agreement.findFirst.mockResolvedValueOnce({
      ...mockAgreement,
      status: 'SENT',
      recipients: [{ id: 'recip-1', name: 'Signer 1', email: 's1@example.com' }],
    });

    const res = await service.cancelAgreement(mockCtx, 'ag-1', {
      reason: 'Terms updated by client.',
    });

    expect(res.status).toBe('CANCELLED');
    expect(mockMailer.sendAgreementCancelledEmail).toHaveBeenCalledWith(
      's1@example.com',
      'Signer 1',
      'Consulting Contract',
      'Terms updated by client.',
    );
  });
});
