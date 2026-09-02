import { z } from 'zod';

export const FIELD_TYPES = [
  'SIGNATURE',
  'INITIALS',
  'TEXT',
  'DATE',
  'COMPANY',
  'EMAIL',
  'CHECKBOX',
  'RADIO',
  'DROPDOWN',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const fieldValidationSchema = z.object({
  type: z.enum(['none', 'email', 'number', 'regex']).default('none'),
  pattern: z.string().max(255).optional(),
  errorMessage: z.string().max(255).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().min(0).optional(),
  maxLength: z.number().max(10000).optional(),
});

export const fieldOptionSchema = z.object({
  label: z.string().min(1).max(100),
  value: z.string().min(1).max(100),
});

export const recipientSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  email: z.string().email().optional().or(z.literal('')).default(''),
  role: z.enum(['signer', 'approver', 'viewer']).default('signer'),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Invalid hex color code'),
});

export const documentFieldSchema = z.object({
  id: z.string().min(1),
  type: z.enum(FIELD_TYPES),
  pageNumber: z.number().int().min(1).default(1),
  x: z.number().min(0).max(100), // percentage coordinates (0 - 100%)
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
  label: z.string().max(100).default(''),
  placeholder: z.string().max(255).optional(),
  defaultValue: z.union([z.string(), z.boolean()]).optional(),
  recipientId: z.string().min(1),
  isRequired: z.boolean().default(false),
  validation: fieldValidationSchema.optional(),
  options: z.array(fieldOptionSchema).optional(),
  groupName: z.string().max(100).optional(),
  dateFormat: z.string().max(50).optional(),
});

export const saveDocumentFieldsSchema = z.object({
  fields: z.array(documentFieldSchema),
  recipients: z.array(recipientSchema).default([]),
});

export type DocumentField = z.infer<typeof documentFieldSchema>;
export type Recipient = z.infer<typeof recipientSchema>;
export type SaveDocumentFieldsInput = z.infer<typeof saveDocumentFieldsSchema>;
