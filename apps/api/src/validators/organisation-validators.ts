import { z } from 'zod';

export const createOrganisationSchema = z.object({
  name: z.string().min(2, 'Organisation name must be at least 2 characters').max(255),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .optional(),
  domain: z.string().max(255).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address format'),
  role: z.string().min(1, 'Role is required').default('user'),
  teamId: z.string().uuid('Invalid team ID').optional(),
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
    .int('Retention period must be an integer number of days')
    .min(1, 'Retention period must be at least 1 day')
    .max(365, 'Retention period cannot exceed 365 days (1 year)')
    .optional(),
});

export const suspendOrganisationSchema = z.object({
  reason: z.string().max(500, 'Reason must not exceed 500 characters').optional(),
});

export const createTeamSchema = z.object({
  name: z.string().min(2, 'Team name must be at least 2 characters').max(255),
  description: z.string().max(512).optional(),
  leadId: z.string().uuid('Invalid team lead user ID').optional(),
});

export const addTeamMemberSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
});

export const createCustomRoleSchema = z.object({
  name: z.string().min(2, 'Role name must be at least 2 characters').max(100),
  description: z.string().max(255).optional(),
  permissions: z.array(z.string()).min(1, 'At least one permission must be assigned'),
});

export const updateMemberRoleSchema = z.object({
  role: z.string().min(1, 'Role is required'),
});

export const addDomainSchema = z.object({
  domain: z
    .string()
    .min(3, 'Domain name must be at least 3 characters')
    .max(255)
    .regex(/^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/, 'Invalid domain format'),
});

export const switchOrganisationSchema = z.object({
  targetOrganisationId: z.string().uuid('Invalid target organisation ID'),
});

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
  action: z.string().optional(),
  userId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;
export type UpdateOrganisationSettingsInput = z.infer<typeof updateOrganisationSettingsSchema>;
export type UpdateComplianceSettingsInput = z.infer<typeof updateComplianceSettingsSchema>;
export type SuspendOrganisationInput = z.infer<typeof suspendOrganisationSchema>;
export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type CreateCustomRoleInput = z.infer<typeof createCustomRoleSchema>;
export type AddDomainInput = z.infer<typeof addDomainSchema>;
export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;
