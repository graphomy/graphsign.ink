import type { PrismaClient } from '@graphsign/db';
import type { MailerService } from './mailer-service.js';
import type { AuditService } from './audit-service.js';
import type {
  RegisterRequest,
  LoginRequest,
  UpdateSessionSettingsRequest,
  UpdateProfileRequest,
  LoginMfaRequest,
  UpdateMfaEnforcementRequest,
} from '../validators/auth-validators.js';
import {
  generateId,
  hashPassword,
  verifyPassword,
  generateToken,
  hashToken,
} from '../utils/crypto.js';
import {
  generateBase32Secret,
  generateOtpauthUrl,
  verifyTotpToken,
  generateQrCodeDataUri,
} from '../utils/totp.js';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors.js';

/** Verification tokens expire in 24 hours. */
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

/** Password reset tokens expire in 1 hour. */
const PASSWORD_RESET_TOKEN_EXPIRY_HOURS = 1;

export interface RegisterResult {
  id: string;
  email: string;
  status: string;
  createdAt: Date;
}

export interface LoginResult {
  id?: string;
  email?: string;
  status?: string;
  token?: string;
  organisationId?: string;
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  mfaTicket?: string;
}

export interface VerifyEmailResult {
  id: string;
  email: string;
  status: string;
}

/**
 * Authentication service — handles user registration, email verification, and login.
 *
 * Business rules live here, not in controllers (product.md).
 * Designed with a clean interface so Zitadel can replace the local
 * implementation without changing routes or controllers.
 */
