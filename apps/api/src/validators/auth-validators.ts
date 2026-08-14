import { z } from 'zod';

/**
 * Password complexity requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 */
const PASSWORD_MIN_LENGTH = 8;

export const registerRequestSchema = z.object({
  email: z
    .string()
    .transform((val) => val.toLowerCase().trim())
    .pipe(
      z
        .string()
        .email('Please enter a valid email address.')
        .max(255, 'Email must be 255 characters or fewer.'),
    ),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(128, 'Password must be 128 characters or fewer.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
    .regex(/[0-9]/, 'Password must contain at least one digit.')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character.'),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const registerResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  status: z.string(),
  createdAt: z.string().datetime(),
  message: z.string(),
});

export type RegisterResponse = z.infer<typeof registerResponseSchema>;

export const loginRequestSchema = z.object({
  email: z
    .string()
    .transform((val) => val.toLowerCase().trim())
    .pipe(
      z
        .string()
        .email('Please enter a valid email address.')
        .max(255, 'Email must be 255 characters or fewer.'),
    ),
  password: z.string().min(1, 'Password is required.'),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  status: z.string(),
  token: z.string(),
  organisationId: z.string().uuid(),
  message: z.string(),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(1, 'Verification token is required.'),
});

export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const resendVerificationRequestSchema = z.object({
  email: z
    .string()
    .transform((val) => val.toLowerCase().trim())
    .pipe(
      z
        .string()
        .email('Please enter a valid email address.')
        .max(255, 'Email must be 255 characters or fewer.'),
    ),
});

export type ResendVerificationRequest = z.infer<typeof resendVerificationRequestSchema>;

export const resendVerificationResponseSchema = z.object({
  message: z.string(),
});

export type ResendVerificationResponse = z.infer<typeof resendVerificationResponseSchema>;

export const forgotPasswordRequestSchema = z.object({
  email: z
    .string()
    .transform((val) => val.toLowerCase().trim())
    .pipe(
      z
        .string()
        .email('Please enter a valid email address.')
        .max(255, 'Email must be 255 characters or fewer.'),
    ),
});

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const forgotPasswordResponseSchema = z.object({
  message: z.string(),
});

export type ForgotPasswordResponse = z.infer<typeof forgotPasswordResponseSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1, 'Reset token is required.'),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(128, 'Password must be 128 characters or fewer.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
    .regex(/[0-9]/, 'Password must contain at least one digit.')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character.'),
});

export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const resetPasswordResponseSchema = z.object({
  message: z.string(),
});

export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;

export const mfaToggleResponseSchema = z.object({
  message: z.string(),
});

export type MfaToggleResponse = z.infer<typeof mfaToggleResponseSchema>;

export const updateSessionSettingsSchema = z.object({
  sessionTimeoutMinutes: z
    .number({ required_error: 'sessionTimeoutMinutes is required.' })
    .int('sessionTimeoutMinutes must be an integer.')
    .min(1, 'Session timeout must be at least 1 minute.')
    .max(1440, 'Session timeout cannot exceed 1440 minutes (24 hours).'),
});

export type UpdateSessionSettingsRequest = z.infer<typeof updateSessionSettingsSchema>;

export const sessionSettingsResponseSchema = z.object({
  sessionTimeoutMinutes: z.number(),
  message: z.string().optional(),
});

export type SessionSettingsResponse = z.infer<typeof sessionSettingsResponseSchema>;

export const validateSessionRequestSchema = z.object({
  lastActiveAt: z.number().optional(),
});

export type ValidateSessionRequest = z.infer<typeof validateSessionRequestSchema>;

export const updateProfileRequestSchema = z.object({
  name: z.string().max(255, 'Name must be 255 characters or fewer.').optional(),
  timezone: z.string().max(100, 'Timezone must be 100 characters or fewer.').optional(),
  email: z
    .string()
    .transform((val) => val.toLowerCase().trim())
    .pipe(
      z
        .string()
        .email('Please enter a valid email address.')
        .max(255, 'Email must be 255 characters or fewer.'),
    )
    .optional(),
});

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(128, 'Password must be 128 characters or fewer.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
    .regex(/[0-9]/, 'Password must contain at least one digit.')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character.'),
});

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const verifyEmailChangeRequestSchema = z.object({
  token: z.string().min(1, 'Verification token is required.'),
});

export type VerifyEmailChangeRequest = z.infer<typeof verifyEmailChangeRequestSchema>;

export const profileResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  status: z.string(),
  pendingEmail: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  mfaEnabled: z.boolean().optional(),
  role: z.string().optional(),
});

export type ProfileResponse = z.infer<typeof profileResponseSchema>;

export const verifyMfaSetupRequestSchema = z.object({
  code: z
    .string({ required_error: 'Verification code is required.' })
    .length(6, 'Verification code must be exactly 6 digits.')
    .regex(/^\d+$/, 'Verification code must contain digits only.'),
});

export type VerifyMfaSetupRequest = z.infer<typeof verifyMfaSetupRequestSchema>;

export const loginMfaRequestSchema = z.object({
  mfaTicket: z.string().min(1, 'MFA ticket is required.'),
  code: z
    .string({ required_error: 'Verification code is required.' })
    .length(6, 'Verification code must be 6 digits.')
    .regex(/^\d+$/, 'Verification code must contain digits only.'),
});

export type LoginMfaRequest = z.infer<typeof loginMfaRequestSchema>;

export const disableMfaRequestSchema = z.object({
  codeOrPassword: z.string().optional(),
});

export type DisableMfaRequest = z.infer<typeof disableMfaRequestSchema>;

export const updateMfaEnforcementRequestSchema = z.object({
  mfaRequired: z.boolean(),
  mfaRequiredRoles: z.array(z.string()).optional(),
});

export type UpdateMfaEnforcementRequest = z.infer<typeof updateMfaEnforcementRequestSchema>;

export const mfaEnforcementResponseSchema = z.object({
  mfaRequired: z.boolean(),
  mfaRequiredRoles: z.array(z.string()),
});

export type MfaEnforcementResponse = z.infer<typeof mfaEnforcementResponseSchema>;
