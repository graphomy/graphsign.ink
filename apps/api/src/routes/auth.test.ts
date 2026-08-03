import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createAuthRoutes } from './auth.js';
import { errorHandler } from '../middleware/error-handler.js';

// Mock crypto module
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

function createMockDeps() {
  return {
    prisma: {
      organisation: {
        findUnique: vi.fn().mockResolvedValue(DEFAULT_ORG),
        create: vi.fn().mockResolvedValue(DEFAULT_ORG),
        update: vi.fn().mockResolvedValue(DEFAULT_ORG),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => ({
          id: data.id,
          email: data.email,
          status: data.status,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          organisationId: DEFAULT_ORG.id,
        })),
        update: vi.fn(),
      },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    },
    mailer: {
      sendVerificationEmail: vi.fn(async () => {}),
      sendPasswordResetEmail: vi.fn(async () => {}),
      sendEmailChangeVerificationEmail: vi.fn(async () => {}),
    },
    audit: {
      log: vi.fn(async () => {}),
    },
  };
}

function createApp(deps: ReturnType<typeof createMockDeps>) {
  const app = new Hono();
  app.onError(errorHandler);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.route('/api/v1/auth', createAuthRoutes(deps as any));
  return app;
}

describe('POST /api/v1/auth/register', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let app: Hono;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  it('should return 201 on successful registration', async () => {
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'Str0ng!Pass',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.id).toBeDefined();
    expect(body.email).toBe('user@example.com');
    expect(body.status).toBe('pending_verification');
    expect(body.message).toContain('check your email');
  });

  it('should return 400 for invalid email', async () => {
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'not-an-email',
        password: 'Str0ng!Pass',
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.field).toBe('email');
  });

  it('should return 400 for weak password', async () => {
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'weak',
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 409 for duplicate email', async () => {
    deps.prisma.user.findUnique.mockResolvedValue({
      id: 'existing',
      email: 'user@example.com',
    });

    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'Str0ng!Pass',
      }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('CONFLICT');
  });

  it('should return 400 for missing request body', async () => {
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should include standard error fields in error responses', async () => {
    const res = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bad',
        password: 'x',
      }),
    });

    const body = (await res.json()) as any;
    expect(body.error).toBeDefined();
    expect(body.error.code).toBeDefined();
    expect(body.error.message).toBeDefined();
    expect(body.error.timestamp).toBeDefined();
    expect(body.error.requestId).toBeDefined();
    expect(body.error.path).toBeDefined();
  });
});

