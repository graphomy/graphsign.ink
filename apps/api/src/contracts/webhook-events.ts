import { z } from 'zod';

/**
 * Authoritative Webhook Event Registry and Schemas (INK-156, FR-017 PRD).
 */

export const WEBHOOK_EVENT_TYPES = [
  'document.created',
  'document.updated',
  'document.deleted',
  'document.sent',
  'document.viewed',
  'document.signed',
  'document.completed',
  'document.declined',
  'document.voided',
  'document.expired',
  'document.verified',
  'user.created',
  'user.updated',
  'user.role_changed',
  'user.removed',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface WebhookEventDefinition {
  type: WebhookEventType;
  description: string;
  category: 'document' | 'user';
  filterableFields: string[];
  selectableFields: string[];
  sampleData: Record<string, unknown>;
}

export const WEBHOOK_EVENT_REGISTRY: Record<WebhookEventType, WebhookEventDefinition> = {
  'document.created': {
    type: 'document.created',
    description: 'Triggered when a new document or agreement aggregate is created.',
    category: 'document',
    filterableFields: ['document_id', 'status', 'folder'],
    selectableFields: [
      'document_id',
      'document_name',
      'status',
      'folder',
      'mime_type',
      'file_size',
    ],
    sampleData: {
      document_id: '018e4cf2-832c-7b9d-92a0-8d5f302b1111',
      document_name: 'Master-Service-Agreement.pdf',
      status: 'DRAFT',
      folder: 'Legal',
      mime_type: 'application/pdf',
      file_size: 1048576,
    },
  },
  'document.updated': {
    type: 'document.updated',
    description: 'Triggered when document editable fields, metadata, or draft content changes.',
    category: 'document',
    filterableFields: ['document_id', 'status', 'folder'],
    selectableFields: ['document_id', 'document_name', 'status', 'folder', 'version'],
    sampleData: {
      document_id: '018e4cf2-832c-7b9d-92a0-8d5f302b1111',
      document_name: 'Master-Service-Agreement.pdf',
      status: 'DRAFT',
      folder: 'Legal',
      version: '0.2',
    },
  },
  'document.deleted': {
    type: 'document.deleted',
    description: 'Triggered when a document is soft-deleted.',
    category: 'document',
    filterableFields: ['document_id', 'folder'],
    selectableFields: ['document_id', 'document_name', 'folder'],
    sampleData: {
      document_id: '018e4cf2-832c-7b9d-92a0-8d5f302b1111',
      document_name: 'Master-Service-Agreement.pdf',
      folder: 'Legal',
    },
  },
  'document.sent': {
    type: 'document.sent',
    description: 'Triggered when an agreement is published and dispatched to signers.',
    category: 'document',
    filterableFields: ['document_id', 'folder', 'signing_order'],
    selectableFields: [
      'document_id',
      'document_name',
      'status',
      'folder',
      'recipient_count',
      'signing_order',
    ],
    sampleData: {
      document_id: '018e4cf2-832c-7b9d-92a0-8d5f302b1111',
      document_name: 'Master-Service-Agreement.pdf',
      status: 'SENT',
      folder: 'Legal',
      recipient_count: 2,
      signing_order: 'PARALLEL',
    },
  },
  'document.viewed': {
    type: 'document.viewed',
    description: 'Triggered when a recipient opens and views the document for the first time.',
    category: 'document',
    filterableFields: ['document_id', 'recipient_id', 'folder'],
    selectableFields: ['document_id', 'document_name', 'recipient_id', 'signer_email', 'folder'],
    sampleData: {
      document_id: '018e4cf2-832c-7b9d-92a0-8d5f302b1111',
      document_name: 'Master-Service-Agreement.pdf',
      recipient_id: '018e4cf2-832c-7b9d-92a0-8d5f302b2222',
      signer_email: 'signer@example.test',
      folder: 'Legal',
    },
  },
  'document.signed': {
    type: 'document.signed',
    description: 'Triggered when an individual recipient successfully executes their signature.',
    category: 'document',
    filterableFields: ['document_id', 'recipient_id', 'folder'],
    selectableFields: [
      'document_id',
      'document_name',
      'status',
      'recipient_id',
      'signer_email',
      'folder',
    ],
    sampleData: {
      document_id: '018e4cf2-832c-7b9d-92a0-8d5f302b1111',
      document_name: 'Master-Service-Agreement.pdf',
      status: 'SENT',
      recipient_id: '018e4cf2-832c-7b9d-92a0-8d5f302b2222',
      signer_email: 'signer@example.test',
      folder: 'Legal',
    },
  },
  'document.completed': {
    type: 'document.completed',
    description:
      'Triggered after all signers have signed and the cryptographic PAdES seal is stored.',
    category: 'document',
    filterableFields: ['document_id', 'folder'],
    selectableFields: [
      'document_id',
      'document_name',
      'status',
      'verification_token',
      'document_hash',
      'folder',
    ],
    sampleData: {
      document_id: '018e4cf2-832c-7b9d-92a0-8d5f302b1111',
      document_name: 'Master-Service-Agreement.pdf',
      status: 'COMPLETED',
      verification_token: 'GS-a1b2c3d4',
      document_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      folder: 'Legal',
    },
  },
  'document.declined': {
    type: 'document.declined',
    description: 'Triggered when a recipient declines to sign.',
    category: 'document',
    filterableFields: ['document_id', 'recipient_id', 'folder'],
    selectableFields: ['document_id', 'document_name', 'status', 'recipient_id', 'folder'],
    sampleData: {
      document_id: '018e4cf2-832c-7b9d-92a0-8d5f302b1111',
      document_name: 'Master-Service-Agreement.pdf',
      status: 'DECLINED',
      recipient_id: '018e4cf2-832c-7b9d-92a0-8d5f302b2222',
      folder: 'Legal',
    },
  },
  'document.voided': {
    type: 'document.voided',
    description: 'Triggered when an active agreement is cancelled/voided by the author or admin.',
    category: 'document',
    filterableFields: ['document_id', 'folder'],
    selectableFields: ['document_id', 'document_name', 'status', 'folder'],
    sampleData: {
      document_id: '018e4cf2-832c-7b9d-92a0-8d5f302b1111',
      document_name: 'Master-Service-Agreement.pdf',
      status: 'CANCELLED',
      folder: 'Legal',
    },
  },
  'document.expired': {
    type: 'document.expired',
    description: 'Triggered when a document passes its expiration deadline without full signature.',
    category: 'document',
    filterableFields: ['document_id', 'folder'],
    selectableFields: ['document_id', 'document_name', 'status', 'folder'],
    sampleData: {
      document_id: '018e4cf2-832c-7b9d-92a0-8d5f302b1111',
      document_name: 'Master-Service-Agreement.pdf',
      status: 'EXPIRED',
      folder: 'Legal',
    },
  },
  'document.verified': {
    type: 'document.verified',
    description:
      'Triggered when a stored sealed document signature is verified via API or public portal.',
    category: 'document',
    filterableFields: ['document_id', 'verification_token'],
    selectableFields: [
      'document_id',
      'verification_token',
      'document_hash',
      'pades_level',
      'status',
    ],
    sampleData: {
      document_id: '018e4cf2-832c-7b9d-92a0-8d5f302b1111',
      verification_token: 'GS-a1b2c3d4',
      document_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      pades_level: 'B_T',
      status: 'SUCCESS',
    },
  },
  'user.created': {
    type: 'user.created',
    description: 'Triggered when a new user joins or is invited to the tenant organisation.',
    category: 'user',
    filterableFields: ['user_id', 'role'],
    selectableFields: ['user_id', 'email', 'role', 'status'],
    sampleData: {
      user_id: '018e4cf2-832c-7b9d-92a0-8d5f302b3333',
      email: 'member@example.test',
      role: 'user',
      status: 'active',
    },
  },
  'user.updated': {
    type: 'user.updated',
    description: 'Triggered when a user profile or settings are updated within the tenant.',
    category: 'user',
    filterableFields: ['user_id', 'role'],
    selectableFields: ['user_id', 'email', 'role'],
    sampleData: {
      user_id: '018e4cf2-832c-7b9d-92a0-8d5f302b3333',
      email: 'member@example.test',
      role: 'user',
    },
  },
  'user.role_changed': {
    type: 'user.role_changed',
    description: 'Triggered when a user role or permissions are modified within the tenant.',
    category: 'user',
    filterableFields: ['user_id', 'old_role', 'new_role'],
    selectableFields: ['user_id', 'email', 'old_role', 'new_role'],
    sampleData: {
      user_id: '018e4cf2-832c-7b9d-92a0-8d5f302b3333',
      email: 'member@example.test',
      old_role: 'user',
      new_role: 'admin',
    },
  },
  'user.removed': {
    type: 'user.removed',
    description: 'Triggered when a member is removed from the organisation.',
    category: 'user',
    filterableFields: ['user_id'],
    selectableFields: ['user_id', 'email'],
    sampleData: {
      user_id: '018e4cf2-832c-7b9d-92a0-8d5f302b3333',
      email: 'member@example.test',
    },
  },
};

/**
 * Standard Webhook Delivery Envelope (INK-156).
 */
export interface WebhookEnvelope<T = Record<string, unknown>> {
  id: string;
  event: WebhookEventType;
  schemaVersion: string;
  timestamp: string;
  organisationId: string;
  sequence: number;
  test: boolean;
  data: T;
}

export const webhookEnvelopeSchema = z.object({
  id: z.string().uuid(),
  event: z.enum(WEBHOOK_EVENT_TYPES),
  schemaVersion: z.string().default('1.0'),
  timestamp: z.string().datetime({ offset: true }),
  organisationId: z.string().uuid(),
  sequence: z.number().int().positive(),
  test: z.boolean().default(false),
  data: z.record(z.string(), z.unknown()),
});
