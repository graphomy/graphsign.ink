import { describe, it, expect } from 'vitest';
import {
  isPersonalEmailDomain,
  extractEmailDomain,
  getPersonalEmailDomains,
} from './email-validation.js';

describe('email-validation utility', () => {
  it('extracts email domain properly', () => {
    expect(extractEmailDomain('user@gmail.com')).toBe('gmail.com');
    expect(extractEmailDomain('admin@ACME.COM')).toBe('acme.com');
    expect(extractEmailDomain('invalid-email')).toBe('');
  });

  it('identifies standard consumer/personal email domains', () => {
    expect(isPersonalEmailDomain('john@gmail.com')).toBe(true);
    expect(isPersonalEmailDomain('john@googlemail.com')).toBe(true);
    expect(isPersonalEmailDomain('sarah@yahoo.com')).toBe(true);
    expect(isPersonalEmailDomain('alex@hotmail.com')).toBe(true);
    expect(isPersonalEmailDomain('lisa@outlook.com')).toBe(true);
    expect(isPersonalEmailDomain('sam@icloud.com')).toBe(true);
    expect(isPersonalEmailDomain('dev@proton.me')).toBe(true);
  });

  it('allows valid business/company email domains', () => {
    expect(isPersonalEmailDomain('kunal@graphomy.com')).toBe(false);
    expect(isPersonalEmailDomain('admin@acmecorp.com')).toBe(false);
    expect(isPersonalEmailDomain('legal@company.co.uk')).toBe(false);
  });

  it('supports configurable domain additions', () => {
    expect(isPersonalEmailDomain('user@custompersonal.org')).toBe(false);
    expect(isPersonalEmailDomain('user@custompersonal.org', ['custompersonal.org'])).toBe(true);
    expect(getPersonalEmailDomains(['custompersonal.org']).has('custompersonal.org')).toBe(true);
  });
});
