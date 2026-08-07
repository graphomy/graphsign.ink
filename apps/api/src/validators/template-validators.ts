import { z } from 'zod';

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_HTML_CONTENT_LENGTH = 512 * 1024; // 512 KB

/**
 * Strips dangerous HTML elements and attributes to prevent XSS.
 * Removes script/iframe/object/embed/link tags, on* event handlers,
 * and javascript: protocol URLs.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/?script[^>]*>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<\/?iframe[^>]*>/gi, '')
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<\/?object[^>]*>/gi, '')
    .replace(/<embed[^>]*\/?>/gi, '')
    .replace(/<link[^>]*\/?>/gi, '')
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+on\w+\s*=\s*\S+/gi, '')
    .replace(/javascript\s*:/gi, '');
}

export const createTemplateSchema = z.object({
  title: z.string().min(2, 'Template title must be at least 2 characters').max(255),
  description: z.string().max(1000).optional(),
  fileName: z.string().optional(),
  fileSize: z.number().min(1).max(MAX_FILE_SIZE_BYTES, 'File size cannot exceed 25MB').optional(),
  mimeType: z
    .string()
    .refine(
      (val) => ALLOWED_MIME_TYPES.includes(val),
      'Invalid file format. Only PDF and DOCX files are allowed.',
    )
    .optional(),
  htmlContent: z
    .string()
    .max(MAX_HTML_CONTENT_LENGTH, 'HTML content exceeds maximum allowed size (512KB)')
    .transform(sanitizeHtml)
    .optional(),
  fields: z.array(z.record(z.unknown())).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const convertAgreementToTemplateSchema = z.object({
  agreementId: z.string().uuid('Invalid agreement ID'),
  title: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string()).optional(),
});

export const updateTemplateDraftSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional(),
  htmlContent: z
    .string()
    .max(MAX_HTML_CONTENT_LENGTH, 'HTML content exceeds maximum allowed size (512KB)')
    .transform(sanitizeHtml)
    .optional(),
  fields: z.array(z.record(z.unknown())).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const createTemplateVersionSchema = z.object({
  changeSummary: z.string().max(512).optional(),
  htmlContent: z.string().max(MAX_HTML_CONTENT_LENGTH).transform(sanitizeHtml).optional(),
  fields: z.array(z.record(z.unknown())).optional(),
});

export const shareTemplateSchema = z.object({
  targetType: z.enum(['user', 'team'], {
    errorMap: () => ({ message: "Target type must be 'user' or 'team'" }),
  }),
  targetId: z.string().uuid('Invalid target user or team ID'),
  accessLevel: z.enum(['USE', 'EDIT'], {
    errorMap: () => ({ message: "Access level must be 'USE' or 'EDIT'" }),
  }),
});

export const publishTemplateSchema = z.object({
  isPublished: z.boolean(),
});

export const instantiateTemplateSchema = z.object({
  title: z.string().min(2, 'Agreement title must be at least 2 characters').max(255).optional(),
  description: z.string().max(1000).optional(),
});

export const queryTemplatesSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  tag: z.string().optional(),
  isPublished: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === 'true')
    .optional(),
  isArchived: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === 'true')
    .optional(),
  view: z.enum(['library', 'mine', 'shared']).default('library'),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type ConvertAgreementToTemplateInput = z.infer<typeof convertAgreementToTemplateSchema>;
export type UpdateTemplateDraftInput = z.infer<typeof updateTemplateDraftSchema>;
export type CreateTemplateVersionInput = z.infer<typeof createTemplateVersionSchema>;
export type ShareTemplateInput = z.infer<typeof shareTemplateSchema>;
export type PublishTemplateInput = z.infer<typeof publishTemplateSchema>;
export type InstantiateTemplateInput = z.infer<typeof instantiateTemplateSchema>;
export type QueryTemplatesInput = z.infer<typeof queryTemplatesSchema>;
