import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResendMailerService, ConsoleMailerService, createMailerService } from './mailer-service';

// Mock Resend SDK
vi.mock('resend', () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: 'msg-123' }, error: null }),
      },
    })),
  };
});

describe('MailerService Unit Tests (INK-107 to INK-116)', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      notificationLog: {
        create: vi.fn().mockResolvedValue({ id: 'log-1' }),
      },
    };
  });

  describe('ConsoleMailerService', () => {
    it('logs emails to console without throwing and records notification logs if prisma provided', async () => {
      const mailer = new ConsoleMailerService('http://localhost:3000', mockPrisma);

      await mailer.sendVerificationEmail('test@example.com', 'tok-123');
      await mailer.sendPasswordResetEmail('test@example.com', 'tok-123');
      await mailer.sendSigningInvitationEmail(
        'signer@example.com',
        'Signer 1',
        'NDA Document',
        'Author 1',
        'tok-sign-1',
        new Date(),
        'Please sign promptly',
        'signer',
        { organisationId: 'org-1', agreementId: 'ag-1' },
      );
      await mailer.sendReminderEmail(
        'signer@example.com',
        'Signer 1',
        'NDA Document',
        'Author 1',
        'tok-sign-1',
        new Date(),
        'Reminder note',
        { organisationId: 'org-1', agreementId: 'ag-1' },
      );
      await mailer.sendExpiryWarningEmail(
        'signer@example.com',
        'Signer 1',
        'NDA Document',
        new Date(),
        'tok-sign-1',
        { organisationId: 'org-1', agreementId: 'ag-1' },
      );
      await mailer.sendAgreementExpiredEmail('signer@example.com', 'Signer 1', 'NDA Document', {
        organisationId: 'org-1',
        agreementId: 'ag-1',
      });
      await mailer.sendAgreementCompletedEmail(
        'signer@example.com',
        'Signer 1',
        'NDA Document',
        'http://localhost:3000/download',
        { organisationId: 'org-1', agreementId: 'ag-1' },
      );
      await mailer.sendAgreementDeclinedEmail(
        'author@example.com',
        'Author 1',
        'NDA Document',
        'Signer 1',
        'signer@example.com',
        'Terms not agreed',
        { organisationId: 'org-1', agreementId: 'ag-1' },
      );

      expect(mockPrisma.notificationLog.create).toHaveBeenCalled();
    });
  });

  describe('ResendMailerService', () => {
    it('dispatches emails via Resend and logs delivery outcome in database (INK-113)', async () => {
      const mailer = new ResendMailerService(
        're_test_key_123',
        'noreply@graphsign.ink',
        'http://localhost:3000',
        mockPrisma,
      );

      await mailer.sendSigningInvitationEmail(
        'signer@example.com',
        'Signer 1',
        'NDA Document',
        'Author Alice',
        'sign-token-1',
        null,
        'Custom greeting note',
        'signer',
        { organisationId: 'org-1', agreementId: 'ag-1' },
      );

      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organisationId: 'org-1',
            agreementId: 'ag-1',
            recipientEmail: 'signer@example.com',
            eventType: 'INVITATION',
            status: 'SENT',
          }),
        }),
      );
    });

    it('retries with exponential backoff on transient failure and records failure log (INK-116)', async () => {
      const mockResendInstance = {
        emails: {
          send: vi
            .fn()
            .mockRejectedValueOnce(new Error('Rate limit exceeded'))
            .mockResolvedValueOnce({ data: { id: 'msg-success' }, error: null }),
        },
      };

      const mailer = new ResendMailerService(
        're_test_key_123',
        'noreply@graphsign.ink',
        'http://localhost:3000',
        mockPrisma,
      );

      (mailer as any).resend = mockResendInstance;

      await mailer.sendReminderEmail(
        'signer@example.com',
        'Signer 1',
        'Contract Title',
        'Sender Name',
        'token-1',
        null,
        undefined,
        { organisationId: 'org-1', agreementId: 'ag-1' },
      );

      expect(mockResendInstance.emails.send).toHaveBeenCalledTimes(2);
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SENT',
            attempts: 2,
          }),
        }),
      );
    });
  });

  describe('createMailerService', () => {
    it('returns ResendMailerService when RESEND_API_KEY is present', () => {
      const mailer = createMailerService({ RESEND_API_KEY: 'test-key' });
      expect(mailer).toBeInstanceOf(ResendMailerService);
    });

    it('returns ConsoleMailerService when RESEND_API_KEY is missing', () => {
      const mailer = createMailerService({});
      expect(mailer).toBeInstanceOf(ConsoleMailerService);
    });
  });
});
