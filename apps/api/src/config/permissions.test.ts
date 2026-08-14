import { describe, it, expect } from 'vitest';
import { PERMISSIONS, hasPermission } from './permissions.js';

describe('Permissions & Role Evaluation (FR-003.005 / INK-65)', () => {
  it('should define atomic permission constants', () => {
    expect(PERMISSIONS.DOCUMENTS_READ).toBe('documents:read');
    expect(PERMISSIONS.SUPER_ADMIN_MANAGE).toBe('super_admin:manage');
  });

  it('should grant super_admin all permissions implicitly', () => {
    expect(hasPermission('super_admin', 'super_admin:manage')).toBe(true);
    expect(hasPermission('super_admin', 'non_existent_permission')).toBe(true);
  });

  it('should evaluate org_admin permissions correctly', () => {
    expect(hasPermission('org_admin', PERMISSIONS.USERS_MANAGE)).toBe(true);
    expect(hasPermission('org_admin', PERMISSIONS.BRANDING_MANAGE)).toBe(true);
    expect(hasPermission('org_admin', PERMISSIONS.SUPER_ADMIN_MANAGE)).toBe(false);
  });

  it('should evaluate signer permissions correctly', () => {
    expect(hasPermission('signer', PERMISSIONS.SIGNATURES_SIGN)).toBe(true);
    expect(hasPermission('signer', PERMISSIONS.USERS_MANAGE)).toBe(false);
  });

  it('should evaluate auditor permissions correctly', () => {
    expect(hasPermission('auditor', PERMISSIONS.AUDIT_READ)).toBe(true);
    expect(hasPermission('auditor', PERMISSIONS.DOCUMENTS_CREATE)).toBe(false);
  });

  it('should respect customPermissions array if supplied', () => {
    expect(hasPermission('user', 'custom:action', ['custom:action'])).toBe(true);
    expect(hasPermission('user', 'custom:action', ['other:action'])).toBe(false);
  });
});
