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
} from '../validators/organisation-validators.js';
import { OrganisationService } from '../services/organisation-service.js';
import type { MailerService } from '../services/mailer-service.js';
import { createMailerService } from '../services/mailer-service.js';
import type { AuditService } from '../services/audit-service.js';
import { PrismaAuditService } from '../services/audit-service.js';
import { AppError, ValidationError } from '../utils/errors.js';
import { createRateLimiter } from '../middleware/rate-limiter.js';
import { jwtAuth } from '../middleware/jwt-auth.js';
import { enforceTenantActiveStatus } from '../middleware/tenant-status-middleware.ts';
import type { Env } from '../index.js';

export interface OrganisationDeps {
  prisma?: PrismaClient;
  mailer?: MailerService;
  audit?: AuditService;
  organisationService?: OrganisationService;
}

/**
 * Organisation router factory.
 * Provides REST v1 endpoints for FR-002 Organisation Management.
 */
export function createOrganisationRoutes(deps?: OrganisationDeps) {
  const orgs = new Hono<{ Bindings: Env }>();

  // General API rate limiter
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
   * Public invitation endpoints (No JWT required)
   */

  // GET /api/v1/organisations/invitations/details/:token
  orgs.get('/invitations/details/:token', async (c) => {
    const token = c.req.param('token');
    const service = getService(c);
    const details = await service.getInvitationDetails(token);
    return c.json(details);
  });

  // POST /api/v1/organisations/invitations/accept
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
   * Protected endpoints requiring JWT authentication
   */

  // POST /api/v1/organisations (Create new organization workspace)
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
   * Organisation Admin / Member Endpoints (requires JWT & Tenant Active Status)
   */

  // GET /api/v1/organisations/me (Get current organisation profile)
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

  // PATCH /api/v1/organisations/me/settings (Update organisation general settings)
  orgs.patch('/me/settings', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) throw new ValidationError('Request body is required.');

    const parsed = updateOrganisationSettingsSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.', {
        field: firstError?.path.join('.') ?? 'unknown',
        issue: firstError?.message ?? 'validation_failed',
      });
    }

    const payload = c.get('userPayload');
    const service = getService(c);
    const updated = await service.updateSettings(payload.orgId, payload.sub, parsed.data);

    return c.json({
      id: updated.id,
      name: updated.name,
      sessionTimeoutMinutes: updated.sessionTimeoutMinutes,
      mfaRequired: updated.mfaRequired,
      mfaRequiredRoles: updated.mfaRequiredRoles,
      message: 'Organisation settings updated successfully.',
    });
  });

  // GET /api/v1/organisations/me/branding (Get organisation branding)
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

  // PUT /api/v1/organisations/me/branding (Update organisation branding)
  orgs.put('/me/branding', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) throw new ValidationError('Request body is required.');

    const parsed = updateBrandingSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.', {
        field: firstError?.path.join('.') ?? 'unknown',
        issue: firstError?.message ?? 'validation_failed',
      });
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
  });

  // GET /api/v1/organisations/me/usage (Get organisation usage & storage summary)
  orgs.get('/me/usage', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const payload = c.get('userPayload');
    const service = getService(c);
    const summary = await service.getUsageSummary(payload.orgId);

    if (summary.isStorageNearLimit) {
      c.header('X-Quota-Warning', 'Storage usage exceeds 80% of allocated quota.');
    }

    return c.json(summary);
  });

  // GET /api/v1/organisations/me/compliance (Get organisation compliance settings)
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

  // PUT /api/v1/organisations/me/compliance (Update organisation compliance settings)
  orgs.put('/me/compliance', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) throw new ValidationError('Request body is required.');

    const parsed = updateComplianceSettingsSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.', {
        field: firstError?.path.join('.') ?? 'unknown',
        issue: firstError?.message ?? 'validation_failed',
      });
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
  });

  // POST /api/v1/organisations/invitations (Invite member)
  orgs.post('/invitations', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) throw new ValidationError('Request body is required.');

    const parsed = inviteMemberSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      throw new ValidationError(firstError?.message ?? 'Invalid input.', {
        field: firstError?.path.join('.') ?? 'unknown',
        issue: firstError?.message ?? 'validation_failed',
      });
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

  // GET /api/v1/organisations/invitations (List pending & historical invitations)
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

  // DELETE /api/v1/organisations/invitations/:id (Revoke pending invitation)
  orgs.delete('/invitations/:id', jwtAuth(), enforceTenantActiveStatus(), async (c) => {
    const invitationId = c.req.param('id');
    const payload = c.get('userPayload');
    const service = getService(c);
    await service.revokeInvitation(payload.orgId, invitationId, payload.sub);

    return c.json({ message: 'Invitation revoked successfully.' });
  });

  /**
   * Super Admin / System Endpoints
   */

  // POST /api/v1/organisations/:id/suspend
  orgs.post('/:id/suspend', jwtAuth(), async (c) => {
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

  // POST /api/v1/organisations/:id/restore
  orgs.post('/:id/restore', jwtAuth(), async (c) => {
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
