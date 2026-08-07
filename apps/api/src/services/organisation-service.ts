import type { PrismaClient, Organisation, OrganisationInvitation } from '@graphsign/db';
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
  isStorageNearLimit: boolean; // >= 80%
  isStorageLimitReached: boolean; // >= 100%
  isDocumentLimitReached: boolean;
}

export class OrganisationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
    private readonly mailerService: MailerService,
  ) {}

  /**
   * Creates a new Organisation workspace.
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

    const orgId = generateId();
    const tenantId = generateId();

    const organisation = await this.prisma.organisation.create({
      data: {
        id: orgId,
        name: data.name,
        slug,
        tenantId,
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
    const org = await this.prisma.organisation.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundError('Organisation not found.');
    }

    return org;
  }

  /**
   * Updates organization general settings.
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
   * Updates organization branding properties.
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
   * Updates organization compliance configurations.
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
    const storageUsagePercent =
      storageQuota > 0n ? Number((storageUsed * 100n) / storageQuota) : 0;

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
    const org = await this.getOrganisationById(orgId);
    const email = data.email.toLowerCase().trim();

    // Check if user is already a member
    const existingUser = await this.prisma.user.findFirst({
      where: { organisationId: orgId, email },
    });

    if (existingUser) {
      throw new ConflictError('User is already a member of this organisation.');
    }

    // Generate random raw invitation token & calculate SHA-256 tokenHash
    const rawToken = `${generateId()}${generateId()}`;
    const tokenHash = await sha256(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Revoke any existing pending invitations for this email
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

    // Send invitation email via mailer
    await this.mailerService.sendOrganisationInvitationEmail(
      email,
      org.name,
      data.role,
      rawToken,
    );

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
   * Retrieves non-sensitive details of an invitation for the public invitation acceptance page.
   */
  async getInvitationDetails(rawToken: string): Promise<{
    email: string;
    organisationName: string;
    role: string;
    expiresAt: string;
  }> {
    const tokenHash = await sha256(rawToken);
    const invitation = await this.prisma.organisationInvitation.findUnique({
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
    const invitation = await this.prisma.organisationInvitation.findUnique({
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

    // Find or create user
    const existingUser = await this.prisma.user.findFirst({
      where: { organisationId: invitation.organisationId, email: invitation.email },
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

    // Mark invitation as accepted
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
   * Lists all pending/historical invitations for an organisation.
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
  async revokeInvitation(
    orgId: string,
    invitationId: string,
    actorUserId: string,
  ): Promise<void> {
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
   * Checks if organization storage quota is sufficient for an operation.
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
