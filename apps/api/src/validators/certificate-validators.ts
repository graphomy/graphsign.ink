import { z } from 'zod';

export const generateSelfSignedSchema = z.object({
  name: z.string().min(1, 'Certificate name is required').max(255),
  commonName: z.string().max(255).optional(),
  organization: z.string().max(255).optional(),
  organizationUnit: z.string().max(255).optional(),
  algorithm: z.enum(['RSA_2048', 'RSA_4096', 'ECDSA_P256', 'ECDSA_P384']).optional().default('RSA_2048'),
  validityDays: z.number().int().min(30).max(3650).optional().default(730),
  country: z.string().length(2).optional().default('US'),
  state: z.string().max(100).optional(),
  locality: z.string().max(100).optional(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
});

export const uploadByoCertificateSchema = z.object({
  name: z.string().min(1, 'Certificate name is required').max(255),
  certificatePem: z.string().min(1, 'Certificate PEM is required'),
  privateKeyPem: z.string().optional(),
  chainPem: z.string().optional(),
  algorithm: z.enum(['RSA_2048', 'RSA_4096', 'ECDSA_P256', 'ECDSA_P384']).optional().default('RSA_2048'),
  tsaUrl: z.string().url('Invalid TSA URL').optional(),
});

export const sealAgreementSchema = z.object({
  certificateId: z.string().uuid('Invalid certificate ID').optional(),
  pdfData: z.string().optional(),
});

export const batchSealSchema = z.object({
  agreementIds: z.array(z.string().uuid()).min(1, 'At least one agreement must be selected').max(100),
  certificateId: z.string().uuid().optional(),
});

export const verifyHashSchema = z.object({
  hash: z.string().min(1, 'Document hash is required'),
});

export const addTrustEntrySchema = z.object({
  provider: z.string().min(1).max(100),
  tsaUrl: z.string().url(),
  certificatePem: z.string().min(1),
});

export type GenerateSelfSignedInput = z.infer<typeof generateSelfSignedSchema>;
export type UploadByoCertificateInput = z.infer<typeof uploadByoCertificateSchema>;
export type SealAgreementInput = z.infer<typeof sealAgreementSchema>;
export type BatchSealInput = z.infer<typeof batchSealSchema>;
export type VerifyHashInput = z.infer<typeof verifyHashSchema>;
export type AddTrustEntryInput = z.infer<typeof addTrustEntrySchema>;
