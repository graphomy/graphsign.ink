/**
 * Atomic permission registry for graphsign.ink RBAC.
 * Source of truth: FR-003.005 Configure permission levels (INK-65).
 */

export const PERMISSIONS = {
  // Document management
  DOCUMENTS_READ: 'documents:read',
  DOCUMENTS_CREATE: 'documents:create',
  DOCUMENTS_UPDATE: 'documents:update',
  DOCUMENTS_DELETE: 'documents:delete',

  // Template management
  TEMPLATES_READ: 'templates:read',
  TEMPLATES_MANAGE: 'templates:manage',
  TEMPLATES_PUBLISH: 'templates:publish',

  // Signing & Workflow
  SIGNATURES_SIGN: 'signatures:sign',
  AGREEMENTS_APPROVE: 'agreements:approve',
  AGREEMENTS_REVIEW: 'agreements:review',
  AGREEMENTS_SEND: 'agreements:send',

  // User & Team management
  USERS_READ: 'users:read',
  USERS_MANAGE: 'users:manage',
  TEAMS_MANAGE: 'teams:manage',

  // Roles & Custom Roles
  ROLES_READ: 'roles:read',
  ROLES_MANAGE: 'roles:manage',

  // Organisation Settings & Compliance
  ORGANISATION_READ: 'organisation:read',
  ORGANISATION_MANAGE: 'organisation:manage',
  BRANDING_MANAGE: 'branding:manage',
  COMPLIANCE_MANAGE: 'compliance:manage',

  // Audit Logs
  AUDIT_READ: 'audit:read',

  // Super Admin Management (Restricted to kunal@graphomy.com)
  SUPER_ADMIN_MANAGE: 'super_admin:manage',
} as const;

export type PermissionString = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Mapping matrix connecting default core roles to their default atomic permissions.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: Object.values(PERMISSIONS),
  org_admin: [
    PERMISSIONS.DOCUMENTS_READ,
    PERMISSIONS.DOCUMENTS_CREATE,
    PERMISSIONS.DOCUMENTS_UPDATE,
    PERMISSIONS.DOCUMENTS_DELETE,
    PERMISSIONS.TEMPLATES_READ,
    PERMISSIONS.TEMPLATES_MANAGE,
    PERMISSIONS.TEMPLATES_PUBLISH,
    PERMISSIONS.SIGNATURES_SIGN,
    PERMISSIONS.AGREEMENTS_APPROVE,
    PERMISSIONS.AGREEMENTS_REVIEW,
    PERMISSIONS.AGREEMENTS_SEND,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.TEAMS_MANAGE,
    PERMISSIONS.ROLES_READ,
    PERMISSIONS.ROLES_MANAGE,
    PERMISSIONS.ORGANISATION_READ,
    PERMISSIONS.ORGANISATION_MANAGE,
    PERMISSIONS.BRANDING_MANAGE,
    PERMISSIONS.COMPLIANCE_MANAGE,
    PERMISSIONS.AUDIT_READ,
  ],
  sender: [
    PERMISSIONS.DOCUMENTS_READ,
    PERMISSIONS.DOCUMENTS_CREATE,
    PERMISSIONS.DOCUMENTS_UPDATE,
    PERMISSIONS.DOCUMENTS_DELETE,
    PERMISSIONS.TEMPLATES_READ,
    PERMISSIONS.TEMPLATES_MANAGE,
    PERMISSIONS.TEMPLATES_PUBLISH,
    PERMISSIONS.AGREEMENTS_SEND,
    PERMISSIONS.USERS_READ,
  ],
  reviewer: [PERMISSIONS.DOCUMENTS_READ, PERMISSIONS.AGREEMENTS_REVIEW, PERMISSIONS.TEMPLATES_READ],
  approver: [
    PERMISSIONS.DOCUMENTS_READ,
    PERMISSIONS.AGREEMENTS_APPROVE,
    PERMISSIONS.AGREEMENTS_REVIEW,
    PERMISSIONS.TEMPLATES_READ,
  ],
  signer: [PERMISSIONS.DOCUMENTS_READ, PERMISSIONS.SIGNATURES_SIGN],
  auditor: [PERMISSIONS.DOCUMENTS_READ, PERMISSIONS.AUDIT_READ, PERMISSIONS.USERS_READ],
  user: [
    PERMISSIONS.DOCUMENTS_READ,
    PERMISSIONS.DOCUMENTS_CREATE,
    PERMISSIONS.DOCUMENTS_UPDATE,
    PERMISSIONS.DOCUMENTS_DELETE,
    PERMISSIONS.TEMPLATES_READ,
    PERMISSIONS.TEMPLATES_MANAGE,
    PERMISSIONS.TEMPLATES_PUBLISH,
    PERMISSIONS.AGREEMENTS_SEND,
  ],
};

/**
 * Evaluates whether a user role possesses a specific permission.
 */
export function hasPermission(
  role: string,
  permission: string,
  customPermissions?: string[],
): boolean {
  // Super admin manage permission is strictly restricted to super_admin role
  if (role === 'super_admin') return true;
  if (permission === PERMISSIONS.SUPER_ADMIN_MANAGE) return false;

  // Normalize legacy or shorthand permission aliases
  let normalizedPerm = permission;
  if (permission === 'document:read' || permission === 'documents:read')
    normalizedPerm = PERMISSIONS.DOCUMENTS_READ;
  if (
    permission === 'document:write' ||
    permission === 'documents:write' ||
    permission === 'documents:create'
  )
    normalizedPerm = PERMISSIONS.DOCUMENTS_CREATE;
  if (permission === 'template:read' || permission === 'templates:read')
    normalizedPerm = PERMISSIONS.TEMPLATES_READ;
  if (
    permission === 'template:write' ||
    permission === 'templates:write' ||
    permission === 'templates:create'
  )
    normalizedPerm = PERMISSIONS.TEMPLATES_MANAGE;

  if (role === 'org_admin' || role === 'admin') return true;

  const defaultPerms = DEFAULT_ROLE_PERMISSIONS[role] ?? DEFAULT_ROLE_PERMISSIONS['user'] ?? [];
  if (defaultPerms.includes(normalizedPerm) || defaultPerms.includes(permission)) return true;

  if (
    customPermissions &&
    (customPermissions.includes(normalizedPerm) || customPermissions.includes(permission))
  )
    return true;

  return false;
}
