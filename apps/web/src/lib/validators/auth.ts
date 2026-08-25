import { z } from 'zod';

/**
 * Password complexity requirements — shared between client and server.
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 */
const PASSWORD_MIN_LENGTH = 8;

/**
 * List of common consumer/personal webmail domains.
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

export function isPersonalEmailDomain(email: string, extraDomains?: string[]): boolean {
  if (!email || typeof email !== 'string') return false;
  const parts = email.trim().toLowerCase().split('@');
  if (parts.length !== 2 || !parts[1]) return false;
  const domain = parts[1];
  const blocked = new Set<string>(DEFAULT_PERSONAL_EMAIL_DOMAINS);
  if (extraDomains) {
    extraDomains.forEach((d) => blocked.add(d.toLowerCase().trim()));
  }
  return blocked.has(domain);
}

export const registerFormSchema = z
  .object({
    email: z
      .string()
      .min(1, 'Email is required.')
      .email('Please enter a valid email address.')
      .max(255, 'Email must be 255 characters or fewer.'),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(128, 'Password must be 128 characters or fewer.')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
      .regex(/[0-9]/, 'Password must contain at least one digit.')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character.'),
    confirmPassword: z.string().min(1, 'Please confirm your password.'),
    planType: z.enum(['individual', 'teams']).default('individual'),
    companyName: z.string().max(255, 'Company name must be 255 characters or fewer.').optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine(
    (data) => {
      if (data.planType === 'teams') {
        return !isPersonalEmailDomain(data.email);
      }
      return true;
    },
    {
      message:
        'Teams plan requires a company or business email address (e.g., alex@company.com). Please use your company email or choose the Individual plan.',
      path: ['email'],
    },
  );

export type RegisterFormData = z.infer<typeof registerFormSchema>;

export const loginFormSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required.')
    .email('Please enter a valid email address.')
    .max(255, 'Email must be 255 characters or fewer.'),
  password: z.string().min(1, 'Password is required.'),
});

export type LoginFormData = z.infer<typeof loginFormSchema>;

/**
 * Password strength checker — returns requirements with pass/fail status.
 */
export function getPasswordRequirements(password: string) {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One digit', met: /[0-9]/.test(password) },
    { label: 'One special character', met: /[^A-Za-z0-9]/.test(password) },
  ];
}
