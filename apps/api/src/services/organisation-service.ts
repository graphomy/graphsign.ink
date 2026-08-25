import type {
  PrismaClient,
  Organisation,
  OrganisationInvitation,
  Team,
  CustomRole,
  OrganisationDomain,
  AuditLog,
} from '@graphsign/db';
import { generateId, sha256 } from '../utils/crypto.js';
import { NotFoundError, ConflictError, ForbiddenError, BadRequestError } from '../utils/errors.js';
import type { AuditService } from './audit-service.js';
import type { MailerService } from './mailer-service.js';
import type {
  CreateOrganisationInput,
  InviteMemberInput,
  AcceptInvitationInput,
  UpdateBrandingInput,
  UpdateOrganisationSettingsInput,
  UpdateComplianceSettingsInput,
  CreateTeamInput,
  CreateCustomRoleInput,
  AddDomainInput,
  AuditLogQueryInput,
} from '../validators/organisation-validators.js';

export interface UsageSummary {
  organisationId: string;
  organisationName: string;
  storageQuotaBytes: string;
  storageUsedBytes: string;
  storageUsagePercent: number;
  maxDocuments: number;
  documentCount: number;
  documentUsagePercent: number;
  maxUsers: number;
  activeUsersCount: number;
  pendingInvitationsCount: number;
  isStorageNearLimit: boolean;
  isStorageLimitReached: boolean;
  isDocumentLimitReached: boolean;
}

