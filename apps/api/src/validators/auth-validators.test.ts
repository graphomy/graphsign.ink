import { describe, it, expect } from 'vitest';
import {
  registerRequestSchema,
  verifyEmailRequestSchema,
  resendVerificationRequestSchema,
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
