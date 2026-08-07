import { describe, it, expect, vi } from 'vitest';
import { requireRole, requirePermission } from './rbac-middleware.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

describe('RBAC Middleware (INK-63)', () => {
  function createMockContext(store: Record<string, any>) {
    return {
      get: (key: string) => store[key],
    } as any;
  }

  describe('requireRole', () => {
    it('should allow access if user role matches allowed roles', async () => {
      const c = createMockContext({ userRole: 'org_admin', userEmail: 'admin@acme.com' });
      const next = vi.fn();

      await requireRole(['org_admin', 'super_admin'])(c, next);
      expect(next).toHaveBeenCalled();
    });

    it('should allow kunal@graphomy.com regardless of specified role', async () => {
      const c = createMockContext({ userRole: 'signer', userEmail: 'kunal@graphomy.com' });
      const next = vi.fn();

      await requireRole(['org_admin'])(c, next);
      expect(next).toHaveBeenCalled();
    });

    it('should throw ForbiddenError if role does not match', async () => {
      const c = createMockContext({ userRole: 'signer', userEmail: 'signer@acme.com' });
      const next = vi.fn();

      await expect(requireRole(['org_admin'])(c, next)).rejects.toThrow(ForbiddenError);
      expect(next).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedError if user is not authenticated', async () => {
      const c = createMockContext({});
      const next = vi.fn();

      await expect(requireRole(['org_admin'])(c, next)).rejects.toThrow(UnauthorizedError);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requirePermission', () => {
    it('should allow access if role has required permission', async () => {
      const c = createMockContext({ userRole: 'sender', userEmail: 'sender@acme.com' });
      const next = vi.fn();

      await requirePermission('documents:create')(c, next);
      expect(next).toHaveBeenCalled();
    });

    it('should throw ForbiddenError if role lacks permission', async () => {
      const c = createMockContext({ userRole: 'signer', userEmail: 'signer@acme.com' });
      const next = vi.fn();

      await expect(requirePermission('users:manage')(c, next)).rejects.toThrow(ForbiddenError);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
