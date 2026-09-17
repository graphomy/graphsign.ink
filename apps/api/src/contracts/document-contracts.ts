import { z } from 'zod';

/**
 * REST API document contracts and validation schemas (INK-146, INK-147).
 */

export const documentMetadataSchema = z
  .object({
    folder: z.string().max(100).optional(),
  })
  .passthrough();

export const createDocumentSchema = z.object({
  name: z.string().min(1, "Field 'name' is required").max(255),
  content: z.string().min(1, "Field 'content' is required"),
  contentEncoding: z.enum(['utf-8', 'base64']).default('utf-8'),
  mimeType: z.enum(['application/pdf', 'text/markdown', 'text/plain']).optional(),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional().default([]),
  metadata: documentMetadataSchema.optional().default({}),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const replaceDocumentSchema = z.object({
  name: z.string().min(1, "Field 'name' is required").max(255),
  content: z.string().optional(),
  contentEncoding: z.enum(['utf-8', 'base64']).default('utf-8'),
  mimeType: z.enum(['application/pdf', 'text/markdown', 'text/plain']).optional(),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional().default([]),
  metadata: documentMetadataSchema.optional().default({}),
  expectedRevision: z.number().int().optional(),
});

export type ReplaceDocumentInput = z.infer<typeof replaceDocumentSchema>;

export const patchDocumentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  metadata: documentMetadataSchema.optional(),
  expectedRevision: z.number().int().optional(),
});

export type PatchDocumentInput = z.infer<typeof patchDocumentSchema>;

export const documentQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
    status: z
      .enum(['DRAFT', 'SENT', 'IN_PROGRESS', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED'])
      .optional(),
    folder: z.string().max(100).optional(),
    search: z.string().max(200).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    sort: z.enum(['createdAt', 'updatedAt', 'title', 'name']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine((data) => !(data.page !== undefined && data.cursor !== undefined), {
    message: 'Cannot combine page-based pagination with cursor-based pagination',
    path: ['cursor'],
  });

export type DocumentQueryInput = z.infer<typeof documentQuerySchema>;

export interface DocumentDto {
  id: string;
  name: string;
  description: string | null;
  status: string;
  version: string;
  mimeType: string;
  fileSize: number;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentListResponse {
  data: DocumentDto[];
  pagination: {
    total?: number;
    page?: number;
    limit: number;
    hasMore: boolean;
    nextCursor?: string | null;
  };
}

/**
 * Maps an internal Agreement aggregate to the canonical public DocumentDto.
 */
export function toDocumentDto(agreement: any): DocumentDto {
  const meta =
    agreement.metadata && typeof agreement.metadata === 'object' ? { ...agreement.metadata } : {};

  // Strip internal fields from public metadata
  delete (meta as any).signedPdfBase64;
  delete (meta as any).sealedPdfBase64;
  delete (meta as any).fileBase64;
  delete (meta as any).fileData;
  delete (meta as any).signingTokenHash;
  delete (meta as any).verificationToken;

  return {
    id: agreement.id,
    name: agreement.title || agreement.fileName || 'Untitled Document',
    description: agreement.description ?? null,
    status: agreement.status,
    version: agreement.version || '0.1',
    mimeType: agreement.mimeType || 'application/pdf',
    fileSize: agreement.fileSize || 0,
    tags: Array.isArray(agreement.tags) ? agreement.tags : [],
    metadata: meta,
    createdAt:
      agreement.createdAt instanceof Date ? agreement.createdAt.toISOString() : agreement.createdAt,
    updatedAt:
      agreement.updatedAt instanceof Date ? agreement.updatedAt.toISOString() : agreement.updatedAt,
  };
}
