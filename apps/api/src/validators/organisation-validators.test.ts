import { describe, it, expect } from 'vitest';
import {
  createOrganisationSchema,
  inviteMemberSchema,
  acceptInvitationSchema,
  updateBrandingSchema,
  updateOrganisationSettingsSchema,
  updateComplianceSettingsSchema,
  suspendOrganisationSchema,
} from './organisation-validators.js';

describe('Organisation Validators', () => {
  describe('createOrganisationSchema', () => {
    it('validates a valid organisation name and slug', () => {
      const result = createOrganisationSchema.safeParse({
        name: 'Acme Corporation',
        slug: 'acme-corp',
      });
      expect(result.success).toBe(true);
    });

    it('rejects names under 2 characters', () => {
      const result = createOrganisationSchema.safeParse({
        name: 'A',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid slug format', () => {
      const result = createOrganisationSchema.safeParse({
        name: 'Acme Corp',
        slug: 'Acme_Corp!',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('inviteMemberSchema', () => {
    it('validates a valid email and defaults role to user', () => {
      const result = inviteMemberSchema.safeParse({
        email: 'user@example.com',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('user');
      }
    });

    it('accepts explicit valid role', () => {
      const result = inviteMemberSchema.safeParse({
        email: 'admin@example.com',
        role: 'org_admin',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email format', () => {
      const result = inviteMemberSchema.safeParse({
        email: 'invalid-email',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('acceptInvitationSchema', () => {
    it('validates a valid token', () => {
      const result = acceptInvitationSchema.safeParse({
        token: 'token_1234567890_abcdef',
        name: 'John Doe',
        password: 'securepassword123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects short token', () => {
      const result = acceptInvitationSchema.safeParse({
        token: 'short',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateBrandingSchema', () => {
    it('validates valid branding colors and fields', () => {
      const result = updateBrandingSchema.safeParse({
        logoUrl: 'https://example.com/logo.png',
        primaryColor: '#0055ff',
        secondaryColor: '#f0f0f0',
        defaultSenderName: 'Acme Legal Team',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid hex color format', () => {
      const result = updateBrandingSchema.safeParse({
        primaryColor: 'blue',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateOrganisationSettingsSchema', () => {
    it('validates session timeout range', () => {
      const result = updateOrganisationSettingsSchema.safeParse({
        sessionTimeoutMinutes: 30,
        mfaRequired: true,
      });
      expect(result.success).toBe(true);
    });

    it('rejects timeout below 5 minutes', () => {
      const result = updateOrganisationSettingsSchema.safeParse({
        sessionTimeoutMinutes: 2,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateComplianceSettingsSchema', () => {
    it('validates valid compliance parameters', () => {
      const result = updateComplianceSettingsSchema.safeParse({
        allowedEsignStandards: ['ESIGN', 'eIDAS_SES'],
        requireReauthBeforeSigning: true,
        signatureReasonRequired: true,
        documentRetentionDays: 730,
      });
      expect(result.success).toBe(true);
    });
  });
});
