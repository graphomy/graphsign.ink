import { z } from 'zod';

export const updatePlatformConfigSchema = z.object({
  key: z.string().min(1, 'Config key is required').max(100),
  value: z.string().min(1, 'Config value is required').max(500),
});

export const queryAdminUsersSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  organisationId: z.string().optional(),
});

export const queryAdminOrganisationsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  planType: z.string().optional(),
  status: z.string().optional(),
});

export const overrideOrganisationLimitsSchema = z.object({
  storageQuotaBytes: z.string().optional(),
  maxDocuments: z.number().int().min(1).optional(),
  maxUsers: z.number().int().min(1).optional(),
  planType: z.enum(['individual', 'teams']).optional(),
  reason: z.string().min(3, 'Reason is required for audit trail').max(500),
});

export const createFeatureFlagSchema = z.object({
  key: z
    .string()
    .min(2, 'Key must be at least 2 characters')
    .max(100)
    .regex(/^[a-z0-9_.-]+$/, 'Key must be lowercase alphanumeric with _, -, or .'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(255),
  description: z.string().max(500).optional(),
  isEnabled: z.boolean().default(false),
});

export const updateFeatureFlagSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(500).optional(),
  isEnabled: z.boolean().optional(),
  tenantOverrides: z.record(z.string(), z.boolean()).optional(),
});

export const setTenantFeatureFlagOverrideSchema = z.object({
  organisationId: z.string().min(1, 'Invalid organisation ID'),
  isEnabled: z.boolean(),
});

export const setMaintenanceModeSchema = z.object({
  isActive: z.boolean(),
  message: z.string().max(500).optional(),
  scope: z.enum(['platform', 'tenant', 'all']).default('platform'),
  targetTenantId: z.string().min(1).optional(),
});

export type UpdatePlatformConfigInput = z.infer<typeof updatePlatformConfigSchema>;
export type QueryAdminUsersInput = z.infer<typeof queryAdminUsersSchema>;
export type QueryAdminOrganisationsInput = z.infer<typeof queryAdminOrganisationsSchema>;
export type OverrideOrganisationLimitsInput = z.infer<typeof overrideOrganisationLimitsSchema>;
export type CreateFeatureFlagInput = z.infer<typeof createFeatureFlagSchema>;
export type UpdateFeatureFlagInput = z.infer<typeof updateFeatureFlagSchema>;
export type SetTenantFeatureFlagOverrideInput = z.infer<typeof setTenantFeatureFlagOverrideSchema>;
export type SetMaintenanceModeInput = z.infer<typeof setMaintenanceModeSchema>;
