import { describe, it, expect } from 'vitest';
import {
  isPersonalEmailDomain,
  isDisposableEmailDomain,
  isPersonalOrDisposableDomain,
  extractEmailDomain,
  getPersonalEmailDomains,
  getDisposableEmailDomains,
} from './email-validation.js';

describe('email-validation utility', () => {
  it('extracts email domain properly', () => {
    expect(extractEmailDomain('user@gmail.com')).toBe('gmail.com');
    expect(extractEmailDomain('admin@ACME.COM')).toBe('acme.com');
    expect(extractEmailDomain('acme.com')).toBe('acme.com');
    expect(extractEmailDomain('invalid-email')).toBe('invalid-email');
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

  it('identifies disposable/temporary email domains', () => {
    expect(isDisposableEmailDomain('user@mailinator.com')).toBe(true);
    expect(isDisposableEmailDomain('test@tempmail.com')).toBe(true);
    expect(isDisposableEmailDomain('anon@10minutemail.com')).toBe(true);
    expect(isDisposableEmailDomain('temp@sharklasers.com')).toBe(true);
    expect(isDisposableEmailDomain('user@acmecorp.com')).toBe(false);
  });

  it('correctly flags either personal or disposable domain', () => {
    expect(isPersonalOrDisposableDomain('user@gmail.com')).toBe(true);
    expect(isPersonalOrDisposableDomain('user@mailinator.com')).toBe(true);
    expect(isPersonalOrDisposableDomain('gmail.com')).toBe(true);
    expect(isPersonalOrDisposableDomain('mailinator.com')).toBe(true);
    expect(isPersonalOrDisposableDomain('acmecorp.com')).toBe(false);
    expect(isPersonalOrDisposableDomain('john@graphsign.ink')).toBe(false);
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
    expect(getDisposableEmailDomains(['disposablecustom.com']).has('disposablecustom.com')).toBe(
      true,
    );
  });
});
