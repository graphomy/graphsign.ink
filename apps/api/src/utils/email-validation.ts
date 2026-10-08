/**
 * Default list of consumer/personal webmail domains.
 * Configurable via BLOCKED_PERSONAL_EMAIL_DOMAINS environment variable.
 */
export const DEFAULT_PERSONAL_EMAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.co.in',
  'yahoo.fr',
  'yahoo.de',
  'yahoo.es',
  'ymail.com',
  'rocketmail.com',
  'hotmail.com',
  'hotmail.co.uk',
  'hotmail.fr',
  'hotmail.de',
  'hotmail.es',
  'outlook.com',
  'outlook.in',
  'live.com',
  'live.co.uk',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'aim.com',
  'protonmail.com',
  'proton.me',
  'zoho.com',
  'zohomail.com',
  'mail.com',
  'email.com',
  'gmx.com',
  'gmx.net',
  'gmx.de',
  'yandex.com',
  'yandex.ru',
  'mail.ru',
  'inbox.ru',
  'list.ru',
  'bk.ru',
  'tutanota.com',
  'tuta.io',
  'fastmail.com',
  'hushmail.com',
  'rediffmail.com',
] as const;

/**
 * Default list of disposable/temporary email domains.
 * Configurable via BLOCKED_DISPOSABLE_EMAIL_DOMAINS environment variable.
 */
export const DEFAULT_DISPOSABLE_EMAIL_DOMAINS = [
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'guerrillamail.block',
  'sharklasers.com',
  'throwawaymail.com',
  'yopmail.com',
  'getairmail.com',
  'temp-mail.org',
  'dispostable.com',
  'trashmail.com',
  'fakeinbox.com',
  'mytemp.email',
  'maildrop.cc',
  'inboxkitten.com',
  'generator.email',
] as const;

/**
 * Resolves the full set of personal email domains, including any configured
 * via the BLOCKED_PERSONAL_EMAIL_DOMAINS environment variable.
 */
export function getPersonalEmailDomains(extraDomains?: string[]): Set<string> {
  const domains = new Set<string>(DEFAULT_PERSONAL_EMAIL_DOMAINS);

  // Read environment variable if available
  const envBlocked =
    typeof process !== 'undefined' ? process.env?.BLOCKED_PERSONAL_EMAIL_DOMAINS : undefined;
  if (envBlocked) {
    envBlocked
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0)
      .forEach((d) => domains.add(d));
  }

  if (extraDomains) {
    extraDomains
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0)
      .forEach((d) => domains.add(d));
  }

  return domains;
}

/**
 * Resolves disposable email domains.
 */
export function getDisposableEmailDomains(extraDomains?: string[]): Set<string> {
  const domains = new Set<string>(DEFAULT_DISPOSABLE_EMAIL_DOMAINS);

  const envBlocked =
    typeof process !== 'undefined' ? process.env?.BLOCKED_DISPOSABLE_EMAIL_DOMAINS : undefined;
  if (envBlocked) {
    envBlocked
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0)
      .forEach((d) => domains.add(d));
  }

  if (extraDomains) {
    extraDomains
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0)
      .forEach((d) => domains.add(d));
  }

  return domains;
}

/**
 * Extracts the normalized domain part from an email address or domain string.
 */
export function extractEmailDomain(emailOrDomain: string): string {
  if (!emailOrDomain || typeof emailOrDomain !== 'string') return '';
  const trimmed = emailOrDomain.trim().toLowerCase();
  if (trimmed.includes('@')) {
    const parts = trimmed.split('@');
    return parts.length === 2 ? parts[1]! : '';
  }
  return trimmed;
}

/**
 * Checks if the given email belongs to a personal/consumer email provider.
 */
export function isPersonalEmailDomain(email: string, extraDomains?: string[]): boolean {
  const domain = extractEmailDomain(email);
  if (!domain) return false;
  const blocked = getPersonalEmailDomains(extraDomains);
  return blocked.has(domain);
}

/**
 * Checks if the given email belongs to a disposable/temporary email provider.
 */
export function isDisposableEmailDomain(email: string, extraDomains?: string[]): boolean {
  const domain = extractEmailDomain(email);
  if (!domain) return false;
  const blocked = getDisposableEmailDomains(extraDomains);
  return blocked.has(domain);
}

/**
 * Checks if the given email or domain is either personal or disposable.
 */
export function isPersonalOrDisposableDomain(emailOrDomain: string): boolean {
  const domain = extractEmailDomain(emailOrDomain);
  if (!domain) return true;
  return isPersonalEmailDomain(domain) || isDisposableEmailDomain(domain);
}
