import type { PrismaClient } from '@graphsign/db';
import { DEFAULT_ROLES, isSuperAdmin, type RoleDefinition } from '../config/roles.js';
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, hasPermission } from '../config/permissions.js';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors.js';
import type { AuditService } from './audit-service.js';

export interface AssignRoleParams {
  actorUserId: string;
  actorEmail: string;
  targetUserId: string;
  orgId: string;
  newRole: string;
}

export class RbacService {
  constructor(
    private prisma: PrismaClient,
    private audit?: AuditService,
  ) {}

  /**
   * List all default core system roles (FR-003.001 / INK-61)
   */
  async listDefaultRoles(): Promise<RoleDefinition[]> {
    return DEFAULT_ROLES;
  }

  /**
   * List atomic permissions registry (FR-003.005 / INK-65)
   */
  getPermissionRegistry(): Record<string, string> {
    return PERMISSIONS;
  }

  /**
   * Assign or update a user's role with super_admin guard and audit logging (FR-003.002 & FR-003.004 / INK-62 & INK-64)
   */
  async assignUserRole(params: AssignRoleParams) {
    const { actorUserId, actorEmail, targetUserId, orgId, newRole } = params;

    // Validate role exists in default roles or custom roles
    const validDefaultRoles = DEFAULT_ROLES.map((r) => r.id);
    if (!validDefaultRoles.includes(newRole)) {
      throw new BadRequestError(
        `Invalid role '${newRole}'. Valid default roles: ${validDefaultRoles.join(', ')}`,
      );
    }

    // Super Admin security constraint: strictly limited to kunal@graphomy.com
    if (newRole === 'super_admin' && !isSuperAdmin(actorEmail)) {
      throw new ForbiddenError(
        'Only designated platform super admins are authorized to assign the super_admin role.',
      );
    }

    // Find target user
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { memberships: { where: { organisationId: orgId } } },
    });

    if (!targetUser) {
      throw new NotFoundError(`Target user '${targetUserId}' not found.`);
    }

    const currentRole = targetUser.role || 'user';

    // Update org-scoped junction role only — never mutate global User.role
    await this.prisma.userOrganisation.updateMany({
      where: { userId: targetUserId, organisationId: orgId },
      data: { role: newRole },
    });

    // Audit role change (FR-003.004 / INK-64)
    if (this.audit) {
      await this.audit.log({
        organisationId: orgId,
        userId: actorUserId,
        action: 'USER_ROLE_UPDATED',
        resourceType: 'User',
        resourceId: targetUserId,
        metadata: {
          targetUserId,
          targetUserEmail: targetUser.email,
          previousRole: currentRole,
          newRole,
          assignedBy: actorEmail,
        },
      });
    }

    return {
      message: `Role for user '${targetUser.email}' updated to '${newRole}'.`,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: newRole,
        updatedAt: new Date(),
      },
    };
  }

  /**
   * Retrieve effective role and permissions for a user in an organisation
   */
  async getUserPermissions(userId: string, orgId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      throw new NotFoundError('User not found.');
    }

    const userOrg = await this.prisma.userOrganisation.findFirst({
      where: { userId, organisationId: orgId },
      select: { role: true },
    });

    const effectiveRole = isSuperAdmin(user.email)
      ? 'super_admin'
      : userOrg?.role || user.role || 'user';
    const permissions = DEFAULT_ROLE_PERMISSIONS[effectiveRole] ?? DEFAULT_ROLE_PERMISSIONS['user'];

    return {
      userId: user.id,
      email: user.email,
      role: effectiveRole,
      permissions,
    };
  }

  /**
   * Helper to check permission
   */
  checkPermission(role: string, permission: string): boolean {
    return hasPermission(role, permission);
  }
}