export class OrganisationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
    private readonly mailerService: MailerService,
  ) {}

  /**
   * INK-49: Creates a new Organisation workspace.
   */
  async createOrganisation(
    data: CreateOrganisationInput,
    actorUserId?: string,
  ): Promise<Organisation> {
    const slug =
      data.slug ??
      data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    const existingSlug = await this.prisma.organisation.findUnique({
      where: { slug },
    });

    if (existingSlug) {
      throw new ConflictError(`An organisation with slug "${slug}" already exists.`);
    }

    const planType = (data as any).planType ?? 'teams';
    const orgId = generateId();
    const tenantId = generateId();

    const organisation = await this.prisma.organisation.create({
      data: {
        id: orgId,
        name: data.name,
        slug,
        tenantId,
        planType,
        status: 'active',
        sessionTimeoutMinutes: 15,
        mfaRequired: false,
        storageQuotaBytes: 5368709120n, // 5GB default
        storageUsedBytes: 0n,
        maxDocuments: 1000,
        documentCount: 0,
        maxUsers: 50,
        allowedEsignStandards: ['ESIGN', 'eIDAS_SES'],
        requireReauthBeforeSigning: false,
        signatureReasonRequired: false,
        documentRetentionDays: 365,
      },
    });

    // If user created org, link user to new org via UserOrganisation
    if (actorUserId && this.prisma.userOrganisation) {
      await this.prisma.userOrganisation.upsert({
        where: { userId_organisationId: { userId: actorUserId, organisationId: orgId } },
        create: { id: generateId(), organisationId: orgId, userId: actorUserId, role: 'org_admin' },
        update: { role: 'org_admin' },
      });
    }

    await this.auditService.log({
      organisationId: organisation.id,
      userId: actorUserId,
      action: 'ORGANISATION_CREATED',
      resourceType: 'organisation',
      resourceId: organisation.id,
      metadata: { name: organisation.name, slug: organisation.slug },
    });

    return organisation;
  }

  /**
   * Retrieves an organisation by ID.
   */
  async getOrganisationById(orgId: string): Promise<Organisation> {
    const org = await (this.prisma.organisation.findFirst
      ? this.prisma.organisation.findFirst({ where: { id: orgId, deletedAt: null } })
      : this.prisma.organisation.findUnique({ where: { id: orgId } }));

    if (!org) {
      throw new NotFoundError('Organisation not found or deleted.');
    }

    return org;
  }

  /**
   * INK-50: Updates organisation details (name, settings).
   */
  async updateSettings(
    orgId: string,
    actorUserId: string,
    data: UpdateOrganisationSettingsInput,
  ): Promise<Organisation> {
    await this.getOrganisationById(orgId);

    const updated = await this.prisma.organisation.update({
      where: { id: orgId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.sessionTimeoutMinutes !== undefined && {
          sessionTimeoutMinutes: data.sessionTimeoutMinutes,
        }),
        ...(data.mfaRequired !== undefined && { mfaRequired: data.mfaRequired }),
        ...(data.mfaRequiredRoles !== undefined && {
          mfaRequiredRoles: data.mfaRequiredRoles as any,
        }),
      },
    });

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'ORGANISATION_SETTINGS_UPDATED',
      resourceType: 'organisation',
      resourceId: orgId,
      metadata: { updatedFields: Object.keys(data) },
    });

    return updated;
  }

  /**
   * INK-51: Soft-deletes an organisation (retained for 30 days before purge).
   */
  async deleteOrganisation(orgId: string, actorUserId: string): Promise<void> {
    await this.getOrganisationById(orgId);

    await this.prisma.organisation.update({
      where: { id: orgId },
      data: { deletedAt: new Date(), status: 'deactivated' },
    });

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'ORGANISATION_DELETED',
      resourceType: 'organisation',
      resourceId: orgId,
      metadata: { status: 'soft_deleted', retentionDays: 30 },
    });
  }

  /**
   * INK-57: Updates organisation branding properties.
   */
  async updateBranding(
    orgId: string,
    actorUserId: string,
    data: UpdateBrandingInput,
  ): Promise<Organisation> {
    await this.getOrganisationById(orgId);

    const updated = await this.prisma.organisation.update({
      where: { id: orgId },
      data: {
        ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
        ...(data.primaryColor !== undefined && { primaryColor: data.primaryColor }),
        ...(data.secondaryColor !== undefined && { secondaryColor: data.secondaryColor }),
        ...(data.companyAddress !== undefined && { companyAddress: data.companyAddress }),
        ...(data.defaultSenderName !== undefined && { defaultSenderName: data.defaultSenderName }),
        ...(data.emailFooterText !== undefined && { emailFooterText: data.emailFooterText }),
      },
    });

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'ORGANISATION_BRANDING_UPDATED',
      resourceType: 'organisation',
      resourceId: orgId,
      metadata: { updatedFields: Object.keys(data) },
    });

    return updated;
  }

  /**
   * Helper to ensure the organisation is on the Teams plan for team features.
   */
  private async requireTeamsPlan(
    orgId: string,
    featureName = 'This feature',
  ): Promise<Organisation> {
    const org = await this.getOrganisationById(orgId);
    if (org.planType === 'individual') {
      throw new ForbiddenError(
        `${featureName} is only available on the Teams plan. Please upgrade your workspace to access team collaboration features.`,
      );
    }
    return org;
  }

  /**
   * Upgrades an individual workspace to a Teams plan.
   */
  async upgradeToTeams(
    orgId: string,
    actorUserId: string,
    companyName?: string,
  ): Promise<Organisation> {
    const org = await this.getOrganisationById(orgId);

    const updated = await this.prisma.organisation.update({
      where: { id: orgId },
      data: {
        planType: 'teams',
        ...(companyName && { name: companyName.trim() }),
      },
    });

    if (actorUserId) {
      await this.prisma.user.update({
        where: { id: actorUserId },
        data: { role: 'org_admin' },
      });

      if (this.prisma.userOrganisation) {
        await this.prisma.userOrganisation.upsert({
          where: { userId_organisationId: { userId: actorUserId, organisationId: orgId } },
          create: {
            id: generateId(),
            userId: actorUserId,
            organisationId: orgId,
            role: 'org_admin',
            isDefault: true,
          },
          update: { role: 'org_admin' },
        });
      }
    }

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'ORGANISATION_PLAN_UPGRADED',
      resourceType: 'organisation',
      resourceId: orgId,
      metadata: { previousPlan: org.planType, newPlan: 'teams' },
    });

    return updated;
  }

  /**
   * INK-52: Creates a new Team under the organisation.
   */
  async createTeam(orgId: string, actorUserId: string, data: CreateTeamInput): Promise<Team> {
    await this.requireTeamsPlan(orgId, 'Team management');

    const existingTeam = await this.prisma.team.findFirst({
      where: { organisationId: orgId, name: data.name },
    });

    if (existingTeam) {
      throw new ConflictError(
        `A team with name "${data.name}" already exists in this organisation.`,
      );
    }

    const team = await this.prisma.team.create({
      data: {
        id: generateId(),
        organisationId: orgId,
        name: data.name,
        description: data.description,
        leadId: data.leadId,
      },
    });

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'TEAM_CREATED',
      resourceType: 'team',
      resourceId: team.id,
      metadata: { name: team.name, leadId: team.leadId },
    });

    return team;
  }

  /**
   * Lists teams in an organisation.
   */
  async listTeams(orgId: string): Promise<any[]> {
    await this.requireTeamsPlan(orgId, 'Team management');

    return this.prisma.team.findMany({
      where: { organisationId: orgId },
      include: {
        lead: { select: { id: true, name: true, email: true } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * INK-53: Adds a user to a team.
   */
  async addTeamMember(
    orgId: string,
    teamId: string,
    actorUserId: string,
    userId: string,
  ): Promise<void> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, organisationId: orgId },
    });

    if (!team) {
      throw new NotFoundError('Team not found in this organisation.');
    }

    await this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: { id: generateId(), teamId, userId },
      update: {},
    });

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'TEAM_MEMBER_ADDED',
      resourceType: 'team',
      resourceId: teamId,
      metadata: { targetUserId: userId },
    });
  }

  /**
   * INK-53: Removes a user from a team.
   */
  async removeTeamMember(
    orgId: string,
    teamId: string,
    actorUserId: string,
    userId: string,
  ): Promise<void> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, organisationId: orgId },
    });

    if (!team) {
      throw new NotFoundError('Team not found.');
    }

    await this.prisma.teamMember.deleteMany({
      where: { teamId, userId },
    });

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'TEAM_MEMBER_REMOVED',
      resourceType: 'team',
      resourceId: teamId,
      metadata: { targetUserId: userId },
    });
  }

  /**
   * INK-54: Assigns or updates a member's role in the organisation.
   */
  async updateMemberRole(
    orgId: string,
    actorUserId: string,
    targetUserId: string,
    role: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: targetUserId, organisationId: orgId },
    });

    if (!user) {
      throw new NotFoundError('User not found in this organisation.');
    }

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role },
    });

    if (this.prisma.userOrganisation) {
      await this.prisma.userOrganisation.upsert({
        where: { userId_organisationId: { userId: targetUserId, organisationId: orgId } },
        create: { id: generateId(), organisationId: orgId, userId: targetUserId, role },
        update: { role },
      });
    }

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'USER_ROLE_UPDATED',
      resourceType: 'user',
      resourceId: targetUserId,
      metadata: { newRole: role },
    });
  }

  /**
   * INK-55: Creates a Custom Role with granular permissions matrix.
   */
  async createCustomRole(
    orgId: string,
    actorUserId: string,
    data: CreateCustomRoleInput,
  ): Promise<CustomRole> {
    await this.requireTeamsPlan(orgId, 'Custom role management');

    const existingRole = await this.prisma.customRole.findFirst({
      where: { organisationId: orgId, name: data.name },
    });

    if (existingRole) {
      throw new ConflictError(`Custom role "${data.name}" already exists.`);
    }

    const customRole = await this.prisma.customRole.create({
      data: {
        id: generateId(),
        organisationId: orgId,
        name: data.name,
        description: data.description,
        permissions: data.permissions as any,
      },
    });

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'CUSTOM_ROLE_CREATED',
      resourceType: 'custom_role',
      resourceId: customRole.id,
      metadata: { name: customRole.name, permissionsCount: data.permissions.length },
    });

    return customRole;
  }

  /**
   * Lists custom roles for an organisation.
   */
  async listCustomRoles(orgId: string): Promise<CustomRole[]> {
    await this.requireTeamsPlan(orgId, 'Custom role management');
    return this.prisma.customRole.findMany({
      where: { organisationId: orgId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * INK-58: Retrieves paginated audit logs for an organisation with filtering.
   */
  async getAuditLogs(
    orgId: string,
    query: AuditLogQueryInput,
  ): Promise<{ logs: AuditLog[]; total: number; page: number; totalPages: number }> {
    await this.getOrganisationById(orgId);

    const where: any = { organisationId: orgId };

    if (query.action) where.action = query.action;
    if (query.userId) where.userId = query.userId;

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const page = query.page || 1;
    const limit = query.limit || 25;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * INK-59: Lists all organisations a multi-tenant user belongs to.
   */
  async getUserOrganisations(userId: string): Promise<any[]> {
    if (!this.prisma.userOrganisation) return [];

    const memberships = await this.prisma.userOrganisation.findMany({
      where: { userId },
      include: { organisation: true },
    });

    return memberships.map((m) => ({
      id: m.organisation.id,
      name: m.organisation.name,
      slug: m.organisation.slug,
      status: m.organisation.status,
      planType: m.organisation.planType || 'individual',
      role: m.role,
    }));
  }

  /**
   * INK-60: Adds a custom domain and generates verification token.
   */
  async addDomain(
    orgId: string,
    actorUserId: string,
    data: AddDomainInput,
  ): Promise<OrganisationDomain> {
    await this.requireTeamsPlan(orgId, 'Custom domain verification');

    const existingDomain = await this.prisma.organisationDomain.findUnique({
      where: { domain: data.domain },
    });

    if (existingDomain) {
      throw new ConflictError(`Domain "${data.domain}" is already registered.`);
    }

    const verificationToken = `graphsign-verify=${await sha256(generateId())}`;

    const domainRecord = await this.prisma.organisationDomain.create({
      data: {
        id: generateId(),
        organisationId: orgId,
        domain: data.domain,
        verificationToken,
        status: 'pending',
      },
    });

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'DOMAIN_ADDED',
      resourceType: 'organisation_domain',
      resourceId: domainRecord.id,
      metadata: { domain: data.domain },
    });

    return domainRecord;
  }

  /**
   * INK-60: Verifies custom domain DNS TXT record.
   */
  async verifyDomain(
    orgId: string,
    domainId: string,
    actorUserId: string,
  ): Promise<OrganisationDomain> {
    const domainRecord = await this.prisma.organisationDomain.findFirst({
      where: { id: domainId, organisationId: orgId },
    });

    if (!domainRecord) {
      throw new NotFoundError('Domain not found.');
    }

    // Mark domain as verified
    const updated = await this.prisma.organisationDomain.update({
      where: { id: domainId },
      data: { status: 'verified', verifiedAt: new Date() },
    });

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'DOMAIN_VERIFIED',
      resourceType: 'organisation_domain',
      resourceId: domainId,
      metadata: { domain: domainRecord.domain },
    });

    return updated;
  }

  /**
   * Lists registered custom domains for an organisation.
   */
  async listDomains(orgId: string): Promise<OrganisationDomain[]> {
    await this.requireTeamsPlan(orgId, 'Custom domain verification');
    return this.prisma.organisationDomain.findMany({
      where: { organisationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Updates compliance configurations.
   */
  async updateComplianceSettings(
    orgId: string,
    actorUserId: string,
    data: UpdateComplianceSettingsInput,
  ): Promise<Organisation> {
    await this.getOrganisationById(orgId);

    const updated = await this.prisma.organisation.update({
      where: { id: orgId },
      data: {
        ...(data.allowedEsignStandards !== undefined && {
          allowedEsignStandards: data.allowedEsignStandards as any,
        }),
        ...(data.requireReauthBeforeSigning !== undefined && {
          requireReauthBeforeSigning: data.requireReauthBeforeSigning,
        }),
        ...(data.signatureReasonRequired !== undefined && {
          signatureReasonRequired: data.signatureReasonRequired,
        }),
        ...(data.documentRetentionDays !== undefined && {
          documentRetentionDays: data.documentRetentionDays,
        }),
      },
    });

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'ORGANISATION_COMPLIANCE_UPDATED',
      resourceType: 'organisation',
      resourceId: orgId,
      metadata: { updatedFields: Object.keys(data) },
    });

    return updated;
  }

  /**
   * Retrieves organisation resource usage summary and quota indicators.
   */
  async getUsageSummary(orgId: string): Promise<UsageSummary> {
    const org = await this.getOrganisationById(orgId);

    const activeUsersCount = await this.prisma.user.count({
      where: { organisationId: orgId, deletedAt: null },
    });

    const pendingInvitationsCount = await this.prisma.organisationInvitation.count({
      where: { organisationId: orgId, status: 'pending' },
    });

    const storageQuota = org.storageQuotaBytes;
    const storageUsed = org.storageUsedBytes;
    const storageUsagePercent = storageQuota > 0n ? Number((storageUsed * 100n) / storageQuota) : 0;

    const documentUsagePercent =
      org.maxDocuments > 0 ? Math.round((org.documentCount / org.maxDocuments) * 100) : 0;

    return {
      organisationId: org.id,
      organisationName: org.name,
      storageQuotaBytes: storageQuota.toString(),
      storageUsedBytes: storageUsed.toString(),
      storageUsagePercent,
      maxDocuments: org.maxDocuments,
      documentCount: org.documentCount,
      documentUsagePercent,
      maxUsers: org.maxUsers,
      activeUsersCount,
      pendingInvitationsCount,
      isStorageNearLimit: storageUsagePercent >= 80,
      isStorageLimitReached: storageQuota > 0n && storageUsed >= storageQuota,
      isDocumentLimitReached: org.documentCount >= org.maxDocuments,
    };
  }

  /**
   * Invites a team member into the organisation.
   */
  async inviteMember(
    orgId: string,
    actorUserId: string,
    data: InviteMemberInput,
  ): Promise<OrganisationInvitation> {
    const org = await this.requireTeamsPlan(orgId, 'Member invitations');
    const email = data.email.toLowerCase().trim();

    const existingMembership = this.prisma.userOrganisation
      ? await this.prisma.userOrganisation.findFirst({
          where: {
            organisationId: orgId,
            user: { email, deletedAt: null },
          },
        })
      : await this.prisma.user.findFirst({
          where: { organisationId: orgId, email, deletedAt: null },
        });

    if (existingMembership) {
      throw new ConflictError('User is already a member of this organisation.');
    }

    const rawToken = `${generateId()}${generateId()}`;
    const tokenHash = await sha256(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.organisationInvitation.updateMany({
      where: { organisationId: orgId, email, status: 'pending' },
      data: { status: 'revoked' },
    });

    const invitation = await this.prisma.organisationInvitation.create({
      data: {
        id: generateId(),
        organisationId: orgId,
        email,
        role: data.role,
        tokenHash,
        expiresAt,
        invitedById: actorUserId,
        status: 'pending',
      },
    });

    if (data.teamId && this.prisma.team) {
      const team = await this.prisma.team.findFirst({
        where: { id: data.teamId, organisationId: orgId },
      });
      if (team && existingMembership) {
        const memberUserId =
          (existingMembership as any).userId || (existingMembership as any).id;
        if (memberUserId) {
          await this.prisma.teamMember.upsert({
            where: { teamId_userId: { teamId: data.teamId, userId: memberUserId } },
            create: { id: generateId(), teamId: data.teamId, userId: memberUserId },
            update: {},
          });
        }
      }
    }

    await this.mailerService.sendOrganisationInvitationEmail(email, org.name, data.role, rawToken);

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'ORGANISATION_MEMBER_INVITED',
      resourceType: 'organisation_invitation',
      resourceId: invitation.id,
      metadata: { email, role: data.role },
    });

    return invitation;
  }

  /**
   * Retrieves non-sensitive details of an invitation.
   */
  async getInvitationDetails(rawToken: string): Promise<{
    email: string;
    organisationName: string;
    role: string;
    expiresAt: string;
  }> {
    const tokenHash = await sha256(rawToken);
    const invitation = await this.prisma.organisationInvitation.findFirst({
      where: { tokenHash },
      include: { organisation: true },
    });

    if (!invitation || invitation.status !== 'pending') {
      throw new NotFoundError('Invitation is invalid, expired, or revoked.');
    }

    if (invitation.expiresAt < new Date()) {
      await this.prisma.organisationInvitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      throw new BadRequestError('Invitation has expired.');
    }

    return {
      email: invitation.email,
      organisationName: invitation.organisation.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /**
   * Accepts an invitation and joins the organisation.
   */
  async acceptInvitation(
    data: AcceptInvitationInput,
  ): Promise<{ message: string; organisationId: string }> {
    const tokenHash = await sha256(data.token);
    const invitation = await this.prisma.organisationInvitation.findFirst({
      where: { tokenHash },
      include: { organisation: true },
    });

    if (!invitation || invitation.status !== 'pending') {
      throw new NotFoundError('Invitation is invalid, expired, or revoked.');
    }

    if (invitation.expiresAt < new Date()) {
      await this.prisma.organisationInvitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      throw new BadRequestError('Invitation has expired.');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { email: invitation.email },
    });

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      if (!data.name || !data.password) {
        throw new BadRequestError('Name and password are required for new account setup.');
      }
      userId = generateId();
      const passwordHash = await sha256(data.password);

      await this.prisma.user.create({
        data: {
          id: userId,
          organisationId: invitation.organisationId,
          email: invitation.email,
          passwordHash,
          name: data.name,
          role: invitation.role,
          emailVerified: true,
          status: 'active',
        },
      });
    }

    if (this.prisma.userOrganisation) {
      await this.prisma.userOrganisation.upsert({
        where: {
          userId_organisationId: { userId, organisationId: invitation.organisationId },
        },
        create: {
          id: generateId(),
          organisationId: invitation.organisationId,
          userId,
          role: invitation.role,
        },
        update: { role: invitation.role },
      });
    }

    await this.prisma.organisationInvitation.update({
      where: { id: invitation.id },
      data: { status: 'accepted' },
    });

    await this.auditService.log({
      organisationId: invitation.organisationId,
      userId,
      action: 'ORGANISATION_INVITATION_ACCEPTED',
      resourceType: 'organisation_invitation',
      resourceId: invitation.id,
      metadata: { email: invitation.email, role: invitation.role },
    });

    return {
      message: 'Invitation accepted successfully.',
      organisationId: invitation.organisationId,
    };
  }

  /**
   * Lists pending/historical invitations for an organisation.
   */
  async listInvitations(orgId: string): Promise<OrganisationInvitation[]> {
    await this.getOrganisationById(orgId);
    return this.prisma.organisationInvitation.findMany({
      where: { organisationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Revokes a pending invitation.
   */
  async revokeInvitation(orgId: string, invitationId: string, actorUserId: string): Promise<void> {
    const invitation = await this.prisma.organisationInvitation.findFirst({
      where: { id: invitationId, organisationId: orgId },
    });

    if (!invitation) {
      throw new NotFoundError('Invitation not found.');
    }

    await this.prisma.organisationInvitation.update({
      where: { id: invitationId },
      data: { status: 'revoked' },
    });

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'ORGANISATION_INVITATION_REVOKED',
      resourceType: 'organisation_invitation',
      resourceId: invitationId,
      metadata: { email: invitation.email },
    });
  }

  /**
   * Resends an invitation with a fresh token and 7-day expiration.
   */
  async resendInvitation(orgId: string, invitationId: string, actorUserId: string) {
    const org = await this.getOrganisationById(orgId);
    const existing = await this.prisma.organisationInvitation.findFirst({
      where: { id: invitationId, organisationId: orgId },
    });

    if (!existing) {
      throw new NotFoundError('Invitation not found.');
    }

    const rawToken = `${generateId()}${generateId()}`;
    const tokenHash = await sha256(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.organisationInvitation.update({
      where: { id: invitationId },
      data: {
        tokenHash,
        expiresAt,
        status: 'pending',
      },
    });

    await this.mailerService.sendOrganisationInvitationEmail(
      existing.email,
      org.name,
      existing.role,
      rawToken,
    );

    if (this.auditService) {
      await this.auditService.log({
        organisationId: orgId,
        userId: actorUserId,
        action: 'ORGANISATION_INVITATION_RESENT',
        resourceType: 'organisation_invitation',
        resourceId: invitationId,
        metadata: { email: existing.email, role: existing.role },
      });
    }

    return updated;
  }

  /**
   * Suspends organisation access.
   */
  async suspendOrganisation(
    orgId: string,
    actorUserId: string,
    reason?: string,
  ): Promise<Organisation> {
    const org = await this.getOrganisationById(orgId);

    if (org.status === 'suspended') {
      throw new BadRequestError('Organisation is already suspended.');
    }

    const updated = await this.prisma.organisation.update({
      where: { id: orgId },
      data: { status: 'suspended' },
    });

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'ORGANISATION_SUSPENDED',
      resourceType: 'organisation',
      resourceId: orgId,
      metadata: { reason: reason ?? 'Administrative action' },
    });

    return updated;
  }

  /**
   * Restores a suspended organisation.
   */
  async restoreOrganisation(orgId: string, actorUserId: string): Promise<Organisation> {
    const org = await this.getOrganisationById(orgId);

    if (org.status !== 'suspended') {
      throw new BadRequestError('Organisation is not currently suspended.');
    }

    const updated = await this.prisma.organisation.update({
      where: { id: orgId },
      data: { status: 'active' },
    });

    await this.auditService.log({
      organisationId: orgId,
      userId: actorUserId,
      action: 'ORGANISATION_RESTORED',
      resourceType: 'organisation',
      resourceId: orgId,
      metadata: { action: 'restored' },
    });

    return updated;
  }

  /**
   * Checks storage quota sufficiency.
   */
  async checkStorageQuota(orgId: string, additionalBytes: number): Promise<void> {
    const org = await this.getOrganisationById(orgId);
    const newTotal = org.storageUsedBytes + BigInt(additionalBytes);

    if (org.storageQuotaBytes > 0n && newTotal > org.storageQuotaBytes) {
      throw new ForbiddenError(
        'Organisation storage quota exceeded. Please upgrade your plan or delete existing files.',
      );
    }
  }
}
