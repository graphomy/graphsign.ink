import type { PrismaClient } from '@graphsign/db';
import type { MailerService } from './mailer-service.js';
import type { AuditService } from './audit-service.js';
import type { RegisterRequest, LoginRequest } from '../validators/auth-validators.js';
import {
  generateId,
  hashPassword,
  verifyPassword,
  generateToken,
  hashToken,
} from '../utils/crypto.js';
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
  id: string;
  email: string;
  status: string;
  token: string;
  organisationId: string;
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
      // Vague error to prevent email enumeration
      throw new UnauthorizedError('Invalid email or password.');
    }

    const isValidPassword = await verifyPassword(data.password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    if (!user.emailVerified || user.status === 'pending_verification') {
      throw new UnauthorizedError('Please verify your email address before logging in.');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedError('Account is disabled or suspended.');
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
