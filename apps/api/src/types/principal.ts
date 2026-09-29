/**
 * Typed RequestPrincipal carrying authenticated identity and granted scopes.
 * Used across API routes and domain services (INK-148, FR-016.006, FR-016.007).
 */
export type PrincipalKind = 'user' | 'service' | 'signer' | 'system';

export interface RequestPrincipal {
  /** Discriminator for authenticated entity. */
  kind: PrincipalKind;
  /** Principal ID: userId for users, clientId for service bindings, token identifier for signers. */
  id: string;
  /** Active organisation UUID for multi-tenant boundary. */
  organisationId: string;
  /** User UUID if kind is user or designated acting member of service client. */
  userId?: string;
  /** User email if available. */
  email?: string;
  /** Assigned roles (e.g., ['admin'], ['editor'], ['viewer']). */
  roles: string[];
  /** Granted permissions/scopes (e.g. ['documents:read', 'documents:create']). */
  scopes: string[];
  /** Authentication issuer (e.g., local URL or Zitadel OIDC issuer). */
  issuer: string;
  /** Traceable request ID. */
  requestId: string;
  /** Optional client binding ID for machine-to-machine integrations. */
  clientBindingId?: string;
}

/** Standard scope identifiers for machine clients and fine-grained permissions. */
export const API_SCOPES = {
  DOCUMENTS_READ: 'documents:read',
  DOCUMENTS_CREATE: 'documents:create',
  DOCUMENTS_UPDATE: 'documents:update',
  DOCUMENTS_DELETE: 'documents:delete',
  TEMPLATES_READ: 'templates:read',
  AUDIT_READ: 'audit:read',
  WEBHOOKS_READ: 'webhooks:read',
  WEBHOOKS_MANAGE: 'webhooks:manage',
  WEBHOOKS_REPLAY: 'webhooks:replay',
  API_CLIENTS_MANAGE: 'api_clients:manage',
  API_LOGS_READ: 'api_logs:read',
  ADMIN_METRICS_READ: 'admin:metrics:read',
  ADMIN_POLICIES_MANAGE: 'admin:policies:manage',
} as const;

export type ApiScope = (typeof API_SCOPES)[keyof typeof API_SCOPES];
