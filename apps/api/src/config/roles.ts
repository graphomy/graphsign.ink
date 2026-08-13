/**
 * Default Core Roles Definition.
 * Source of truth: FR-003.001 Define default roles (INK-61).
 */

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  hierarchyLevel: number;
  isSystemRole: boolean;
  defaultPermissions: string[];
}

export const SUPER_ADMIN_EMAIL = 'kunal@graphomy.com';

/**
 * Resolves superadmin email(s) from environment variable SUPERADMIN_ID.
 * Falls back to the hardcoded legacy email if env var is not set.
 * Supports comma-separated multiple emails.
 */
export function getSuperAdminEmails(): string[] {
  const envValue = process.env.SUPERADMIN_ID || '';
  const emails = envValue
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);

  // Fallback to legacy hardcoded value if env var is not set
  if (emails.length === 0 && SUPER_ADMIN_EMAIL) {
    return [SUPER_ADMIN_EMAIL.toLowerCase()];
  }

  return emails;
}

/**
 * Checks if the given email belongs to a platform super admin.
 * Reads from SUPERADMIN_ID environment variable (comma-separated).
 */
export function isSuperAdmin(email: string): boolean {
  if (!email) return false;
  return getSuperAdminEmails().includes(email.toLowerCase());
}

export const DEFAULT_ROLES: RoleDefinition[] = [
  {
    id: 'super_admin',
    name: 'Super Admin',
    description:
      'Platform super administrator with unrestricted global access. Restricted to kunal@graphomy.com.',
    hierarchyLevel: 100,
    isSystemRole: true,
    defaultPermissions: [
      'documents:read',
      'documents:create',
      'documents:update',
      'documents:delete',
      'templates:read',
      'templates:manage',
      'signatures:sign',
      'agreements:approve',
      'agreements:review',
      'agreements:send',
      'users:read',
      'users:manage',
      'teams:manage',
      'roles:read',
      'roles:manage',
      'organisation:read',
      'organisation:manage',
      'branding:manage',
      'compliance:manage',
      'audit:read',
      'super_admin:manage',
    ],
  },
  {
    id: 'org_admin',
    name: 'Organisation Admin',
    description:
      'Administrator managing users, teams, branding, compliance, and settings within an organisation.',
    hierarchyLevel: 80,
    isSystemRole: true,
    defaultPermissions: [
      'documents:read',
      'documents:create',
      'documents:update',
      'documents:delete',
      'templates:read',
      'templates:manage',
      'signatures:sign',
      'agreements:approve',
      'agreements:review',
      'agreements:send',
      'users:read',
      'users:manage',
      'teams:manage',
      'roles:read',
      'roles:manage',
      'organisation:read',
      'organisation:manage',
      'branding:manage',
      'compliance:manage',
      'audit:read',
    ],
  },
  {
    id: 'sender',
    name: 'Sender / Author',
    description:
      'Document author capable of creating templates, sending agreements, and managing documents.',
    hierarchyLevel: 60,
    isSystemRole: true,
    defaultPermissions: [
      'documents:read',
      'documents:create',
      'documents:update',
      'templates:read',
      'templates:manage',
      'agreements:send',
      'users:read',
    ],
  },
  {
    id: 'approver',
    name: 'Approver',
    description: 'User responsible for approving documents in multi-step signing workflows.',
    hierarchyLevel: 50,
    isSystemRole: true,
    defaultPermissions: [
      'documents:read',
      'agreements:approve',
      'agreements:review',
      'templates:read',
    ],
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description:
      'User responsible for reviewing and commenting on documents before sending or signing.',
    hierarchyLevel: 40,
    isSystemRole: true,
    defaultPermissions: ['documents:read', 'agreements:review', 'templates:read'],
  },
  {
    id: 'signer',
    name: 'Signer',
    description: 'Recipient or user authorized to sign assigned documents and agreements.',
    hierarchyLevel: 20,
    isSystemRole: true,
    defaultPermissions: ['documents:read', 'signatures:sign'],
  },
  {
    id: 'auditor',
    name: 'Auditor',
    description:
      'Read-only compliance auditor with full access to organisation audit logs and records.',
    hierarchyLevel: 30,
    isSystemRole: true,
    defaultPermissions: ['documents:read', 'audit:read', 'users:read'],
  },
  {
    id: 'user',
    name: 'User',
    description: 'Default role with read-only access to documents.',
    hierarchyLevel: 10,
    isSystemRole: true,
    defaultPermissions: ['documents:read'],
  },
];
