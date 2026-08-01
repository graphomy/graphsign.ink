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
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type RegisterFormData = z.infer<typeof registerFormSchema>;

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
