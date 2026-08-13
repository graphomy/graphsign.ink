import { z } from 'zod';

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB (INK-206)
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

export const createUploadAgreementSchema = z.object({
  title: z.string().min(2, 'Agreement title must be at least 2 characters').max(255),
  description: z.string().max(1000).optional(),
  fileName: z.string().min(1, 'File name is required'),
  fileSize: z
    .number()
    .min(1, 'File size must be greater than 0')
    .max(
      MAX_FILE_SIZE_BYTES,
      'This file exceeds the maximum allowed upload size of 15 MB. Please reduce the file size or contact your administrator to adjust the upload limit.',
    ),
  mimeType: z
    .string()
    .refine(
      (val) => ALLOWED_MIME_TYPES.includes(val),
      'Invalid file format. Only PDF and DOCX files are allowed.',
    ),
  fileBase64: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const createScratchAgreementSchema = z.object({
  title: z.string().min(2, 'Agreement title must be at least 2 characters').max(255),
  description: z.string().max(1000).optional(),
  htmlContent: z
    .string()
    .min(1, 'Document content is required')
    .max(MAX_HTML_CONTENT_LENGTH, 'HTML content exceeds maximum allowed size (512KB)')
    .transform(sanitizeHtml),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateDraftSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional(),
  htmlContent: z
    .string()
    .max(MAX_HTML_CONTENT_LENGTH, 'HTML content exceeds maximum allowed size (512KB)')
    .transform(sanitizeHtml)
    .optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateMetadataTagsSchema = z.object({
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const queryAgreementsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.string().optional(),
  isArchived: z
    .union([z.boolean(), z.string()])
    .transform((val) => val === true || val === 'true')
    .optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
});

export type CreateUploadAgreementInput = z.infer<typeof createUploadAgreementSchema>;
export type CreateScratchAgreementInput = z.infer<typeof createScratchAgreementSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
export type UpdateMetadataTagsInput = z.infer<typeof updateMetadataTagsSchema>;
export type QueryAgreementsInput = z.infer<typeof queryAgreementsSchema>;
