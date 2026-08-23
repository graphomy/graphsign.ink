import { describe, it, expect, beforeEach } from 'vitest';
import { formatDate, formatDateTime, getUserTimezone, setUserTimezone } from './date-utils';

describe('date-utils (DD-MON-YYYY)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('formats a date string into DD-MON-YYYY in uppercase format', () => {
    const d = '2026-08-14T12:00:00Z';
    const result = formatDate(d, { timezone: 'GMT' });
    expect(result).toBe('14-AUG-2026');
  });

  it('formats another date with single-digit day into 2-digit day', () => {
    const d = '2026-01-05T00:00:00Z';
    const result = formatDate(d, { timezone: 'GMT' });
    expect(result).toBe('05-JAN-2026');
  });

  it('respects configured user timezone', () => {
    setUserTimezone('Asia/Kolkata');
    expect(getUserTimezone()).toBe('Asia/Kolkata');

    // 2026-08-13 23:00 UTC is 2026-08-14 in Asia/Kolkata (+5:30)
    const d = '2026-08-13T23:00:00Z';
    const result = formatDate(d);
    expect(result).toBe('14-AUG-2026');
  });

  it('falls back to GMT if no timezone set', () => {
    expect(getUserTimezone()).toBe('GMT');
    const d = '2026-08-13T23:00:00Z';
    const result = formatDate(d);
    expect(result).toBe('13-AUG-2026');
  });

  it('formats date and time together', () => {
    const d = '2026-08-14T15:30:00Z';
    const result = formatDateTime(d, { timezone: 'GMT' });
    expect(result).toBe('14-AUG-2026 15:30');
  });

  it('handles invalid or null date input safely', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('invalid-date')).toBe('');
    expect(formatDateTime(null)).toBe('');
  });
});
