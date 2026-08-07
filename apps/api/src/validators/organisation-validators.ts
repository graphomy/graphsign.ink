import { z } from 'zod';

export const createOrganisationSchema = z.object({
  name: z.string().min(2, 'Organisation name must be at least 2 characters').max(255),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address format'),
  role: z.enum(['org_admin', 'author', 'reviewer', 'signer', 'user']).default('user'),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(10, 'Invalid invitation token'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(255).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128).optional(),
});

export const updateBrandingSchema = z.object({
  logoUrl: z.string().url('Invalid logo URL').max(512).nullable().optional(),
  primaryColor: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color code')
    .nullable()
    .optional(),
  secondaryColor: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color code')
    .nullable()
    .optional(),
  companyAddress: z.string().max(512).nullable().optional(),
  defaultSenderName: z.string().max(255).nullable().optional(),
  emailFooterText: z.string().max(1000).nullable().optional(),
});

export const updateOrganisationSettingsSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(255).optional(),
  sessionTimeoutMinutes: z
    .number()
    .min(5, 'Session timeout must be at least 5 minutes')
    .max(1440, 'Session timeout cannot exceed 24 hours (1440 minutes)')
    .optional(),
  mfaRequired: z.boolean().optional(),
  mfaRequiredRoles: z.array(z.string()).optional(),
});

export const updateComplianceSettingsSchema = z.object({
  allowedEsignStandards: z
    .array(z.enum(['ESIGN', 'UETA', 'eIDAS_SES', 'eIDAS_AES', 'eIDAS_QES', 'PART_11']))
    .optional(),
  requireReauthBeforeSigning: z.boolean().optional(),
  signatureReasonRequired: z.boolean().optional(),
  documentRetentionDays: z
    .number()
    .min(1, 'Retention period must be at least 1 day')
    .max(3650, 'Retention period cannot exceed 10 years')
    .optional(),
});

export const suspendOrganisationSchema = z.object({
  reason: z.string().max(500, 'Reason must not exceed 500 characters').optional(),
});

export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;
export type UpdateOrganisationSettingsInput = z.infer<typeof updateOrganisationSettingsSchema>;
export type UpdateComplianceSettingsInput = z.infer<typeof updateComplianceSettingsSchema>;
export type SuspendOrganisationInput = z.infer<typeof suspendOrganisationSchema>;
