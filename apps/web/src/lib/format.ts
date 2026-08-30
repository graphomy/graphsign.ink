/**
 * Format and null-safety helpers for graphsign.ink presentation layer.
 */

export const orDash = (v?: string | null): string => {
  if (!v || !v.trim()) return '—';
  return v.trim();
};

export const orLabel = (v: string | null | undefined, fallback: string): string => {
  if (!v || !v.trim()) return fallback;
  return v.trim();
};

/**
 * Mask an email address (e.g. kunal_p@live.in -> k••••_p@live.in)
 */
export const maskEmail = (email?: string | null): string => {
  if (!email || !email.includes('@')) return 'your email';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}••••@${domain}`;
  }
  const first = local[0];
  const lastPart = local.slice(-2);
  return `${first}••••${lastPart}@${domain}`;
};

/**
 * Formats a SHA-256 or envelope hash for compact display: prefix…suffix
 */
export const formatHash = (hash?: string | null, prefixLen = 8, suffixLen = 8): string => {
  if (!hash || hash.length <= prefixLen + suffixLen) return orDash(hash);
  return `${hash.slice(0, prefixLen)}…${hash.slice(-suffixLen)}`;
};
