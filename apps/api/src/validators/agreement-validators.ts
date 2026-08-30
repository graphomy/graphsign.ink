import { z } from 'zod';

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/markdown',
  'text/plain',
];

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB (INK-206)
export const MAX_MARKDOWN_CONTENT_LENGTH = 512 * 1024; // 512 KB

export const createUploadAgreementSchema = z
  .object({
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
        'Invalid file format. Only PDF, DOCX, and Markdown (.md) files are allowed.',
      ),
    fileBase64: z.string().optional(),
    markdownContent: z.string().max(MAX_MARKDOWN_CONTENT_LENGTH).optional(),
    isEncrypted: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((data) => !data.isEncrypted, {
    message:
      'The uploaded document is encrypted or password-protected. Please unlock or decrypt the document before uploading.',
    path: ['isEncrypted'],
  });

export const createScratchAgreementSchema = z.object({
  title: z.string().min(2, 'Agreement title must be at least 2 characters').max(255),
  description: z.string().max(1000).optional(),
  markdownContent: z
    .string()
    .min(1, 'Document markdown content is required')
    .max(MAX_MARKDOWN_CONTENT_LENGTH, 'Markdown content exceeds maximum allowed size (512KB)'),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateDraftSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional(),
  markdownContent: z
    .string()
    .max(MAX_MARKDOWN_CONTENT_LENGTH, 'Markdown content exceeds maximum allowed size (512KB)')
    .optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const activateAgreementSchema = z.object({
  comment: z.string().max(500).optional(),
});

export const updateMetadataTagsSchema = z.object({
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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
export type ActivateAgreementInput = z.infer<typeof activateAgreementSchema>;
export type UpdateMetadataTagsInput = z.infer<typeof updateMetadataTagsSchema>;
export type QueryAgreementsInput = z.infer<typeof queryAgreementsSchema>;
