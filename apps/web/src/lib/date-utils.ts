/**
 * Date Formatting Utility for graphsign.ink
 * Formats all dates in DD-MON-YYYY format (e.g., 14-AUG-2026).
 * Respects user's configured timezone with fallback to GMT/UTC.
 */

const MONTH_NAMES = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

/**
 * Retrieves user's preferred timezone from localStorage or falls back to 'GMT'.
 */
export function getUserTimezone(): string {
  if (typeof window === 'undefined') return 'GMT';
  try {
    const stored = localStorage.getItem('graphsign_user_timezone');
    if (stored && stored.trim()) {
      return stored.trim();
    }
  } catch {
    // Ignore error if localStorage inaccessible
  }
  return 'GMT';
}

/**
 * Sets user preferred timezone in localStorage.
 */
export function setUserTimezone(tz: string): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('graphsign_user_timezone', tz);
    } catch {
      // Ignore
    }
  }
}

interface FormatDateOptions {
  timezone?: string;
  uppercaseMonth?: boolean;
}

interface FormatDateTimeOptions extends FormatDateOptions {
  includeSeconds?: boolean;
  includeTimezone?: boolean;
}

/**
 * Formats a Date/string/number into DD-MON-YYYY (e.g. "14-AUG-2026").
 */
export function formatDate(
  dateInput: string | number | Date | null | undefined,
  options?: FormatDateOptions,
): string {
  if (!dateInput) return '';

  const date = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const tz = options?.timezone || getUserTimezone();

  // Use Intl.DateTimeFormat to break parts into target timezone
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz === 'GMT' ? 'UTC' : tz,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const parts = formatter.formatToParts(date);
    const day = parts.find((p) => p.type === 'day')?.value.padStart(2, '0') || '01';
    let month = parts.find((p) => p.type === 'month')?.value || 'JAN';
    const year = parts.find((p) => p.type === 'year')?.value || '1970';

    if (options?.uppercaseMonth !== false) {
      month = month.toUpperCase();
    }

    return `${day}-${month}-${year}`;
  } catch {
    // Fallback to UTC / GMT
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = MONTH_NAMES[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    return `${day}-${month}-${year}`;
  }
}

/**
 * Formats a Date/string/number into DD-MON-YYYY HH:mm (e.g. "14-AUG-2026 18:30 GMT").
 */
export function formatDateTime(
  dateInput: string | number | Date | null | undefined,
  options?: FormatDateTimeOptions,
): string {
  if (!dateInput) return '';

  const date = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const tz = options?.timezone || getUserTimezone();
  const dateStr = formatDate(date, options);

  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz === 'GMT' ? 'UTC' : tz,
      hour: '2-digit',
      minute: '2-digit',
      second: options?.includeSeconds ? '2-digit' : undefined,
      hour12: false,
    });

    const timeStr = formatter.format(date);
    const tzLabel = options?.includeTimezone ? ` (${tz})` : '';
    return `${dateStr} ${timeStr}${tzLabel}`;
  } catch {
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${dateStr} ${hours}:${minutes}`;
  }
}