export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Registers a new user account.
   *
   * Flow:
   * 1. Check email uniqueness within the default organisation
   * 2. Hash password with scrypt
   * 3. Generate email verification token (SHA-256 hashed for storage)
   * 4. Create user record
   * 5. Send verification email
   * 6. Log audit event
   */
  async register(
    data: RegisterRequest,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<RegisterResult> {
    // For MVP, use or create a default organisation.
    // Multi-org registration will be a separate story.
    const org = await this.getOrCreateDefaultOrganisation();

    // Check email uniqueness within organisation
    const existingUser = await this.prisma.user.findUnique({
      where: {
        organisationId_email: {
          organisationId: org.id,
          email: data.email,
        },
      },
    });

    if (existingUser) {
      // Intentionally vague to prevent user enumeration attacks
      throw new ConflictError('An account with this email already exists.');
    }

    const userId = generateId();
    const hashedPassword = await hashPassword(data.password);

    // Generate verification token — raw token goes to email, hash goes to DB
    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);
    const tokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    const user = await this.prisma.user.create({
      data: {
        id: userId,
        organisationId: org.id,
        email: data.email,
        passwordHash: hashedPassword,
        emailVerified: false,
        emailVerificationTokenHash: tokenHash,
        emailVerificationTokenExpiresAt: tokenExpiresAt,
        status: 'pending_verification',
      },
    });

    // Send verification email (non-blocking — failure shouldn't block registration)
    try {
      await this.mailer.sendVerificationEmail(data.email, rawToken);
    } catch (err) {
      console.error('Failed to send verification email:', err);
      // Registration still succeeds — user can request a new verification email
    }

    // Audit log — registration event
    await this.audit.log({
      organisationId: org.id,
      userId: user.id,
      action: 'user.registered',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { email: data.email },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      id: user.id,
      email: user.email,
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  /**
   * Authenticates a user with email and password.
   *
   * Flow:
   * 1. Find user by email within default organisation
   * 2. Verify password hash using scrypt
   * 3. Check email verification / status (active)
   * 4. Log audit event
   */
  async login(
    data: LoginRequest,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<LoginResult> {
    const org = await this.getOrCreateDefaultOrganisation();

    const user = await this.prisma.user.findUnique({
      where: {
        organisationId_email: {
          organisationId: org.id,
          email: data.email,
        },
      },
    });

    if (!user || user.deletedAt !== null) {
      await this.audit.log({
        organisationId: org.id,
        action: 'user.login_failed',
        resourceType: 'user',
        resourceId: '00000000-0000-0000-0000-000000000000',
        metadata: { email: data.email, reason: 'user_not_found' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedError('Invalid email or password.');
    }

    const isValidPassword = await verifyPassword(data.password, user.passwordHash);
    if (!isValidPassword) {
      await this.audit.log({
        organisationId: org.id,
        userId: user.id,
        action: 'user.login_failed',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { email: data.email, reason: 'invalid_password' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedError('Invalid email or password.');
    }

    if (!user.emailVerified || user.status === 'pending_verification') {
      await this.audit.log({
        organisationId: org.id,
        userId: user.id,
        action: 'user.login_failed',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { email: data.email, reason: 'email_unverified' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedError('Please verify your email address before logging in.');
    }

    if (user.status !== 'active') {
      await this.audit.log({
        organisationId: org.id,
        userId: user.id,
        action: 'user.login_failed',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { email: data.email, reason: 'account_disabled', status: user.status },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedError('Account is disabled or suspended.');
    }

    const isMfaEnforcedForRole =
      org.mfaRequired &&
      (Array.isArray(org.mfaRequiredRoles)
        ? (org.mfaRequiredRoles as string[]).includes('*') ||
          (org.mfaRequiredRoles as string[]).includes(user.role ?? 'user')
        : true);

    if (user.mfaEnabled) {
      const mfaTicket = `mfa_${user.id}_${Date.now()}`;
      return {
        mfaRequired: true,
        mfaTicket,
        email: user.email,
      };
    }

    if (isMfaEnforcedForRole) {
      const mfaTicket = `mfasetup_${user.id}_${Date.now()}`;
      return {
        mfaSetupRequired: true,
        mfaTicket,
        email: user.email,
      };
    }

    // Audit log — login event
    await this.audit.log({
      organisationId: org.id,
      userId: user.id,
      action: 'user.login',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { email: data.email },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const sessionToken = generateToken();

    return {
      id: user.id,
      email: user.email,
      status: user.status,
      token: sessionToken,
      organisationId: org.id,
    };
  }

  /**
   * Completes login for users with MFA enabled by validating 6-digit TOTP code.
   */
  async loginWithMfa(
    data: LoginMfaRequest,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<LoginResult> {
    const org = await this.getOrCreateDefaultOrganisation();

    // mfaTicket format: mfa_<userId>_<timestamp>
    const ticketParts = data.mfaTicket.split('_');
    const userId = ticketParts[1];

    if (!userId) {
      throw new UnauthorizedError('Invalid or expired MFA session ticket.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt !== null || !user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedError('Invalid MFA credentials or MFA not enabled.');
    }

    const isValidCode = await verifyTotpToken(user.mfaSecret, data.code);

    if (!isValidCode) {
      await this.audit.log({
        organisationId: org.id,
        userId: user.id,
        action: 'user.login_failed',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { email: user.email, reason: 'invalid_mfa_code' },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedError('Invalid TOTP verification code.');
    }

    await this.audit.log({
      organisationId: org.id,
      userId: user.id,
      action: 'user.login',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { email: user.email, authMethod: 'totp' },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const sessionToken = generateToken();

    return {
      id: user.id,
      email: user.email,
      status: user.status,
      token: sessionToken,
      organisationId: org.id,
    };
  }

  /**
   * Verifies a user's email address using the verification token.
   *
   * Flow:
   * 1. Hash the provided token
   * 2. Find user with matching token hash
   * 3. Check token expiry
   * 4. Mark email as verified, clear token, update status
   * 5. Log audit event
   */
  async verifyEmail(
    token: string,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<VerifyEmailResult> {
    const tokenHash = await hashToken(token);

    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationTokenHash: tokenHash,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundError('Invalid or expired verification token.');
    }

    if (user.emailVerificationTokenExpiresAt && user.emailVerificationTokenExpiresAt < new Date()) {
      throw new ValidationError('Verification token has expired. Please request a new one.');
    }

    if (user.emailVerified) {
      throw new ValidationError('Email is already verified.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
        status: 'active',
      },
    });

    await this.audit.log({
      organisationId: user.organisationId,
      userId: user.id,
      action: 'user.email_verified',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      status: updatedUser.status,
    };
  }

  /**
   * Resends a verification email to a user if their account is unverified.
   *
   * Flow:
   * 1. Find user by email within default organisation
   * 2. If user doesn't exist or is deleted, return gracefully (generic success to avoid email enumeration)
   * 3. If email is already verified, throw ValidationError
   * 4. Generate new raw token and token hash with fresh 24h expiration
   * 5. Update user record
   * 6. Dispatch verification email
   * 7. Log audit event
   */
  async resendVerificationEmail(
    email: string,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ message: string }> {
    const org = await this.getOrCreateDefaultOrganisation();

    const user = await this.prisma.user.findUnique({
      where: {
        organisationId_email: {
          organisationId: org.id,
          email,
        },
      },
    });

    if (!user || user.deletedAt !== null) {
      // Return success without revealing account existence
      return {
        message: 'If an account exists with this email, a verification link has been sent.',
      };
    }

    if (user.emailVerified) {
      throw new ValidationError('Email is already verified.');
    }

    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);
    const tokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationTokenExpiresAt: tokenExpiresAt,
      },
    });

    try {
      await this.mailer.sendVerificationEmail(user.email, rawToken);
    } catch (err) {
      console.error('Failed to resend verification email:', err);
    }

    await this.audit.log({
      organisationId: org.id,
      userId: user.id,
      action: 'user.verification_resent',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { email: user.email },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      message: 'Verification email resent successfully.',
    };
  }

  /**
   * Initiates a password reset request for a registered user.
   *
   * Flow:
   * 1. Find user by email within default organisation
   * 2. If user doesn't exist or is deleted, return gracefully (prevents email enumeration)
   * 3. Generate raw reset token and token hash with 1-hour expiration
   * 4. Update user record with token hash & expiration
   * 5. Dispatch password reset email via mailer service
   * 6. Log audit event
   */
  async requestPasswordReset(
    email: string,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ message: string }> {
    const org = await this.getOrCreateDefaultOrganisation();

    const user = await this.prisma.user.findUnique({
      where: {
        organisationId_email: {
          organisationId: org.id,
          email,
        },
      },
    });

    if (!user || user.deletedAt !== null) {
      // Intentionally vague to prevent user enumeration
      return {
        message: 'If an account exists with this email, a password reset link has been sent.',
      };
    }

    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);
    const tokenExpiresAt = new Date(
      Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetTokenExpiresAt: tokenExpiresAt,
      },
    });

    try {
      await this.mailer.sendPasswordResetEmail(user.email, rawToken);
    } catch (err) {
      console.error('Failed to send password reset email:', err);
    }

    await this.audit.log({
      organisationId: org.id,
      userId: user.id,
      action: 'user.password_reset_requested',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { email: user.email },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      message: 'Password reset link sent successfully. Please check your email.',
    };
  }

  /**
   * Resets a user's password using a valid reset token.
   *
   * Flow:
   * 1. Hash provided raw token
   * 2. Find user with matching token hash
   * 3. Verify token hasn't expired and user isn't deleted
   * 4. Hash new password
   * 5. Update user passwordHash, clear reset token fields
   * 6. Log audit event
   */
  async resetPassword(
    token: string,
    newPassword: string,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ message: string }> {
    const tokenHash = await hashToken(token);

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetTokenHash: tokenHash,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundError('Invalid or expired password reset token.');
    }

    if (user.passwordResetTokenExpiresAt && user.passwordResetTokenExpiresAt < new Date()) {
      throw new ValidationError('Password reset token has expired. Please request a new one.');
    }

    const newHashedPassword = await hashPassword(newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHashedPassword,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
      },
    });

    await this.audit.log({
      organisationId: user.organisationId,
      userId: user.id,
      action: 'user.password_reset_completed',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      message: 'Password updated successfully. You can now sign in with your new password.',
    };
  }

  /**
   * Logs out a user and records an audit log event.
   *
   * Flow:
   * 1. Get or resolve default organisation
   * 2. Log audit event `user.logout`
   * 3. Return success message
   */
  async logout(
    userId?: string,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ message: string }> {
    const org = await this.getOrCreateDefaultOrganisation();

    if (userId) {
      await this.audit.log({
        organisationId: org.id,
        userId,
        action: 'user.logout',
        resourceType: 'user',
        resourceId: userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    }

    return {
      message: 'Signed out successfully.',
    };
  }

  /**
   * Generates a new TOTP secret and QR code for setting up MFA.
   */
  async setupMfa(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt !== null) {
      throw new NotFoundError('User not found.');
    }

    const secret = generateBase32Secret(20);
    const otpauthUrl = generateOtpauthUrl(user.email, secret);
    const qrCode = generateQrCodeDataUri(otpauthUrl);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaPendingSecret: secret,
      },
    });

    return {
      secret,
      qrCode,
      otpauthUrl,
    };
  }

  /**
   * Verifies the 6-digit code during setup, enables MFA on the account, and returns backup codes.
   */
  async verifySetupMfa(
    userId: string,
    code: string,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ message: string; backupCodes: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt !== null) {
      throw new NotFoundError('User not found.');
    }

    if (!user.mfaPendingSecret) {
      throw new ValidationError('No MFA setup in progress. Please start MFA setup again.');
    }

    const isValid = await verifyTotpToken(user.mfaPendingSecret, code);

    if (!isValid) {
      throw new ValidationError('Invalid verification code. Please check your authenticator app and try again.');
    }

    // Generate 8 backup codes
    const backupCodes = Array.from({ length: 8 }, () => generateToken().slice(0, 10).toUpperCase());

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecret: user.mfaPendingSecret,
        mfaPendingSecret: null,
        mfaBackupCodes: backupCodes,
      },
    });

    await this.audit.log({
      organisationId: user.organisationId,
      userId: user.id,
      action: 'user.mfa_enabled',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      message: 'MFA enabled successfully.',
      backupCodes,
    };
  }

  /**
   * Enables MFA for a user and records an audit log event with IP and user agent.
   */
  async enableMfa(
    userId: string,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    const orgId = user?.organisationId ?? (await this.getOrCreateDefaultOrganisation()).id;

    if (user) {
      const dummySecret = generateBase32Secret(20);
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: true,
          mfaSecret: dummySecret,
        },
      });
    }

    await this.audit.log({
      organisationId: orgId,
      userId,
      action: 'user.mfa_enabled',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      message: 'MFA enabled successfully.',
    };
  }

  /**
   * Disables MFA for a user and records an audit log event with IP and user agent.
   */
  async disableMfa(
    userId: string,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    const orgId = user?.organisationId ?? (await this.getOrCreateDefaultOrganisation()).id;

    if (user) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaPendingSecret: null,
          mfaBackupCodes: null as any,
        },
      });
    }

    await this.audit.log({
      organisationId: orgId,
      userId,
      action: 'user.mfa_disabled',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      message: 'MFA disabled successfully.',
    };
  }

  /**
   * Retrieves the current session timeout configuration for the organisation.
   */
  async getSessionSettings(organisationId?: string): Promise<{ sessionTimeoutMinutes: number }> {
    const org = organisationId
      ? await this.prisma.organisation.findUnique({ where: { id: organisationId } })
      : await this.getOrCreateDefaultOrganisation();

    return {
      sessionTimeoutMinutes: org?.sessionTimeoutMinutes ?? 15,
    };
  }

  /**
   * Updates the organisation's session timeout configuration and records an audit log event.
   */
  async updateSessionSettings(
    data: UpdateSessionSettingsRequest,
    userId?: string,
    organisationId?: string,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ sessionTimeoutMinutes: number; message: string }> {
    const org = organisationId
      ? await this.prisma.organisation.findUnique({ where: { id: organisationId } })
      : await this.getOrCreateDefaultOrganisation();

    if (!org) {
      throw new NotFoundError('Organisation not found.');
    }

    const previousTimeout = org.sessionTimeoutMinutes;

    const updatedOrg = await this.prisma.organisation.update({
      where: { id: org.id },
      data: {
        sessionTimeoutMinutes: data.sessionTimeoutMinutes,
      },
    });

    await this.audit.log({
      organisationId: org.id,
      userId: userId ?? undefined,
      action: 'organisation.session_settings_updated',
      resourceType: 'organisation',
      resourceId: org.id,
      metadata: {
        previousSessionTimeoutMinutes: previousTimeout,
        newSessionTimeoutMinutes: data.sessionTimeoutMinutes,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      sessionTimeoutMinutes: updatedOrg.sessionTimeoutMinutes,
      message: 'Session timeout configuration updated successfully.',
    };
  }

  /**
   * Validates if a session is still active based on the last active timestamp and configured timeout.
   */
  async validateSession(
    lastActiveAtMs?: number,
    organisationId?: string,
  ): Promise<{ valid: boolean; sessionTimeoutMinutes: number; expiresAt: string }> {
    const settings = await this.getSessionSettings(organisationId);
    const timeoutMs = settings.sessionTimeoutMinutes * 60 * 1000;
    const now = Date.now();

    if (!lastActiveAtMs) {
      return {
        valid: true,
        sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
        expiresAt: new Date(now + timeoutMs).toISOString(),
      };
    }

    const isExpired = now - lastActiveAtMs > timeoutMs;

    return {
      valid: !isExpired,
      sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
      expiresAt: new Date(lastActiveAtMs + timeoutMs).toISOString(),
    };
  }

  /**
   * Retrieves profile information for the specified user.
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt !== null) {
      throw new NotFoundError('User profile not found.');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone ?? 'UTC',
      status: user.status,
      pendingEmail: user.pendingEmail,
      createdAt: user.createdAt.toISOString(),
      mfaEnabled: user.mfaEnabled ?? false,
      role: user.role ?? 'user',
    };
  }

  /**
   * Updates profile fields (name, timezone) and initiates email change verification if email is changed.
   */
  async updateProfile(
    userId: string,
    data: UpdateProfileRequest,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt !== null) {
      throw new NotFoundError('User profile not found.');
    }

    const updateData: Partial<{
      name: string;
      timezone: string;
      pendingEmail: string | null;
      pendingEmailTokenHash: string | null;
      pendingEmailTokenExpiresAt: Date | null;
    }> = {};

    let emailChangeRequested = false;

    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    if (data.timezone !== undefined) {
      updateData.timezone = data.timezone;
    }

    if (data.email && data.email !== user.email) {
      // Check if new email is already in use in the organisation
      const existingUser = await this.prisma.user.findUnique({
        where: {
          organisationId_email: {
            organisationId: user.organisationId,
            email: data.email,
          },
        },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new ConflictError('An account with this email already exists in your organisation.');
      }

      // Generate email verification token (24h expiry)
      const rawToken = generateToken();
      const tokenHash = await hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      updateData.pendingEmail = data.email;
      updateData.pendingEmailTokenHash = tokenHash;
      updateData.pendingEmailTokenExpiresAt = expiresAt;
      emailChangeRequested = true;

      try {
        await this.mailer.sendEmailChangeVerificationEmail(data.email, rawToken);
      } catch (err) {
        console.error('Failed to send email change verification:', err);
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    await this.audit.log({
      organisationId: user.organisationId,
      userId: user.id,
      action: emailChangeRequested ? 'user.email_change_requested' : 'user.profile_updated',
      resourceType: 'user',
      resourceId: user.id,
      metadata: {
        updatedFields: Object.keys(updateData),
        ...(emailChangeRequested ? { pendingEmail: data.email } : {}),
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      timezone: updatedUser.timezone ?? 'UTC',
      status: updatedUser.status,
      pendingEmail: updatedUser.pendingEmail,
      message: emailChangeRequested
        ? 'Profile updated. A verification link has been sent to your new email address.'
        : 'Profile updated successfully.',
    };
  }

  /**
   * Verifies and finalizes an email change request using the verification token.
   */
  async verifyEmailChange(
    token: string,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ) {
    const tokenHash = await hashToken(token);

    const user = await this.prisma.user.findFirst({
      where: {
        pendingEmailTokenHash: tokenHash,
        deletedAt: null,
      },
    });

    if (!user || !user.pendingEmail) {
      throw new NotFoundError('Invalid or expired email change verification token.');
    }

    if (user.pendingEmailTokenExpiresAt && user.pendingEmailTokenExpiresAt < new Date()) {
      throw new ValidationError('Email change verification token has expired.');
    }

    const newEmail = user.pendingEmail;

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email: newEmail,
        pendingEmail: null,
        pendingEmailTokenHash: null,
        pendingEmailTokenExpiresAt: null,
      },
    });

    await this.audit.log({
      organisationId: user.organisationId,
      userId: user.id,
      action: 'user.email_changed',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { oldEmail: user.email, newEmail },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      message: 'Email address updated successfully.',
    };
  }

  /**
   * Retrieves MFA enforcement settings for an organisation.
   */
  async getMfaEnforcement(orgId?: string): Promise<{ mfaRequired: boolean; mfaRequiredRoles: string[] }> {
    const org = orgId
      ? await this.prisma.organisation.findUnique({ where: { id: orgId } })
      : await this.getOrCreateDefaultOrganisation();

    if (!org) {
      throw new NotFoundError('Organisation not found.');
    }

    const roles = Array.isArray(org.mfaRequiredRoles) ? (org.mfaRequiredRoles as string[]) : [];

    return {
      mfaRequired: org.mfaRequired ?? false,
      mfaRequiredRoles: roles,
    };
  }

  /**
   * Updates MFA enforcement settings for an organisation and logs audit event.
   */
  async updateMfaEnforcement(
    orgId: string | undefined,
    data: UpdateMfaEnforcementRequest,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<{ mfaRequired: boolean; mfaRequiredRoles: string[]; message: string }> {
    const org = orgId
      ? await this.prisma.organisation.findUnique({ where: { id: orgId } })
      : await this.getOrCreateDefaultOrganisation();

    if (!org) {
      throw new NotFoundError('Organisation not found.');
    }

    const updatedRoles = data.mfaRequiredRoles ?? ['*'];

    const updatedOrg = await this.prisma.organisation.update({
      where: { id: org.id },
      data: {
        mfaRequired: data.mfaRequired,
        mfaRequiredRoles: updatedRoles,
      },
    });

    await this.audit.log({
      organisationId: org.id,
      action: 'organisation.mfa_enforcement_updated',
      resourceType: 'organisation',
      resourceId: org.id,
      metadata: {
        previousMfaRequired: org.mfaRequired,
        newMfaRequired: data.mfaRequired,
        roles: updatedRoles,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      mfaRequired: updatedOrg.mfaRequired,
      mfaRequiredRoles: (updatedOrg.mfaRequiredRoles as string[]) ?? [],
      message: 'MFA enforcement settings updated successfully.',
    };
  }

  /**
   * Gets or creates the default organisation for MVP.

   * Multi-org support will be added in a separate story.
   */
  private async getOrCreateDefaultOrganisation() {
    const existing = await this.prisma.organisation.findUnique({
      where: { slug: 'default' },
    });

    if (existing) {
      return existing;
    }

    const id = generateId();
    return this.prisma.organisation.create({
      data: {
        id,
        name: 'Default Organisation',
        slug: 'default',
        tenantId: id,
        status: 'active',
      },
    });
  }
}
