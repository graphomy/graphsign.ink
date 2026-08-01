import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth-service.js';
import type { MailerService } from './mailer-service.js';
import type { AuditService } from './audit-service.js';

// Mock the crypto module
vi.mock('../utils/crypto.js', () => ({
  generateId: vi.fn(() => '00000000-0000-7000-8000-000000000001'),
  hashPassword: vi.fn(
    async () => '$scrypt$32768$8$1$00000000000000000000000000000000$hashed_password',
  ),
  verifyPassword: vi.fn(async (pass: string) => pass === 'Str0ng!Pass'),
  generateToken: vi.fn(() => 'raw-verification-token'),
  hashToken: vi.fn(async () => 'sha256-hashed-token'),
  sha256: vi.fn(async () => 'sha256-hash'),
}));

function createMockPrisma() {
  return {
    organisation: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  } as unknown as Parameters<
    typeof AuthService extends new (...args: infer P) => unknown ? (...args: P) => void : never
  >[0];
}

function createMockMailer(): MailerService {
  return {
    sendVerificationEmail: vi.fn(async () => {}),
    sendPasswordResetEmail: vi.fn(async () => {}),
  };
}

function createMockAudit(): AuditService {
  return {
    log: vi.fn(async () => {}),
  };
}

const DEFAULT_ORG = {
  id: '00000000-0000-7000-8000-000000000099',
  name: 'Default Organisation',
  slug: 'default',
  tenantId: '00000000-0000-7000-8000-000000000099',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('AuthService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let mailer: MailerService;
  let audit: AuditService;
  let authService: AuthService;

  beforeEach(() => {
    prisma = createMockPrisma();
    mailer = createMockMailer();
    audit = createMockAudit();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authService = new AuthService(prisma as any, mailer, audit);

    // Default: org exists
    (prisma.organisation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_ORG);
  });

  describe('register', () => {
    it('should create a user with hashed password and send verification email', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        status: 'pending_verification',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        organisationId: DEFAULT_ORG.id,
      });

      const result = await authService.register({
        email: 'user@example.com',
        password: 'Str0ng!Pass',
      });

      expect(result.id).toBe('00000000-0000-7000-8000-000000000001');
      expect(result.email).toBe('user@example.com');
      expect(result.status).toBe('pending_verification');

      // Verify password was hashed — never stored plain
      const createCall = (prisma.user.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(createCall?.data?.passwordHash).toBe(
        '$scrypt$32768$8$1$00000000000000000000000000000000$hashed_password',
      );
      expect(createCall?.data?.passwordHash).not.toBe('Str0ng!Pass');

      // Verification token hash stored, not raw token
      expect(createCall?.data?.emailVerificationTokenHash).toBe('sha256-hashed-token');

      // Verification email sent
      expect(mailer.sendVerificationEmail).toHaveBeenCalledWith(
        'user@example.com',
        'raw-verification-token',
      );

      // Audit event created
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.registered',
          resourceType: 'user',
        }),
      );
    });

    it('should throw ConflictError when email already exists', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'existing-user-id',
        email: 'user@example.com',
      });

      await expect(
        authService.register({
          email: 'user@example.com',
          password: 'Str0ng!Pass',
        }),
      ).rejects.toThrow('An account with this email already exists.');
    });

    it('should not fail registration if verification email fails to send', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        status: 'pending_verification',
        createdAt: new Date(),
        organisationId: DEFAULT_ORG.id,
      });
      (mailer.sendVerificationEmail as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Email service down'),
      );

      const result = await authService.register({
        email: 'user@example.com',
        password: 'Str0ng!Pass',
      });

      expect(result.id).toBe('00000000-0000-7000-8000-000000000001');
    });

    it('should set user status to pending_verification', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        status: 'pending_verification',
        createdAt: new Date(),
        organisationId: DEFAULT_ORG.id,
      });

      const result = await authService.register({
        email: 'user@example.com',
        password: 'Str0ng!Pass',
      });

      expect(result.status).toBe('pending_verification');
    });

    it('should create default organisation if none exists', async () => {
      (prisma.organisation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.organisation.create as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_ORG);
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        status: 'pending_verification',
        createdAt: new Date(),
        organisationId: DEFAULT_ORG.id,
      });

      await authService.register({
        email: 'user@example.com',
        password: 'Str0ng!Pass',
      });

      expect(prisma.organisation.create).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should authenticate active user with valid password', async () => {
      const user = {
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        passwordHash: '$scrypt$32768$8$1$00000000000000000000000000000000$hashed_password',
        emailVerified: true,
        status: 'active',
        organisationId: DEFAULT_ORG.id,
        deletedAt: null,
      };

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      const result = await authService.login({
        email: 'user@example.com',
        password: 'Str0ng!Pass',
      });

      expect(result.id).toBe('00000000-0000-7000-8000-000000000001');
      expect(result.email).toBe('user@example.com');
      expect(result.status).toBe('active');
      expect(result.token).toBeDefined();
      expect(result.organisationId).toBe(DEFAULT_ORG.id);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.login',
          userId: user.id,
        }),
      );
    });

    it('should throw UnauthorizedError when user does not exist', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'unknown@example.com',
          password: 'Str0ng!Pass',
        }),
      ).rejects.toThrow('Invalid email or password.');
    });

    it('should throw UnauthorizedError on invalid password', async () => {
      const user = {
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        passwordHash: '$scrypt$hash',
        emailVerified: true,
        status: 'active',
        organisationId: DEFAULT_ORG.id,
        deletedAt: null,
      };

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await expect(
        authService.login({
          email: 'user@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow('Invalid email or password.');
    });

    it('should throw UnauthorizedError when email is not verified', async () => {
      const user = {
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        passwordHash: '$scrypt$hash',
        emailVerified: false,
        status: 'pending_verification',
        organisationId: DEFAULT_ORG.id,
        deletedAt: null,
      };

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await expect(
        authService.login({
          email: 'user@example.com',
          password: 'Str0ng!Pass',
        }),
      ).rejects.toThrow('Please verify your email address before logging in.');
    });
  });

  describe('verifyEmail', () => {
    it('should verify email and activate account', async () => {
      const user = {
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        organisationId: DEFAULT_ORG.id,
        emailVerified: false,
        emailVerificationTokenHash: 'sha256-hashed-token',
        emailVerificationTokenExpiresAt: new Date(Date.now() + 86400000),
        status: 'pending_verification',
      };

      (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...user,
        emailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
        status: 'active',
      });

      const result = await authService.verifyEmail('raw-verification-token');

      expect(result.status).toBe('active');
      expect(result.email).toBe('user@example.com');

      // Token should be cleared
      const updateCall = (prisma.user.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(updateCall?.data?.emailVerificationTokenHash).toBeNull();
      expect(updateCall?.data?.emailVerified).toBe(true);

      // Audit event logged
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.email_verified',
        }),
      );
    });

    it('should throw NotFoundError for invalid token', async () => {
      (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(authService.verifyEmail('invalid-token')).rejects.toThrow(
        'Invalid or expired verification token.',
      );
    });

    it('should throw ValidationError for expired token', async () => {
      (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        organisationId: DEFAULT_ORG.id,
        emailVerified: false,
        emailVerificationTokenHash: 'sha256-hashed-token',
        emailVerificationTokenExpiresAt: new Date(Date.now() - 1000),
        status: 'pending_verification',
      });

      await expect(authService.verifyEmail('raw-token')).rejects.toThrow(
        'Verification token has expired.',
      );
    });

    it('should throw ValidationError if email is already verified', async () => {
      (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        organisationId: DEFAULT_ORG.id,
        emailVerified: true,
        emailVerificationTokenHash: 'sha256-hashed-token',
        emailVerificationTokenExpiresAt: new Date(Date.now() + 86400000),
        status: 'active',
      });

      await expect(authService.verifyEmail('raw-token')).rejects.toThrow(
        'Email is already verified.',
      );
    });
  });

  describe('resendVerificationEmail', () => {
    it('should generate new token and resend verification email for unverified user', async () => {
      const user = {
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        organisationId: DEFAULT_ORG.id,
        emailVerified: false,
        status: 'pending_verification',
        deletedAt: null,
      };

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...user,
        emailVerificationTokenHash: 'sha256-hashed-token',
      });

      const result = await authService.resendVerificationEmail('user@example.com');

      expect(result.message).toBe('Verification email resent successfully.');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: user.id },
          data: expect.objectContaining({
            emailVerificationTokenHash: 'sha256-hashed-token',
          }),
        }),
      );
      expect(mailer.sendVerificationEmail).toHaveBeenCalledWith(
        'user@example.com',
        'raw-verification-token',
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.verification_resent',
          resourceId: user.id,
        }),
      );
    });

    it('should throw ValidationError if user email is already verified', async () => {
      const user = {
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        organisationId: DEFAULT_ORG.id,
        emailVerified: true,
        status: 'active',
        deletedAt: null,
      };

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await expect(authService.resendVerificationEmail('user@example.com')).rejects.toThrow(
        'Email is already verified.',
      );
    });

    it('should return success message without failing if user is not found', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await authService.resendVerificationEmail('nonexistent@example.com');

      expect(result.message).toContain('If an account exists');
      expect(mailer.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('requestPasswordReset', () => {
    it('should generate reset token and dispatch password reset email', async () => {
      const user = {
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        organisationId: DEFAULT_ORG.id,
        status: 'active',
        deletedAt: null,
      };

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...user,
        passwordResetTokenHash: 'sha256-hashed-token',
      });

      const result = await authService.requestPasswordReset('user@example.com');

      expect(result.message).toContain('sent successfully');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: user.id },
          data: expect.objectContaining({
            passwordResetTokenHash: 'sha256-hashed-token',
          }),
        }),
      );
      expect(mailer.sendPasswordResetEmail).toHaveBeenCalledWith(
        'user@example.com',
        'raw-verification-token',
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.password_reset_requested',
          resourceId: user.id,
        }),
      );
    });

    it('should return generic success message if user email is not found', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await authService.requestPasswordReset('unknown@example.com');

      expect(result.message).toContain('If an account exists');
      expect(mailer.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should reset user password and clear reset token fields', async () => {
      const user = {
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        organisationId: DEFAULT_ORG.id,
        passwordHash: 'old-hash',
        passwordResetTokenHash: 'sha256-hashed-token',
        passwordResetTokenExpiresAt: new Date(Date.now() + 3600000),
        deletedAt: null,
      };

      (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...user,
        passwordHash: '$scrypt$hashed_password',
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
      });

      const result = await authService.resetPassword('raw-verification-token', 'NewStr0ng!Pass');

      expect(result.message).toContain('Password updated successfully');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: user.id },
          data: expect.objectContaining({
            passwordHash: '$scrypt$32768$8$1$00000000000000000000000000000000$hashed_password',
            passwordResetTokenHash: null,
            passwordResetTokenExpiresAt: null,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.password_reset_completed',
          resourceId: user.id,
        }),
      );
    });

    it('should throw NotFoundError if reset token is invalid', async () => {
      (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(authService.resetPassword('invalid-token', 'NewStr0ng!Pass')).rejects.toThrow(
        'Invalid or expired password reset token.',
      );
    });

    it('should throw ValidationError if reset token is expired', async () => {
      const user = {
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        organisationId: DEFAULT_ORG.id,
        passwordResetTokenHash: 'sha256-hashed-token',
        passwordResetTokenExpiresAt: new Date(Date.now() - 1000),
        deletedAt: null,
      };

      (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      await expect(
        authService.resetPassword('raw-verification-token', 'NewStr0ng!Pass'),
      ).rejects.toThrow('Password reset token has expired.');
    });
  });
});
