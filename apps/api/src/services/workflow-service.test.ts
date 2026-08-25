import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowService } from './workflow-service';

describe('WorkflowService Unit Tests (INK-86 to INK-116)', () => {
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
      notificationLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'notif-1', ...data })),
      },
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    };

    mockMailer = {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
      sendEmailChangeVerificationEmail: vi.fn().mockResolvedValue(undefined),
      sendOrganisationInvitationEmail: vi.fn().mockResolvedValue(undefined),
      sendReviewRequestEmail: vi.fn().mockResolvedValue(undefined),
      sendReviewDecisionEmail: vi.fn().mockResolvedValue(undefined),
      sendSigningInvitationEmail: vi.fn().mockResolvedValue(undefined),
      sendReminderEmail: vi.fn().mockResolvedValue(undefined),
      sendAgreementCompletedEmail: vi.fn().mockResolvedValue(undefined),
      sendAgreementDeclinedEmail: vi.fn().mockResolvedValue(undefined),
      sendAgreementCancelledEmail: vi.fn().mockResolvedValue(undefined),
      sendExpiryWarningEmail: vi.fn().mockResolvedValue(undefined),
      sendAgreementExpiredEmail: vi.fn().mockResolvedValue(undefined),
    };

    service = new WorkflowService(mockPrisma, mockAudit, mockMailer);
  });

  it('submits agreement for review and dispatches notification (INK-87, INK-107)', async () => {
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
      expect.objectContaining({
        organisationId: 'org-1',
        agreementId: 'ag-1',
        eventType: 'REVIEW_REQUEST',
      }),
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
      expect.objectContaining({
        organisationId: 'org-1',
        agreementId: 'ag-1',
        eventType: 'REVIEW_APPROVED',
      }),
    );
  });

  it('rejects agreement with feedback comments (INK-89, INK-110)', async () => {
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
      expect.objectContaining({
        organisationId: 'org-1',
        agreementId: 'ag-1',
        eventType: 'REVIEW_REJECTED',
      }),
    );
  });

  it('sends agreement for signature with custom message & role tracking (INK-107, INK-115)', async () => {
    const res = await service.sendForSignature(mockCtx, 'ag-1', {
      signingOrder: 'SEQUENTIAL',
      message: 'Please review and sign by Friday.',
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
      'Please review and sign by Friday.',
      'signer',
      expect.objectContaining({
        organisationId: 'org-1',
        agreementId: 'ag-1',
        eventType: 'INVITATION',
      }),
    );
  });

  it('tracks viewed status when recipient opens signing link (INK-98)', async () => {
    mockPrisma.agreementRecipient.findUnique.mockResolvedValueOnce({
      id: 'recip-1',
      agreementId: 'ag-1',
      email: 's1@example.com',
      name: 'Signer 1',
      status: 'INVITED',
      agreement: { organisationId: 'org-1' },
    });

    const res = await service.recordRecipientView('raw-token-1', '1.2.3.4', 'Mozilla/5.0');
    expect(res.success).toBe(true);
    expect(mockPrisma.agreementRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'recip-1' },
        data: expect.objectContaining({ viewedAt: expect.any(Date) }),
      }),
    );
  });

  it('submits recipient signature and completes workflow when final signer signs (INK-94, INK-109)', async () => {
    mockPrisma.agreementRecipient.findUnique.mockResolvedValueOnce({
      id: 'recip-1',
      agreementId: 'ag-1',
      email: 's1@example.com',
      name: 'Signer 1',
      status: 'INVITED',
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

  it('declines signature and notifies author with reason (INK-111)', async () => {
    mockPrisma.agreementRecipient.findUnique.mockResolvedValueOnce({
      id: 'recip-1',
      agreementId: 'ag-1',
      email: 's1@example.com',
      name: 'Signer 1',
      agreement: {
        id: 'ag-1',
        title: 'Consulting Contract',
        organisationId: 'org-1',
        author: { name: 'Author Alice', email: 'author@example.com' },
      },
    });

    const res = await service.declineRecipientSignature('raw-token-1', {
      reason: 'Incorrect salary figure.',
    });

    expect(res.success).toBe(true);
    expect(mockPrisma.agreement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ag-1' },
        data: expect.objectContaining({ status: 'DECLINED' }),
      }),
    );
    expect(mockMailer.sendAgreementDeclinedEmail).toHaveBeenCalledWith(
      'author@example.com',
      'Author Alice',
      'Consulting Contract',
      'Signer 1',
      's1@example.com',
      'Incorrect salary figure.',
      expect.objectContaining({
        organisationId: 'org-1',
        agreementId: 'ag-1',
        eventType: 'DECLINED',
      }),
    );
  });

  it('sends manual reminder to active pending signers (INK-108)', async () => {
    mockPrisma.agreement.findFirst.mockResolvedValueOnce({
      ...mockAgreement,
      status: 'SENT',
      recipients: [
        {
          id: 'recip-1',
          name: 'Signer 1',
          email: 's1@example.com',
          status: 'INVITED',
          routingOrder: 1,
        },
      ],
    });

    const res = await service.sendManualReminder(mockCtx, 'ag-1', {
      note: 'Please sign before our meeting.',
    });

    expect(res.success).toBe(true);
    expect(res.remindedCount).toBe(1);
    expect(mockMailer.sendReminderEmail).toHaveBeenCalledWith(
      's1@example.com',
      'Signer 1',
      'Consulting Contract',
      'Author Alice',
      expect.any(String),
      undefined,
      'Please sign before our meeting.',
      expect.objectContaining({
        organisationId: 'org-1',
        agreementId: 'ag-1',
        eventType: 'REMINDER',
      }),
    );
  });

  it('retrieves agreement notification delivery history (INK-113)', async () => {
    mockPrisma.notificationLog.findMany.mockResolvedValueOnce([
      {
        id: 'notif-1',
        recipientEmail: 's1@example.com',
        recipientName: 'Signer 1',
        eventType: 'INVITATION',
        channel: 'EMAIL',
        status: 'SENT',
        providerMessageId: 'resend-123',
        attempts: 1,
        lastError: null,
        sentAt: new Date('2026-08-25T10:00:00Z'),
        createdAt: new Date('2026-08-25T10:00:00Z'),
      },
    ]);

    const res = await service.getAgreementNotificationHistory(mockCtx, 'ag-1');
    expect(res.agreementId).toBe('ag-1');
    expect(res.logs.length).toBe(1);
    expect(res.logs[0]?.status).toBe('SENT');
    expect(res.logs[0]?.providerMessageId).toBe('resend-123');
  });

  it('processes automated expirations and 24h pre-expiry warnings (INK-112)', async () => {
    const expiredDeadline = new Date(Date.now() - 1000 * 60);
    const expiringSoonDeadline = new Date(Date.now() + 1000 * 60 * 60 * 12); // in 12h

    // 1st call: expired agreements
    mockPrisma.agreement.findMany
      .mockResolvedValueOnce([
        {
          id: 'ag-exp-1',
          title: 'Expired Agreement',
          organisationId: 'org-1',
          status: 'SENT',
          expiresAt: expiredDeadline,
          author: { name: 'Author Alice', email: 'author@example.com' },
          recipients: [{ id: 'r1', name: 'Signer 1', email: 's1@example.com', status: 'INVITED' }],
        },
      ])
      // 2nd call: expiring soon agreements
      .mockResolvedValueOnce([
        {
          id: 'ag-warn-1',
          title: 'Expiring Soon Agreement',
          organisationId: 'org-1',
          status: 'SENT',
          expiresAt: expiringSoonDeadline,
          signingOrder: 'PARALLEL',
          author: { name: 'Author Alice', email: 'author@example.com' },
          recipients: [{ id: 'r2', name: 'Signer 2', email: 's2@example.com', status: 'INVITED' }],
        },
      ]);

    const res = await service.processAutomatedRemindersAndExpirations();

    expect(res.expiredCount).toBe(1);
    expect(res.warningCount).toBe(1);
    expect(mockMailer.sendAgreementExpiredEmail).toHaveBeenCalled();
    expect(mockMailer.sendExpiryWarningEmail).toHaveBeenCalled();
  });
});
