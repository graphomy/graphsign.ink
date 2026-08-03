import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient, prisma as legacyPrisma } from '@graphsign/db';
import {
  registerRequestSchema,
  loginRequestSchema,
  verifyEmailRequestSchema,
  resendVerificationRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  updateSessionSettingsSchema,
  validateSessionRequestSchema,
} from '../validators/auth-validators.js';
import { AuthService } from '../services/auth-service.js';
import type { MailerService } from '../services/mailer-service.js';
import { createMailerService } from '../services/mailer-service.js';
import type { AuditService } from '../services/audit-service.js';
import { PrismaAuditService } from '../services/audit-service.js';
import { ValidationError } from '../utils/errors.js';
import { createRateLimiter } from '../middleware/rate-limiter.js';
import type { Env } from '../index.js';

export interface AuthDeps {
  prisma?: PrismaClient;
  mailer?: MailerService;
  audit?: AuditService;
}

/**
 * Auth route factory.
 * Receives optional dependencies (for testing), or resolves them from c.env in Cloudflare Workers.
 */
export function createAuthRoutes(deps?: AuthDeps) {
  const auth = new Hono<{ Bindings: Env }>();

  // Rate limit auth endpoints: 10 req/min per IP (security.md)
  auth.use('/*', createRateLimiter(10, 60_000));

  function getAuthService(c: any): AuthService {
    let db = deps?.prisma;
    if (!db) {
      db = c.env?.DATABASE_URL ? createPrismaClient(c.env.DATABASE_URL) : legacyPrisma;
    }

    let mailer = deps?.mailer;
    if (!mailer) {
      mailer = createMailerService(c.env ?? {});
    }

    let audit = deps?.audit;
    if (!audit) {
      audit = new PrismaAuditService(db);
    }

    return new AuthService(db, mailer, audit);
  }

  /**
   * POST /api/v1/auth/register
   *
   * Creates a new user account. Requires email verification before active.
   */
  auth.post('/register', async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body) {
      throw new ValidationError('Request body is required.');
    }

    const parsed = registerRequestSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.', {
        field: firstError?.path.join('.') ?? 'unknown',
        issue: firstError?.message ?? 'validation_failed',
      });
    }

    const authService = getAuthService(c);

    const result = await authService.register(parsed.data, {
      ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: c.req.header('user-agent'),
    });

    return c.json(
      {
        id: result.id,
        email: result.email,
        status: result.status,
        createdAt: result.createdAt.toISOString(),
        message: 'Account created. Please check your email to verify your account.',
      },
      201,
    );
  });

  /**
   * POST /api/v1/auth/login
   *
   * Authenticates user credentials and returns session status.
   */
  auth.post('/login', async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body) {
      throw new ValidationError('Request body is required.');
    }

    const parsed = loginRequestSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.', {
        field: firstError?.path.join('.') ?? 'unknown',
        issue: firstError?.message ?? 'validation_failed',
      });
    }

    const authService = getAuthService(c);

    const result = await authService.login(parsed.data, {
      ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: c.req.header('user-agent'),
    });

    c.header(
      'Set-Cookie',
      `graphsign_session=${result.token}; HttpOnly; Path=/; SameSite=Strict; Secure`,
    );

    return c.json({
      id: result.id,
      email: result.email,
      status: result.status,
      token: result.token,
      organisationId: result.organisationId,
      message: 'Login successful.',
    });
  });

  /**
   * POST /api/v1/auth/verify-email
   *
   * Verifies a user's email using the token from the verification email.
   */
  auth.post('/verify-email', async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body) {
      throw new ValidationError('Request body is required.');
    }

    const parsed = verifyEmailRequestSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.', {
        field: firstError?.path.join('.') ?? 'unknown',
        issue: firstError?.message ?? 'validation_failed',
      });
    }

    const authService = getAuthService(c);

    const result = await authService.verifyEmail(parsed.data.token, {
      ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      id: result.id,
      email: result.email,
      status: result.status,
      message: 'Email verified successfully. You can now sign in.',
    });
  });

  /**
   * POST /api/v1/auth/resend-verification
   *
   * Resends the email verification link to the given user email address.
   */
  auth.post('/resend-verification', async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body) {
      throw new ValidationError('Request body is required.');
    }

    const parsed = resendVerificationRequestSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.', {
        field: firstError?.path.join('.') ?? 'unknown',
        issue: firstError?.message ?? 'validation_failed',
      });
    }

    const authService = getAuthService(c);

    const result = await authService.resendVerificationEmail(parsed.data.email, {
      ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      message: result.message,
    });
  });

  /**
   * POST /api/v1/auth/forgot-password
   *
   * Requests a password reset link email.
   */
  auth.post('/forgot-password', async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body) {
      throw new ValidationError('Request body is required.');
    }

    const parsed = forgotPasswordRequestSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.', {
        field: firstError?.path.join('.') ?? 'unknown',
        issue: firstError?.message ?? 'validation_failed',
      });
    }

    const authService = getAuthService(c);

    const result = await authService.requestPasswordReset(parsed.data.email, {
      ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      message: result.message,
    });
  });

  /**
   * POST /api/v1/auth/reset-password
   *
   * Resets a user's password using the token from the reset email.
   */
  auth.post('/reset-password', async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body) {
      throw new ValidationError('Request body is required.');
    }

    const parsed = resetPasswordRequestSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.', {
        field: firstError?.path.join('.') ?? 'unknown',
        issue: firstError?.message ?? 'validation_failed',
      });
    }

    const authService = getAuthService(c);

    const result = await authService.resetPassword(parsed.data.token, parsed.data.password, {
      ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      message: result.message,
    });
  });

  /**
   * POST /api/v1/auth/logout
   *
   * Terminates active session and expires session cookie.
   */
  auth.post('/logout', async (c) => {
    const authService = getAuthService(c);
    const userId = c.req.header('x-user-id');

    const result = await authService.logout(userId, {
      ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: c.req.header('user-agent'),
    });

    c.header(
      'Set-Cookie',
      'graphsign_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict; Secure',
    );

    return c.json({
      message: result.message,
    });
  });

  /**
   * POST /api/v1/auth/mfa/enable
   *
   * Enables MFA for the authenticated user and logs audit event with IP and user agent.
   */
  auth.post('/mfa/enable', async (c) => {
    const authService = getAuthService(c);
    const userId = c.req.header('x-user-id') ?? '00000000-0000-7000-8000-000000000001';

    const result = await authService.enableMfa(userId, {
      ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      message: result.message,
    });
  });

  /**
   * POST /api/v1/auth/mfa/disable
   *
   * Disables MFA for the authenticated user and logs audit event with IP and user agent.
   */
  auth.post('/mfa/disable', async (c) => {
    const authService = getAuthService(c);
    const userId = c.req.header('x-user-id') ?? '00000000-0000-7000-8000-000000000001';

    const result = await authService.disableMfa(userId, {
      ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      message: result.message,
    });
  });

  /**
   * GET /api/v1/auth/session-settings
   *
   * Retrieves current session timeout setting (in minutes) for the organisation.
   */
  auth.get('/session-settings', async (c) => {
    const authService = getAuthService(c);
    const orgId = c.req.header('x-organisation-id');

    const settings = await authService.getSessionSettings(orgId);

    return c.json({
      sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
    });
  });

  /**
   * PUT /api/v1/auth/session-settings
   *
   * Updates session timeout setting for the organisation and logs audit event.
   */
  auth.put('/session-settings', async (c) => {
    const body = await c.req.json().catch(() => null);

    if (!body) {
      throw new ValidationError('Request body is required.');
    }

    const parsed = updateSessionSettingsSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.', {
        field: firstError?.path.join('.') ?? 'unknown',
        issue: firstError?.message ?? 'validation_failed',
      });
    }

    const authService = getAuthService(c);
    const userId = c.req.header('x-user-id');
    const orgId = c.req.header('x-organisation-id');

    const result = await authService.updateSessionSettings(parsed.data, userId, orgId, {
      ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim(),
      userAgent: c.req.header('user-agent'),
    });

    return c.json({
      sessionTimeoutMinutes: result.sessionTimeoutMinutes,
      message: result.message,
    });
  });

  /**
   * POST /api/v1/auth/session/validate
   *
   * Checks if session is active or expired given last active timestamp.
   */
  auth.post('/session/validate', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = validateSessionRequestSchema.safeParse(body);

    const authService = getAuthService(c);
    const orgId = c.req.header('x-organisation-id');

    const result = await authService.validateSession(parsed.data?.lastActiveAt, orgId);

    return c.json(result);
  });

  return auth;
}
