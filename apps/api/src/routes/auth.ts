import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { registerRequestSchema, verifyEmailRequestSchema } from '../validators/auth-validators.js';
import { AuthService } from '../services/auth-service.js';
import type { MailerService } from '../services/mailer-service.js';
import type { AuditService } from '../services/audit-service.js';
import { ValidationError } from '../utils/errors.js';
import { createRateLimiter } from '../middleware/rate-limiter.js';

/**
 * Auth route factory.
 * Receives dependencies via constructor injection for testability.
 */
export function createAuthRoutes(deps: {
  prisma: PrismaClient;
  mailer: MailerService;
  audit: AuditService;
}) {
  const auth = new Hono();
  const authService = new AuthService(deps.prisma, deps.mailer, deps.audit);

  // Rate limit auth endpoints: 10 req/min per IP (security.md)
  auth.use('/*', createRateLimiter(10, 60_000));

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

  return auth;
}
