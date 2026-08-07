import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RbacService } from './rbac-service.js';
import { ForbiddenError, BadRequestError } from '../utils/errors.js';

describe('RbacService Unit Tests (Epic INK-12)', () => {
  let mockPrisma: any;
  let mockAudit: any;
  let rbacService: RbacService;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      userOrganisation: {
        updateMany: vi.fn(),
        findFirst: vi.fn(),
      },
    };

    mockAudit = {
      log: vi.fn().mockResolvedValue(true),
    };

    rbacService = new RbacService(mockPrisma, mockAudit);
  });

  describe('listDefaultRoles (INK-61)', () => {
    it('should list all 7 core default roles', async () => {
      const roles = await rbacService.listDefaultRoles();
      expect(roles).toHaveLength(7);
      expect(roles.map((r) => r.id)).toContain('super_admin');
      expect(roles.map((r) => r.id)).toContain('org_admin');
      expect(roles.map((r) => r.id)).toContain('sender');
    });
  });

  describe('assignUserRole (INK-62 & INK-64)', () => {
    it('should update role and record audit log when valid', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'target-1',
        email: 'alice@acme.com',
        role: 'user',
        organisations: [{ organisationId: 'org-1', role: 'user' }],
      });
      mockPrisma.user.update.mockResolvedValue({
        id: 'target-1',
        email: 'alice@acme.com',
        role: 'sender',
      });

      const res = await rbacService.assignUserRole({
        actorUserId: 'admin-1',
        actorEmail: 'admin@acme.com',
        targetUserId: 'target-1',
        orgId: 'org-1',
        newRole: 'sender',
      });

      expect(res.user.role).toBe('sender');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_ROLE_UPDATED',
          userId: 'admin-1',
          resourceId: 'target-1',
        }),
      );
    });

    it('should throw ForbiddenError if non-kunal user tries to assign super_admin role', async () => {
      await expect(
        rbacService.assignUserRole({
          actorUserId: 'admin-1',
          actorEmail: 'imposter@acme.com',
          targetUserId: 'target-1',
          orgId: 'org-1',
          newRole: 'super_admin',
        }),
      ).rejects.toThrow(ForbiddenError);

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should allow kunal@graphomy.com to assign super_admin role', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'target-1',
        email: 'bob@graphomy.com',
        role: 'org_admin',
      });
      mockPrisma.user.update.mockResolvedValue({
        id: 'target-1',
        email: 'bob@graphomy.com',
        role: 'super_admin',
      });

      const res = await rbacService.assignUserRole({
        actorUserId: 'kunal-1',
        actorEmail: 'kunal@graphomy.com',
        targetUserId: 'target-1',
        orgId: 'org-1',
        newRole: 'super_admin',
      });

      expect(res.user.role).toBe('super_admin');
    });

    it('should throw BadRequestError for invalid role', async () => {
      await expect(
        rbacService.assignUserRole({
          actorUserId: 'admin-1',
          actorEmail: 'admin@acme.com',
          targetUserId: 'target-1',
          orgId: 'org-1',
          newRole: 'invalid_role_xyz',
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });
});
