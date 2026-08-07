import { Hono } from 'hono';
import type { PrismaClient } from '@graphsign/db';
import { createPrismaClient } from '@graphsign/db';
import {
  createOrganisationSchema,
  inviteMemberSchema,
  acceptInvitationSchema,
  updateBrandingSchema,
  updateOrganisationSettingsSchema,
  updateComplianceSettingsSchema,
  suspendOrganisationSchema,
  createTeamSchema,
  addTeamMemberSchema,
  createCustomRoleSchema,
  updateMemberRoleSchema,
  addDomainSchema,
  switchOrganisationSchema,
  auditLogQuerySchema,
} from '../validators/organisation-validators.js';
import { OrganisationService } from '../services/organisation-service.js';
import type { MailerService } from '../services/mailer-service.js';
import { createMailerService } from '../services/mailer-service.js';
import type { AuditService } from '../services/audit-service.js';
import { PrismaAuditService } from '../services/audit-service.js';
import { AppError, ValidationError } from '../utils/errors.js';
import { createRateLimiter } from '../middleware/rate-limiter.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { enforceTenantActiveStatus } from '../middleware/tenant-status-middleware.js';
import { requirePermission, requireRole } from '../middleware/rbac-middleware.js';
import { signJwt } from '../utils/jwt.js';
import type { Env } from '../index.js';

export interface OrganisationDeps {
  prisma?: PrismaClient;
  mailer?: MailerService;
  audit?: AuditService;
  organisationService?: OrganisationService;
}

/**
 * Organisation router factory providing endpoints for INK-49 through INK-60.
 */