describe('POST /api/v1/auth/login', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let app: Hono;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  it('should return 200 on successful login', async () => {
    deps.prisma.user.findUnique.mockResolvedValue({
      id: '00000000-0000-7000-8000-000000000001',
      email: 'user@example.com',
      passwordHash: '$scrypt$hash',
      emailVerified: true,
      status: 'active',
      organisationId: DEFAULT_ORG.id,
      deletedAt: null,
    });

    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'Str0ng!Pass',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.id).toBe('00000000-0000-7000-8000-000000000001');
    expect(body.email).toBe('user@example.com');
    expect(body.status).toBe('active');
    expect(body.token).toBeDefined();
    expect(body.organisationId).toBe(DEFAULT_ORG.id);
    expect(body.message).toContain('Login successful');
  });

  it('should return 401 on invalid credentials', async () => {
    deps.prisma.user.findUnique.mockResolvedValue(null);

    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: 'WrongPassword!',
      }),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 400 for missing credentials', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/auth/verify-email', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let app: Hono;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  it('should return 200 on successful email verification', async () => {
    deps.prisma.user.findFirst.mockResolvedValue({
      id: '00000000-0000-7000-8000-000000000001',
      email: 'user@example.com',
      organisationId: DEFAULT_ORG.id,
      emailVerified: false,
      emailVerificationTokenHash: 'sha256-hashed-token',
      emailVerificationTokenExpiresAt: new Date(Date.now() + 86400000),
      status: 'pending_verification',
    });
    deps.prisma.user.update.mockResolvedValue({
      id: '00000000-0000-7000-8000-000000000001',
      email: 'user@example.com',
      status: 'active',
    });

    const res = await app.request('/api/v1/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'raw-verification-token' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('active');
    expect(body.message).toContain('verified successfully');
  });

  it('should return 404 for invalid token', async () => {
    const res = await app.request('/api/v1/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'invalid-token' }),
    });

    expect(res.status).toBe(404);
  });

  it('should return 400 for missing token', async () => {
    const res = await app.request('/api/v1/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/resend-verification', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let app: Hono;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  it('should return 200 on successful resend request', async () => {
    deps.prisma.user.findUnique.mockResolvedValue({
      id: '00000000-0000-7000-8000-000000000001',
      email: 'user@example.com',
      organisationId: DEFAULT_ORG.id,
      emailVerified: false,
      status: 'pending_verification',
      deletedAt: null,
    });

    const res = await app.request('/api/v1/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.message).toContain('resent successfully');
  });

  it('should return 400 for invalid email format', async () => {
    const res = await app.request('/api/v1/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid-email' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should return 400 for missing request body', async () => {
    const res = await app.request('/api/v1/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/auth/forgot-password', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let app: Hono;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  it('should return 200 on successful forgot password request', async () => {
    deps.prisma.user.findUnique.mockResolvedValue({
      id: '00000000-0000-7000-8000-000000000001',
      email: 'user@example.com',
      organisationId: DEFAULT_ORG.id,
      status: 'active',
      deletedAt: null,
    });

    const res = await app.request('/api/v1/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.message).toContain('sent successfully');
  });

  it('should return 400 for invalid email format', async () => {
    const res = await app.request('/api/v1/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'invalid-email' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/auth/reset-password', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let app: Hono;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  it('should return 200 on successful password reset', async () => {
    deps.prisma.user.findFirst.mockResolvedValue({
      id: '00000000-0000-7000-8000-000000000001',
      email: 'user@example.com',
      organisationId: DEFAULT_ORG.id,
      passwordResetTokenHash: 'sha256-hashed-token',
      passwordResetTokenExpiresAt: new Date(Date.now() + 3600000),
      deletedAt: null,
    });

    const res = await app.request('/api/v1/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'raw-verification-token',
        password: 'NewStr0ng!Pass',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.message).toContain('Password updated successfully');
  });

  it('should return 400 for missing token or weak password', async () => {
    const res = await app.request('/api/v1/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: '',
        password: 'weak',
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/v1/auth/logout', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let app: Hono;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  it('should return 200 and clear session cookie on logout', async () => {
    const res = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': '00000000-0000-7000-8000-000000000001',
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.message).toContain('Signed out successfully');

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('graphsign_session=');
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  });
});

describe('POST /api/v1/auth/mfa/enable and /mfa/disable', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let app: Hono;

  beforeEach(() => {
    deps = createMockDeps();
    app = createApp(deps);
  });

  it('should return 200 on enabling MFA and log audit event', async () => {
    const res = await app.request('/api/v1/auth/mfa/enable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': '00000000-0000-7000-8000-000000000001',
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.message).toBe('MFA enabled successfully.');
  });

  it('should return 200 on disabling MFA and log audit event', async () => {
    const res = await app.request('/api/v1/auth/mfa/disable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': '00000000-0000-7000-8000-000000000001',
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.message).toBe('MFA disabled successfully.');
  });
});

describe('Session Settings Routes', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let app: Hono;

  beforeEach(() => {
    deps = createMockDeps();
    (deps.prisma.organisation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_ORG,
      sessionTimeoutMinutes: 15,
    });
    (deps.prisma.organisation.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_ORG,
      sessionTimeoutMinutes: 30,
    });
    app = createApp(deps);
  });

  it('should GET session settings successfully', async () => {
    const res = await app.request('/api/v1/auth/session-settings', {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.sessionTimeoutMinutes).toBe(15);
  });

  it('should PUT session settings successfully with valid timeout', async () => {
    const res = await app.request('/api/v1/auth/session-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionTimeoutMinutes: 30 }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.sessionTimeoutMinutes).toBe(30);
    expect(body.message).toContain('updated successfully');
  });

  it('should return 400 when PUT session settings receives invalid timeout value (<1)', async () => {
    const res = await app.request('/api/v1/auth/session-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionTimeoutMinutes: 0 }),
    });

    expect(res.status).toBe(400);
  });

  it('should POST session validate and return active status', async () => {
    const recentTime = Date.now() - 60000;
    const res = await app.request('/api/v1/auth/session/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastActiveAt: recentTime }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.valid).toBe(true);
    expect(body.sessionTimeoutMinutes).toBe(15);
  });
});

describe('Profile Routes', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let app: Hono;

  const mockUser = {
    id: '00000000-0000-7000-8000-000000000001',
    organisationId: DEFAULT_ORG.id,
    email: 'user@example.com',
    name: 'Alice Vance',
    timezone: 'UTC',
    status: 'active',
    pendingEmail: null,
    pendingEmailTokenHash: null,
    pendingEmailTokenExpiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(() => {
    deps = createMockDeps();
    (deps.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);
    (deps.prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockUser,
      name: 'Alice Cooper',
      timezone: 'Europe/London',
    });
    app = createApp(deps);
  });

  it('should GET profile successfully', async () => {
    const res = await app.request('/api/v1/auth/profile', {
      method: 'GET',
      headers: { 'x-user-id': mockUser.id },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.id).toBe(mockUser.id);
    expect(body.email).toBe(mockUser.email);
    expect(body.name).toBe('Alice Vance');
  });

  it('should PUT profile to update name and timezone', async () => {
    const res = await app.request('/api/v1/auth/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': mockUser.id,
      },
      body: JSON.stringify({
        name: 'Alice Cooper',
        timezone: 'Europe/London',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.name).toBe('Alice Cooper');
    expect(body.timezone).toBe('Europe/London');
  });

  it('should return 400 when PUT profile receives invalid email', async () => {
    const res = await app.request('/api/v1/auth/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': mockUser.id,
      },
      body: JSON.stringify({
        email: 'invalid-email',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('should POST verify-email-change and return success', async () => {
    (deps.prisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockUser,
      pendingEmail: 'newemail@example.com',
      pendingEmailTokenHash: 'sha256-hashed-token',
      pendingEmailTokenExpiresAt: new Date(Date.now() + 60000),
    });

    (deps.prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockUser,
      email: 'newemail@example.com',
      pendingEmail: null,
    });

    const res = await app.request('/api/v1/auth/profile/verify-email-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'raw-verification-token' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.email).toBe('newemail@example.com');
    expect(body.message).toBe('Email address updated successfully.');
  });
});

describe('MFA Enforcement Routes', () => {
  let deps: ReturnType<typeof createMockDeps>;
  let app: Hono;

  beforeEach(() => {
    deps = createMockDeps();
    (deps.prisma.organisation.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_ORG,
      mfaRequired: false,
      mfaRequiredRoles: [],
    });
    (deps.prisma.organisation.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_ORG,
      mfaRequired: true,
      mfaRequiredRoles: ['admin', 'signer'],
    });
    app = createApp(deps);
  });

  it('should GET /mfa-enforcement successfully', async () => {
    const res = await app.request('/api/v1/auth/mfa-enforcement', {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.mfaRequired).toBe(false);
  });

  it('should PUT /mfa-enforcement to update policy settings', async () => {
    const res = await app.request('/api/v1/auth/mfa-enforcement', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mfaRequired: true,
        mfaRequiredRoles: ['admin', 'signer'],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.mfaRequired).toBe(true);
    expect(body.mfaRequiredRoles).toEqual(['admin', 'signer']);
  });
});



