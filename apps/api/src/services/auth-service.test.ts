import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth-service.js';
import type { MailerService } from './mailer-service.js';
import type { AuditService } from './audit-service.js';
import { generateTotpToken } from '../utils/totp.js';

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
      update: vi.fn(),
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
    sendEmailChangeVerificationEmail: vi.fn(async () => {}),
    sendOrganisationInvitationEmail: vi.fn(async () => {}),
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

    it('should throw UnauthorizedError and log user.login_failed when user does not exist', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'unknown@example.com',
          password: 'Str0ng!Pass',
        }),
      ).rejects.toThrow('Invalid email or password.');

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.login_failed',
          metadata: expect.objectContaining({ reason: 'user_not_found' }),
        }),
      );
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

  describe('logout', () => {
    it('should log audit event and return success message when userId is provided', async () => {
      const result = await authService.logout('00000000-0000-7000-8000-000000000001');

      expect(result.message).toBe('Signed out successfully.');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.logout',
          userId: '00000000-0000-7000-8000-000000000001',
        }),
      );
    });

    it('should return success message without audit log if no userId is provided', async () => {
      const result = await authService.logout();

      expect(result.message).toBe('Signed out successfully.');
    });
  });

  describe('mfa toggle', () => {
    it('should log user.mfa_enabled with IP address and user agent', async () => {
      const result = await authService.enableMfa('00000000-0000-7000-8000-000000000001', {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(result.message).toBe('MFA enabled successfully.');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.mfa_enabled',
          userId: '00000000-0000-7000-8000-000000000001',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        }),
      );
    });

    it('should log user.mfa_disabled with IP address and user agent', async () => {
      const result = await authService.disableMfa('00000000-0000-7000-8000-000000000001', {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(result.message).toBe('MFA disabled successfully.');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.mfa_disabled',
          userId: '00000000-0000-7000-8000-000000000001',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        }),
      );
    });
  });

  describe('session settings', () => {
    it('should retrieve session settings for default organisation', async () => {
      (prisma.organisation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...DEFAULT_ORG,
        sessionTimeoutMinutes: 20,
      });

      const settings = await authService.getSessionSettings();
      expect(settings.sessionTimeoutMinutes).toBe(20);
    });

    it('should update organisation session timeout and log audit event', async () => {
      (prisma.organisation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...DEFAULT_ORG,
        sessionTimeoutMinutes: 15,
      });

      (prisma.organisation.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...DEFAULT_ORG,
        sessionTimeoutMinutes: 45,
      });

      const result = await authService.updateSessionSettings(
        { sessionTimeoutMinutes: 45 },
        '00000000-0000-7000-8000-000000000001',
        DEFAULT_ORG.id,
        { ipAddress: '127.0.0.1', userAgent: 'test-agent' },
      );

      expect(result.sessionTimeoutMinutes).toBe(45);
      expect(result.message).toContain('updated successfully');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'organisation.session_settings_updated',
          resourceType: 'organisation',
          resourceId: DEFAULT_ORG.id,
          metadata: {
            previousSessionTimeoutMinutes: 15,
            newSessionTimeoutMinutes: 45,
          },
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
        }),
      );
    });

    it('should validate active session within timeout window', async () => {
      (prisma.organisation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...DEFAULT_ORG,
        sessionTimeoutMinutes: 15,
      });

      const recentTimestamp = Date.now() - 5 * 60 * 1000; // 5 mins ago
      const result = await authService.validateSession(recentTimestamp);

      expect(result.valid).toBe(true);
      expect(result.sessionTimeoutMinutes).toBe(15);
    });

    it('should report session expired when last active is beyond timeout window', async () => {
      (prisma.organisation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...DEFAULT_ORG,
        sessionTimeoutMinutes: 15,
      });

      const oldTimestamp = Date.now() - 20 * 60 * 1000; // 20 mins ago
      const result = await authService.validateSession(oldTimestamp);

      expect(result.valid).toBe(false);
      expect(result.sessionTimeoutMinutes).toBe(15);
    });
  });

  describe('profile management', () => {
    it('should retrieve user profile', async () => {
      const mockUser = {
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        name: 'Alice Vance',
        timezone: 'America/New_York',
        status: 'active',
        pendingEmail: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        deletedAt: null,
      };

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const profile = await authService.getProfile(mockUser.id);
      expect(profile.id).toBe(mockUser.id);
      expect(profile.email).toBe(mockUser.email);
      expect(profile.name).toBe('Alice Vance');
      expect(profile.timezone).toBe('America/New_York');
    });

    it('should update profile name and timezone and log user.profile_updated', async () => {
      const mockUser = {
        id: '00000000-0000-7000-8000-000000000001',
        organisationId: DEFAULT_ORG.id,
        email: 'user@example.com',
        name: 'Alice Vance',
        timezone: 'UTC',
        status: 'active',
        deletedAt: null,
      };

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockUser,
        name: 'Alice Cooper',
        timezone: 'Asia/Kolkata',
      });

      const result = await authService.updateProfile(mockUser.id, {
        name: 'Alice Cooper',
        timezone: 'Asia/Kolkata',
      });

      expect(result.name).toBe('Alice Cooper');
      expect(result.timezone).toBe('Asia/Kolkata');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.profile_updated',
          userId: mockUser.id,
        }),
      );
    });

    it('should initiate email change verification when email is changed', async () => {
      const mockUser = {
        id: '00000000-0000-7000-8000-000000000001',
        organisationId: DEFAULT_ORG.id,
        email: 'old@example.com',
        name: 'Alice',
        timezone: 'UTC',
        status: 'active',
        deletedAt: null,
      };

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockUser,
        pendingEmail: 'new@example.com',
      });

      const result = await authService.updateProfile(mockUser.id, {
        email: 'new@example.com',
      });

      expect(result.pendingEmail).toBe('new@example.com');
      expect(result.message).toContain('verification link has been sent');
      expect(mailer.sendEmailChangeVerificationEmail).toHaveBeenCalledWith(
        'new@example.com',
        expect.any(String),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.email_change_requested',
          userId: mockUser.id,
        }),
      );
    });

    it('should verify email change and update primary email', async () => {
      const mockUser = {
        id: '00000000-0000-7000-8000-000000000001',
        organisationId: DEFAULT_ORG.id,
        email: 'old@example.com',
        pendingEmail: 'new@example.com',
        pendingEmailTokenHash: 'sha256-hashed-token',
        pendingEmailTokenExpiresAt: new Date(Date.now() + 60000),
        deletedAt: null,
      };

      (prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockUser,
        email: 'new@example.com',
        pendingEmail: null,
      });

      const result = await authService.verifyEmailChange('raw-verification-token');

      expect(result.email).toBe('new@example.com');
      expect(result.message).toBe('Email address updated successfully.');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.email_changed',
          userId: mockUser.id,
        }),
      );
    });
  });

  describe('MFA enforcement', () => {
    it('should return mfaSetupRequired when organisation enforces MFA for user role', async () => {
      const enforcedOrg = {
        ...DEFAULT_ORG,
        mfaRequired: true,
        mfaRequiredRoles: ['admin', 'signer', 'user'],
      };

      const userWithoutMfa = {
        id: '00000000-0000-7000-8000-000000000001',
        organisationId: DEFAULT_ORG.id,
        email: 'enforced@example.com',
        passwordHash: '$scrypt$32768$8$1$00000000000000000000000000000000$hashed_password',
        emailVerified: true,
        status: 'active',
        mfaEnabled: false,
        role: 'user',
        deletedAt: null,
      };

      (prisma.organisation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(enforcedOrg);
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(userWithoutMfa);

      const result = await authService.login({
        email: 'enforced@example.com',
        password: 'Str0ng!Pass',
      });

      expect(result.mfaSetupRequired).toBe(true);
      expect(result.mfaTicket).toContain(`mfasetup_${userWithoutMfa.id}_`);
    });

    it('should update MFA enforcement configuration and log organisation.mfa_enforcement_updated', async () => {
      (prisma.organisation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_ORG);
      (prisma.organisation.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...DEFAULT_ORG,
        mfaRequired: true,
        mfaRequiredRoles: ['admin', 'signer'],
      });

      const res = await authService.updateMfaEnforcement(DEFAULT_ORG.id, {
        mfaRequired: true,
        mfaRequiredRoles: ['admin', 'signer'],
      });

      expect(res.mfaRequired).toBe(true);
      expect(res.mfaRequiredRoles).toEqual(['admin', 'signer']);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'organisation.mfa_enforcement_updated',
          organisationId: DEFAULT_ORG.id,
        }),
      );
    });
  });

  describe('MFA management', () => {
    it('should generate TOTP setup details and save pending secret', async () => {
      const mockUser = {
        id: '00000000-0000-7000-8000-000000000001',
        email: 'user@example.com',
        deletedAt: null,
      };

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockUser,
        mfaPendingSecret: 'JBSWY3DPEHPK3PXP',
      });

      const setup = await authService.setupMfa(mockUser.id);
      expect(setup.secret).toBeDefined();
      expect(setup.qrCode).toContain('data:image/svg+xml');
      expect(setup.otpauthUrl).toContain('otpauth://totp/');
    });

    it('should return mfaRequired during login when user has MFA enabled', async () => {
      const mockUser = {
        id: '00000000-0000-7000-8000-000000000001',
        organisationId: DEFAULT_ORG.id,
        email: 'mfa@example.com',
        passwordHash: '$scrypt$32768$8$1$00000000000000000000000000000000$hashed_password',
        emailVerified: true,
        status: 'active',
        mfaEnabled: true,
        mfaSecret: 'JBSWY3DPEHPK3PXP',
        deletedAt: null,
      };

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const result = await authService.login({
        email: 'mfa@example.com',
        password: 'Str0ng!Pass',
      });

      expect(result.mfaRequired).toBe(true);
      expect(result.mfaTicket).toContain(`mfa_${mockUser.id}_`);
    });

    it('should complete loginWithMfa with valid TOTP code', async () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const mockUser = {
        id: '00000000-0000-7000-8000-000000000001',
        organisationId: DEFAULT_ORG.id,
        email: 'mfa@example.com',
        status: 'active',
        mfaEnabled: true,
        mfaSecret: secret,
        deletedAt: null,
      };

      const validCode = await generateTotpToken(secret);

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const result = await authService.loginWithMfa({
        mfaTicket: `mfa_${mockUser.id}_170000000`,
        code: validCode,
      });

      expect(result.id).toBe(mockUser.id);
      expect(result.token).toBeDefined();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.login',
          userId: mockUser.id,
          metadata: expect.objectContaining({ authMethod: 'totp' }),
        }),
      );
    });

    it('should reject loginWithMfa with invalid TOTP code', async () => {
      const mockUser = {
        id: '00000000-0000-7000-8000-000000000001',
        organisationId: DEFAULT_ORG.id,
        email: 'mfa@example.com',
        status: 'active',
        mfaEnabled: true,
        mfaSecret: 'JBSWY3DPEHPK3PXP',
        deletedAt: null,
      };

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      await expect(
        authService.loginWithMfa({
          mfaTicket: `mfa_${mockUser.id}_170000000`,
          code: '000000',
        }),
      ).rejects.toThrow('Invalid TOTP verification code.');
    });

    it('should disable MFA and log user.mfa_disabled', async () => {
      const mockUser = {
        id: '00000000-0000-7000-8000-000000000001',
        organisationId: DEFAULT_ORG.id,
        email: 'mfa@example.com',
        mfaEnabled: true,
        deletedAt: null,
      };

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
      (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockUser,
        mfaEnabled: false,
      });

      const res = await authService.disableMfa(mockUser.id);
      expect(res.message).toBe('MFA disabled successfully.');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.mfa_disabled',
          userId: mockUser.id,
        }),
      );
    });
  });
=======
>>>>>>> origin/main
});
