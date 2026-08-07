import { z } from 'zod';

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const createUploadAgreementSchema = z.object({
  title: z.string().min(2, 'Agreement title must be at least 2 characters').max(255),
  description: z.string().max(1000).optional(),
  fileName: z.string().min(1, 'File name is required'),
  fileSize: z
    .number()
    .min(1, 'File size must be greater than 0')
    .max(MAX_FILE_SIZE_BYTES, 'File size cannot exceed 25MB'),
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
  htmlContent: z.string().min(1, 'Document content is required'),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateDraftSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional(),
  htmlContent: z.string().optional(),
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