export function createOrganisationRoutes(deps?: OrganisationDeps) {
  const orgs = new Hono<{ Bindings: Env }>();

  orgs.use('/*', createRateLimiter(100, 60_000));

  function getService(c: any): OrganisationService {
    if (deps?.organisationService) {
      return deps.organisationService;
    }

    let db = deps?.prisma;
    if (!db) {
      const dbUrl = c.env?.DATABASE_URL || process.env.DATABASE_URL;
      const isValidUrl =
        dbUrl &&
        typeof dbUrl === 'string' &&
        dbUrl.trim() !== '' &&
        (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'));

      if (isValidUrl) {
        db = createPrismaClient(dbUrl);
      } else {
        const preview = dbUrl ? `${String(dbUrl).substring(0, 10)}...` : 'undefined';
        throw new AppError(
          'INTERNAL_SERVER_ERROR',
          `Database connection string (DATABASE_URL) is missing or invalid. Received: "${preview}".`,
          500,
        );
      }
    }

    let mailer = deps?.mailer;
    if (!mailer) {
      mailer = createMailerService(c.env ?? {});
    }

    let audit = deps?.audit;
    if (!audit) {
      audit = new PrismaAuditService(db);
    }

    return new OrganisationService(db, audit, mailer);
  }

  /**
   * Public invitation endpoints
   */
  orgs.get('/invitations/details/:token', async (c) => {
    const token = c.req.param('token');
    const service = getService(c);
    const details = await service.getInvitationDetails(token);
    return c.json(details);
  });

  orgs.post('/invitations/accept', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) throw new ValidationError('Request body is required.');

    const parsed = acceptInvitationSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.', {
        field: firstError?.path.join('.') ?? 'unknown',
        issue: firstError?.message ?? 'validation_failed',
      });
    }

    const service = getService(c);
    const result = await service.acceptInvitation(parsed.data);
    return c.json(result);
  });

  /**
   * INK-49: Create organisation
   */
  orgs.post('/', jwtAuth(), async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) throw new ValidationError('Request body is required.');

    const parsed = createOrganisationSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.', {
        field: firstError?.path.join('.') ?? 'unknown',
        issue: firstError?.message ?? 'validation_failed',
      });
    }

    const payload = c.get('userPayload');
    const service = getService(c);
    const organisation = await service.createOrganisation(parsed.data, payload?.sub);

    return c.json(
      {
        id: organisation.id,
        name: organisation.name,
        slug: organisation.slug,
        status: organisation.status,
        createdAt: organisation.createdAt.toISOString(),
      },
      201,
    );
  });

  /**
   * INK-59: Multi-tenant Organisation Switching & Listing
   */
  orgs.get('/my-organisations', jwtAuth(), async (c) => {
    const payload = c.get('userPayload');
    const service = getService(c);
    const list = await service.getUserOrganisations(payload.sub);
    return c.json(list);
  });

  orgs.post('/switch', jwtAuth(), async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) throw new ValidationError('Request body is required.');

    const parsed = switchOrganisationSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.');
    }

    const payload = c.get('userPayload');
    const service = getService(c);
    const userOrgs = await service.getUserOrganisations(payload.sub);
    const targetOrg = userOrgs.find((o) => o.id === parsed.data.targetOrganisationId);

    if (!targetOrg) {
      throw new AppError('FORBIDDEN', 'You do not have access to the target organisation.', 403);
    }

    // Issue updated JWT with new org context
    const token = await signJwt({
      sub: payload.sub,
      orgId: targetOrg.id,
      email: payload.email,
      role: targetOrg.role,
      jti: crypto.randomUUID(),
    });

    c.header('Set-Cookie', `graphsign_session=${token}; HttpOnly; Path=/; SameSite=Strict; Secure`);

    return c.json({
      token,
      organisationId: targetOrg.id,
      organisationName: targetOrg.name,
      role: targetOrg.role,
      message: `Switched active workspace to ${targetOrg.name}.`,
    });
  });

  /**
   * Protected Organisation Administration Endpoints
   */

  // GET /api/v1/organisations/me
  orgs.get('/me', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const payload = c.get('userPayload');
    const service = getService(c);
    const org = await service.getOrganisationById(payload.orgId);

    return c.json({
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      sessionTimeoutMinutes: org.sessionTimeoutMinutes,
      mfaRequired: org.mfaRequired,
      mfaRequiredRoles: org.mfaRequiredRoles,
      createdAt: org.createdAt.toISOString(),
    });
  });

  // INK-50: PATCH /api/v1/organisations/me/settings
  orgs.patch(
    '/me/settings',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('organisation:manage'),
    async (c) => {
      const body = await c.req.json().catch(() => null);
      if (!body) throw new ValidationError('Request body is required.');

      const parsed = updateOrganisationSettingsSchema.safeParse(body);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0];
        throw new ValidationError(firstError?.message ?? 'Invalid input.');
      }

      const payload = c.get('userPayload');
      const service = getService(c);
      const updated = await service.updateSettings(payload.orgId, payload.sub, parsed.data);

      return c.json({
        id: updated.id,
        name: updated.name,
        sessionTimeoutMinutes: updated.sessionTimeoutMinutes,
        mfaRequired: updated.mfaRequired,
        message: 'Organisation settings updated successfully.',
      });
    },
  );

  // INK-51: DELETE /api/v1/organisations/me (Soft delete)
  orgs.delete(
    '/me',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('organisation:manage'),
    async (c) => {
      const payload = c.get('userPayload');
      const service = getService(c);
      await service.deleteOrganisation(payload.orgId, payload.sub);

      return c.json({
        message: 'Organisation soft-deleted successfully. Retained for 30 days.',
      });
    },
  );

  // INK-57: GET & PUT branding
  orgs.get('/me/branding', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const payload = c.get('userPayload');
    const service = getService(c);
    const org = await service.getOrganisationById(payload.orgId);

    return c.json({
      logoUrl: org.logoUrl,
      primaryColor: org.primaryColor,
      secondaryColor: org.secondaryColor,
      companyAddress: org.companyAddress,
      defaultSenderName: org.defaultSenderName,
      emailFooterText: org.emailFooterText,
    });
  });

  orgs.put(
    '/me/branding',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('branding:manage'),
    async (c) => {
      const body = await c.req.json().catch(() => null);
      if (!body) throw new ValidationError('Request body is required.');

      const parsed = updateBrandingSchema.safeParse(body);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0];
        throw new ValidationError(firstError?.message ?? 'Invalid input.');
      }

      const payload = c.get('userPayload');
      const service = getService(c);
      const updated = await service.updateBranding(payload.orgId, payload.sub, parsed.data);

      return c.json({
        logoUrl: updated.logoUrl,
        primaryColor: updated.primaryColor,
        secondaryColor: updated.secondaryColor,
        companyAddress: updated.companyAddress,
        defaultSenderName: updated.defaultSenderName,
        emailFooterText: updated.emailFooterText,
        message: 'Organisation branding updated successfully.',
      });
    },
  );

  // GET /api/v1/organisations/me/usage
  orgs.get('/me/usage', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const payload = c.get('userPayload');
    const service = getService(c);
    const summary = await service.getUsageSummary(payload.orgId);

    if (summary.isStorageNearLimit) {
      c.header('X-Quota-Warning', 'Storage usage exceeds 80% of allocated quota.');
    }

    return c.json(summary);
  });

  // INK-58: GET /api/v1/organisations/me/audit-logs (Paginated audit logs)
  orgs.get(
    '/me/audit-logs',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('audit:read'),
    async (c) => {
      const queryParams = c.req.query();
      const parsed = auditLogQuerySchema.safeParse(queryParams);
      if (!parsed.success) {
        throw new ValidationError('Invalid query parameters for audit log filter.');
      }

      const payload = c.get('userPayload');
      const service = getService(c);
      const result = await service.getAuditLogs(payload.orgId, parsed.data);

      return c.json(result);
    },
  );

  // GET & PUT compliance
  orgs.get('/me/compliance', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const payload = c.get('userPayload');
    const service = getService(c);
    const org = await service.getOrganisationById(payload.orgId);

    return c.json({
      allowedEsignStandards: org.allowedEsignStandards,
      requireReauthBeforeSigning: org.requireReauthBeforeSigning,
      signatureReasonRequired: org.signatureReasonRequired,
      documentRetentionDays: org.documentRetentionDays,
    });
  });

  orgs.put(
    '/me/compliance',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('compliance:manage'),
    async (c) => {
      const body = await c.req.json().catch(() => null);
      if (!body) throw new ValidationError('Request body is required.');

      const parsed = updateComplianceSettingsSchema.safeParse(body);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0];
        throw new ValidationError(firstError?.message ?? 'Invalid input.');
      }

      const payload = c.get('userPayload');
      const service = getService(c);
      const updated = await service.updateComplianceSettings(
        payload.orgId,
        payload.sub,
        parsed.data,
      );

      return c.json({
        allowedEsignStandards: updated.allowedEsignStandards,
        requireReauthBeforeSigning: updated.requireReauthBeforeSigning,
        signatureReasonRequired: updated.signatureReasonRequired,
        documentRetentionDays: updated.documentRetentionDays,
        message: 'Compliance settings updated successfully.',
      });
    },
  );

  /**
   * INK-52 & INK-53: Team Management Endpoints
   */
  orgs.get('/teams', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const payload = c.get('userPayload');
    const service = getService(c);
    const teams = await service.listTeams(payload.orgId);
    return c.json(teams);
  });

  orgs.post(
    '/teams',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('teams:manage'),
    async (c) => {
      const body = await c.req.json().catch(() => null);
      if (!body) throw new ValidationError('Request body is required.');

      const parsed = createTeamSchema.safeParse(body);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0];
        throw new ValidationError(firstError?.message ?? 'Invalid input.');
      }

      const payload = c.get('userPayload');
      const service = getService(c);
      const team = await service.createTeam(payload.orgId, payload.sub, parsed.data);

      return c.json(team, 201);
    },
  );

  orgs.post('/teams/:id/members', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const teamId = c.req.param('id');
    const body = await c.req.json().catch(() => null);
    if (!body) throw new ValidationError('Request body is required.');

    const parsed = addTeamMemberSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError('Invalid user ID.');

    const payload = c.get('userPayload');
    const service = getService(c);
    await service.addTeamMember(payload.orgId, teamId, payload.sub, parsed.data.userId);

    return c.json({ message: 'Team member added successfully.' }, 201);
  });

  orgs.delete('/teams/:id/members/:userId', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const teamId = c.req.param('id');
    const userId = c.req.param('userId');
    const payload = c.get('userPayload');
    const service = getService(c);
    await service.removeTeamMember(payload.orgId, teamId, payload.sub, userId);

    return c.json({ message: 'Team member removed successfully.' });
  });

  /**
   * INK-54 & INK-55: Roles & Custom Roles Endpoints
   */
  orgs.patch(
    '/members/:userId/role',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('roles:manage'),
    async (c) => {
      const targetUserId = c.req.param('userId');
      const body = await c.req.json().catch(() => null);
      if (!body) throw new ValidationError('Request body is required.');

      const parsed = updateMemberRoleSchema.safeParse(body);
      if (!parsed.success) throw new ValidationError('Invalid role payload.');

      const payload = c.get('userPayload');
      const service = getService(c);
      await service.updateMemberRole(payload.orgId, payload.sub, targetUserId, parsed.data.role);

      return c.json({ message: 'Member role updated successfully.' });
    },
  );

  orgs.get('/roles', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const payload = c.get('userPayload');
    const service = getService(c);
    const roles = await service.listCustomRoles(payload.orgId);
    return c.json(roles);
  });

  orgs.post(
    '/roles',
    jwtAuth(),
    enforceTenantActiveStatus(),
    requirePermission('roles:manage'),
    async (c) => {
      const body = await c.req.json().catch(() => null);
      if (!body) throw new ValidationError('Request body is required.');

      const parsed = createCustomRoleSchema.safeParse(body);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0];
        throw new ValidationError(firstError?.message ?? 'Invalid custom role data.');
      }

      const payload = c.get('userPayload');
      const service = getService(c);
      const customRole = await service.createCustomRole(payload.orgId, payload.sub, parsed.data);

      return c.json(customRole, 201);
    },
  );

  /**
   * INK-56: Invitations Endpoints
   */
  orgs.post('/invitations', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) throw new ValidationError('Request body is required.');

    const parsed = inviteMemberSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.');
    }

    const payload = c.get('userPayload');
    const service = getService(c);
    const invitation = await service.inviteMember(payload.orgId, payload.sub, parsed.data);

    return c.json(
      {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt.toISOString(),
        message: 'Member invitation sent successfully.',
      },
      201,
    );
  });

  orgs.get('/invitations', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const payload = c.get('userPayload');
    const service = getService(c);
    const list = await service.listInvitations(payload.orgId);

    return c.json(
      list.map((item) => ({
        id: item.id,
        email: item.email,
        role: item.role,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
      })),
    );
  });

  orgs.delete('/invitations/:id', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const invitationId = c.req.param('id');
    const payload = c.get('userPayload');
    const service = getService(c);
    await service.revokeInvitation(payload.orgId, invitationId, payload.sub);

    return c.json({ message: 'Invitation revoked successfully.' });
  });

  /**
   * INK-60: Domain Verification Endpoints
   */
  orgs.get('/domains', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const payload = c.get('userPayload');
    const service = getService(c);
    const domains = await service.listDomains(payload.orgId);
    return c.json(domains);
  });

  orgs.post('/domains', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) throw new ValidationError('Request body is required.');

    const parsed = addDomainSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid domain name.');
    }

    const payload = c.get('userPayload');
    const service = getService(c);
    const domainRecord = await service.addDomain(payload.orgId, payload.sub, parsed.data);

    return c.json(domainRecord, 201);
  });

  orgs.post('/domains/:id/verify', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const domainId = c.req.param('id');
    const payload = c.get('userPayload');
    const service = getService(c);
    const verified = await service.verifyDomain(payload.orgId, domainId, payload.sub);

    return c.json({
      id: verified.id,
      domain: verified.domain,
      status: verified.status,
      verifiedAt: verified.verifiedAt?.toISOString(),
      message: 'Domain verification successful.',
    });
  });

  /**
   * System Super Admin Endpoints
   */
  orgs.post('/:id/suspend', jwtAuth(), requireRole(['super_admin']), async (c) => {
    const orgId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const parsed = suspendOrganisationSchema.safeParse(body);

    const payload = c.get('userPayload');
    const service = getService(c);
    const updated = await service.suspendOrganisation(orgId, payload.sub, parsed.data?.reason);

    return c.json({
      id: updated.id,
      status: updated.status,
      message: 'Organisation suspended successfully.',
    });
  });

  orgs.post('/:id/restore', jwtAuth(), requireRole(['super_admin']), async (c) => {
    const orgId = c.req.param('id');
    const payload = c.get('userPayload');
    const service = getService(c);
    const updated = await service.restoreOrganisation(orgId, payload.sub);

    return c.json({
      id: updated.id,
      status: updated.status,
      message: 'Organisation restored successfully.',
    });
  });

  return orgs;
}
