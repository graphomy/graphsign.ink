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

export type UpdatePlatformConfigInput = z.infer<typeof updatePlatformConfigSchema>;
export type QueryAdminUsersInput = z.infer<typeof queryAdminUsersSchema>;
