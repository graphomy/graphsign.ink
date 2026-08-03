import { describe, it, expect } from 'vitest';
import {
  registerRequestSchema,
  verifyEmailRequestSchema,
  resendVerificationRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  updateSessionSettingsSchema,
  updateProfileRequestSchema,
  verifyMfaSetupRequestSchema,
  loginMfaRequestSchema,
  updateMfaEnforcementRequestSchema,
} from './auth-validators.js';

describe('registerRequestSchema', () => {
  it('should accept a valid email and strong password', () => {
    const result = registerRequestSchema.safeParse({
      email: 'user@example.com',
      password: 'Str0ng!Pass',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('should normalize email to lowercase and trim whitespace', () => {
    const result = registerRequestSchema.safeParse({
      email: '  User@Example.COM  ',
      password: 'Str0ng!Pass',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('should reject an invalid email format', () => {
    const result = registerRequestSchema.safeParse({
      email: 'not-an-email',
      password: 'Str0ng!Pass',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.path).toContain('email');
    }
  });

  it('should reject an empty email', () => {
    const result = registerRequestSchema.safeParse({
      email: '',
      password: 'Str0ng!Pass',
    });
    expect(result.success).toBe(false);
  });

  it('should reject a password shorter than 8 characters', () => {
    const result = registerRequestSchema.safeParse({
      email: 'user@example.com',
      password: 'Sh0rt!',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain('at least 8');
    }
  });

  it('should reject a password without uppercase letter', () => {
    const result = registerRequestSchema.safeParse({
      email: 'user@example.com',
      password: 'str0ng!pass',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain('uppercase');
    }
  });

  it('should reject a password without lowercase letter', () => {
    const result = registerRequestSchema.safeParse({
      email: 'user@example.com',
      password: 'STR0NG!PASS',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain('lowercase');
    }
  });

  it('should reject a password without a digit', () => {
    const result = registerRequestSchema.safeParse({
      email: 'user@example.com',
      password: 'Strong!Pass',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain('digit');
    }
  });

  it('should reject a password without a special character', () => {
    const result = registerRequestSchema.safeParse({
      email: 'user@example.com',
      password: 'Str0ngPass1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain('special character');
    }
  });

  it('should reject a password longer than 128 characters', () => {
    const longPassword = 'A' + 'a'.repeat(126) + '1!';
    const result = registerRequestSchema.safeParse({
      email: 'user@example.com',
      password: longPassword,
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing email field', () => {
    const result = registerRequestSchema.safeParse({
      password: 'Str0ng!Pass',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing password field', () => {
    const result = registerRequestSchema.safeParse({
      email: 'user@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('should reject email longer than 255 characters', () => {
    const longEmail = 'a'.repeat(250) + '@b.com';
    const result = registerRequestSchema.safeParse({
      email: longEmail,
      password: 'Str0ng!Pass',
    });
    expect(result.success).toBe(false);
  });
});

describe('verifyEmailRequestSchema', () => {
  it('should accept a valid token', () => {
    const result = verifyEmailRequestSchema.safeParse({
      token: 'abc123def456',
    });
    expect(result.success).toBe(true);
  });

  it('should reject an empty token', () => {
    const result = verifyEmailRequestSchema.safeParse({
      token: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing token field', () => {
    const result = verifyEmailRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('resendVerificationRequestSchema', () => {
  it('should accept a valid email and normalize it', () => {
    const result = resendVerificationRequestSchema.safeParse({
      email: '  User@Example.COM  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('should reject an invalid email format', () => {
    const result = resendVerificationRequestSchema.safeParse({
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing email field', () => {
    const result = resendVerificationRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('forgotPasswordRequestSchema', () => {
  it('should accept valid email and normalize it', () => {
    const result = forgotPasswordRequestSchema.safeParse({
      email: '  User@Example.COM  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('should reject invalid email format', () => {
    const result = forgotPasswordRequestSchema.safeParse({
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('resetPasswordRequestSchema', () => {
  it('should accept valid token and strong password', () => {
    const result = resetPasswordRequestSchema.safeParse({
      token: 'reset-token-123',
      password: 'NewStr0ng!Pass',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty token', () => {
    const result = resetPasswordRequestSchema.safeParse({
      token: '',
      password: 'NewStr0ng!Pass',
    });
    expect(result.success).toBe(false);
  });

  it('should reject weak password', () => {
    const result = resetPasswordRequestSchema.safeParse({
      token: 'reset-token-123',
      password: 'weak',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateSessionSettingsSchema', () => {
  it('should accept valid session timeout minutes within bounds', () => {
    const result = updateSessionSettingsSchema.safeParse({
      sessionTimeoutMinutes: 30,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionTimeoutMinutes).toBe(30);
    }
  });

  it('should accept boundary values 1 and 1440', () => {
    expect(updateSessionSettingsSchema.safeParse({ sessionTimeoutMinutes: 1 }).success).toBe(true);
    expect(updateSessionSettingsSchema.safeParse({ sessionTimeoutMinutes: 1440 }).success).toBe(true);
  });

  it('should reject non-integer numbers', () => {
    const result = updateSessionSettingsSchema.safeParse({
      sessionTimeoutMinutes: 15.5,
    });
    expect(result.success).toBe(false);
  });

  it('should reject values less than 1', () => {
    const result = updateSessionSettingsSchema.safeParse({
      sessionTimeoutMinutes: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject values greater than 1440', () => {
    const result = updateSessionSettingsSchema.safeParse({
      sessionTimeoutMinutes: 1441,
    });
    expect(result.success).toBe(false);
  });
});

describe('updateProfileRequestSchema', () => {
  it('should accept valid name, timezone, and email', () => {
    const result = updateProfileRequestSchema.safeParse({
      name: 'Alice Vance',
      timezone: 'America/New_York',
      email: '  Alice@Example.Com  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Alice Vance');
      expect(result.data.email).toBe('alice@example.com');
    }
  });

  it('should accept empty/optional profile object', () => {
    const result = updateProfileRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject invalid email format', () => {
    const result = updateProfileRequestSchema.safeParse({
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('verifyMfaSetupRequestSchema', () => {
  it('should accept valid 6-digit TOTP code', () => {
    const result = verifyMfaSetupRequestSchema.safeParse({ code: '123456' });
    expect(result.success).toBe(true);
  });

  it('should reject code that is not 6 digits', () => {
    expect(verifyMfaSetupRequestSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(verifyMfaSetupRequestSchema.safeParse({ code: '1234567' }).success).toBe(false);
    expect(verifyMfaSetupRequestSchema.safeParse({ code: 'abcdef' }).success).toBe(false);
  });
});

describe('loginMfaRequestSchema', () => {
  it('should accept valid mfaTicket and 6-digit TOTP code', () => {
    const result = loginMfaRequestSchema.safeParse({
      mfaTicket: 'mfa_user-123_1700000',
      code: '654321',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing mfaTicket or invalid code', () => {
    expect(loginMfaRequestSchema.safeParse({ mfaTicket: '', code: '654321' }).success).toBe(false);
    expect(loginMfaRequestSchema.safeParse({ mfaTicket: 'ticket', code: '123' }).success).toBe(false);
  });
});

describe('updateMfaEnforcementRequestSchema', () => {
  it('should accept valid mfaRequired boolean and roles array', () => {
    const result = updateMfaEnforcementRequestSchema.safeParse({
      mfaRequired: true,
      mfaRequiredRoles: ['admin', 'signer'],
    });
    expect(result.success).toBe(true);
  });

  it('should accept mfaRequired false with empty roles', () => {
    const result = updateMfaEnforcementRequestSchema.safeParse({
      mfaRequired: false,
    });
    expect(result.success).toBe(true);
  });
});
