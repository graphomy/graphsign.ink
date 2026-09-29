import { describe, it, expect } from 'vitest';
import { registerFormSchema, isPersonalEmailDomain, getPasswordRequirements } from './auth';

describe('Web Auth Validators (INK-265)', () => {
  describe('isPersonalEmailDomain', () => {
    it('detects common consumer email domains', () => {
      expect(isPersonalEmailDomain('alex@gmail.com')).toBe(true);
      expect(isPersonalEmailDomain('alex@yahoo.com')).toBe(true);
      expect(isPersonalEmailDomain('alex@hotmail.com')).toBe(true);
      expect(isPersonalEmailDomain('alex@outlook.com')).toBe(true);
      expect(isPersonalEmailDomain('alex@protonmail.com')).toBe(true);
      expect(isPersonalEmailDomain('alex@icloud.com')).toBe(true);
    });

    it('identifies custom corporate/company email domains as business', () => {
      expect(isPersonalEmailDomain('alex@acme.com')).toBe(false);
      expect(isPersonalEmailDomain('kunal@graphomy.com')).toBe(false);
      expect(isPersonalEmailDomain('john@company.co.uk')).toBe(false);
    });

    it('supports custom extra domain blacklists', () => {
      expect(isPersonalEmailDomain('alex@tempmail.io', ['tempmail.io'])).toBe(true);
    });
  });

  describe('registerFormSchema with planType', () => {
    const validPassword = 'SecurePassword1!';

    it('accepts individual plan signup with personal email address', () => {
      const result = registerFormSchema.safeParse({
        email: 'alex@gmail.com',
        password: validPassword,
        confirmPassword: validPassword,
        planType: 'individual',
      });
      expect(result.success).toBe(true);
    });

    it('accepts teams plan signup with business company email address', () => {
      const result = registerFormSchema.safeParse({
        email: 'alex@acme-corp.com',
        password: validPassword,
        confirmPassword: validPassword,
        planType: 'teams',
        companyName: 'Acme Corporation',
      });
      expect(result.success).toBe(true);
    });

    it('rejects teams plan signup with consumer webmail email address', () => {
      const result = registerFormSchema.safeParse({
        email: 'alex@gmail.com',
        password: validPassword,
        confirmPassword: validPassword,
        planType: 'teams',
        companyName: 'Acme Corporation',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('company or business email address');
      }
    });

    it('validates password mismatch', () => {
      const result = registerFormSchema.safeParse({
        email: 'alex@example.com',
        password: validPassword,
        confirmPassword: 'DifferentPassword1!',
        planType: 'individual',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Passwords do not match.');
      }
    });
  });

  describe('getPasswordRequirements', () => {
    it('evaluates complexity criteria correctly', () => {
      const weak = getPasswordRequirements('abc');
      expect(weak.filter((r) => r.met).length).toBe(1); // only lowercase

      const strong = getPasswordRequirements('Str0ng!Pass');
      expect(strong.every((r) => r.met)).toBe(true);
    });
  });
});
