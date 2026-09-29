import { describe, it, expect } from 'vitest';
import { orDash, orLabel, maskEmail, formatHash } from './format';

describe('format utilities', () => {
  describe('orDash', () => {
    it('returns em-dash for undefined, null, or whitespace-only inputs', () => {
      expect(orDash(undefined)).toBe('—');
      expect(orDash(null)).toBe('—');
      expect(orDash('')).toBe('—');
      expect(orDash('   ')).toBe('—');
    });

    it('returns trimmed string when value exists', () => {
      expect(orDash('NDA Agreement')).toBe('NDA Agreement');
      expect(orDash('  Sales Contract  ')).toBe('Sales Contract');
    });
  });

  describe('orLabel', () => {
    it('returns fallback for empty or whitespace inputs', () => {
      expect(orLabel(undefined, 'Untitled Document')).toBe('Untitled Document');
      expect(orLabel(null, 'Untitled Document')).toBe('Untitled Document');
      expect(orLabel('', 'Untitled Document')).toBe('Untitled Document');
      expect(orLabel('   ', 'Untitled Document')).toBe('Untitled Document');
    });

    it('returns trimmed string when value exists', () => {
      expect(orLabel('Master Service Agreement', 'Fallback')).toBe('Master Service Agreement');
    });
  });

  describe('maskEmail', () => {
    it('returns "your email" for null, undefined, or strings without @', () => {
      expect(maskEmail(null)).toBe('your email');
      expect(maskEmail(undefined)).toBe('your email');
      expect(maskEmail('')).toBe('your email');
      expect(maskEmail('invalidemail.com')).toBe('your email');
    });

    it('masks short usernames (<= 2 characters)', () => {
      expect(maskEmail('ab@example.com')).toBe('a••••@example.com');
      expect(maskEmail('k@graphsign.ink')).toBe('k••••@graphsign.ink');
    });

    it('masks standard usernames keeping first char and last 2 chars', () => {
      expect(maskEmail('kunal_p@live.in')).toBe('k••••_p@live.in');
      expect(maskEmail('john.doe@company.org')).toBe('j••••oe@company.org');
    });
  });

  describe('formatHash', () => {
    it('returns em-dash for empty or missing hash', () => {
      expect(formatHash(null)).toBe('—');
      expect(formatHash(undefined)).toBe('—');
      expect(formatHash('')).toBe('—');
    });

    it('returns full hash if length <= prefixLen + suffixLen', () => {
      expect(formatHash('abc12345')).toBe('abc12345');
    });

    it('truncates long hash with ellipsis in the middle', () => {
      const sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const formatted = formatHash(sha256, 8, 8);
      expect(formatted).toBe('e3b0c442…7852b855');
    });
  });
});
