import { z } from 'zod';

export const searchAgreementsSchema = z.object({
  q: z.string().trim().optional(),
  search: z.string().trim().optional(),
  status: z.string().trim().optional(),
  datePreset: z
    .enum(['today', 'week', 'last_7_days', 'month', 'last_30_days', 'last_90_days', 'custom', 'all'])
    .optional(),
  startDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    ),
  endDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    ),
  authorId: z.string().uuid().optional(),
  authorEmail: z.string().email().optional().or(z.string().trim().optional()),
  recipientEmail: z.string().trim().optional(),
  recipientName: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  tags: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string' && val.trim()) {
        return val
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
      }
      return undefined;
    })
    .optional(),
  documentType: z.enum(['all', 'pdf', 'markdown', 'docx']).optional(),
  isArchived: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === 'true')
    .optional(),
  sortBy: z
    .enum(['relevance', 'createdAt', 'updatedAt', 'title', 'status', 'expiresAt'])
    .default('updatedAt')
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
});

export const searchTemplatesSchema = z.object({
  q: z.string().trim().optional(),
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  isPublished: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === 'true')
    .optional(),
  isArchived: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === 'true')
    .optional(),
  sortBy: z
    .enum(['relevance', 'createdAt', 'updatedAt', 'title', 'version'])
    .default('updatedAt')
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
  page: z.coerce.number().int().positive().default(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20).optional(),
});

export const globalSearchSchema = z.object({
  q: z.string().trim().optional(),
  search: z.string().trim().optional(),
  entityType: z.enum(['all', 'agreements', 'templates']).default('all').optional(),
  limit: z.coerce.number().int().positive().max(50).default(10).optional(),
});

export const createFilterPresetSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Preset name is required')
    .max(100, 'Preset name cannot exceed 100 chars'),
  entityType: z.enum(['AGREEMENT', 'TEMPLATE']).default('AGREEMENT'),
  filters: z.record(z.string(), z.unknown()),
  isDefault: z.boolean().default(false).optional(),
});

export const updateFilterPresetSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  isDefault: z.boolean().optional(),
});

export type SearchAgreementsInput = z.input<typeof searchAgreementsSchema>;
export type SearchTemplatesInput = z.input<typeof searchTemplatesSchema>;
export type GlobalSearchInput = z.input<typeof globalSearchSchema>;
export type CreateFilterPresetInput = z.infer<typeof createFilterPresetSchema>;
export type UpdateFilterPresetInput = z.infer<typeof updateFilterPresetSchema>;
