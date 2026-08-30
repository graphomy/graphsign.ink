import { describe, it, expect } from 'vitest';
import {
  submitReviewSchema,
  reviewDecisionSchema,
  sendAgreementSchema,
  verifyOtpSchema,
  electronicConsentSchema,
  declineSignSchema,
  cancelAgreementSchema,
} from './workflow-validators.js';

describe('Workflow Validators Unit Tests (INK-86 to INK-108)', () => {
  describe('submitReviewSchema', () => {
    it('validates reviewer email and optional notes', () => {
      const valid = { reviewerEmail: 'reviewer@example.com', notes: 'Please review section 4' };
      expect(submitReviewSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects invalid email', () => {
      const invalid = { reviewerEmail: 'not-an-email' };
      expect(submitReviewSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe('reviewDecisionSchema', () => {
    it('validates APPROVE and REJECT decisions', () => {
      expect(reviewDecisionSchema.safeParse({ decision: 'APPROVE' }).success).toBe(true);
      expect(
        reviewDecisionSchema.safeParse({ decision: 'REJECT', comments: 'Needs revisions' }).success,
      ).toBe(true);
    });

    it('rejects invalid decision strings', () => {
      expect(reviewDecisionSchema.safeParse({ decision: 'PENDING' }).success).toBe(false);
    });
  });

  describe('sendAgreementSchema', () => {
    it('validates valid sending configuration with recipients', () => {
      const valid = {
        signingOrder: 'SEQUENTIAL',
        recipients: [
          { name: 'Signer 1', email: 's1@example.com', role: 'signer', routingOrder: 1 },
          { name: 'Signer 2', email: 's2@example.com', role: 'signer', routingOrder: 2 },
        ],
      };
      expect(sendAgreementSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects payload with empty recipients array', () => {
      const invalid = { signingOrder: 'PARALLEL', recipients: [] };
      expect(sendAgreementSchema.safeParse(invalid).success).toBe(false);
    });
  });

  describe('verifyOtpSchema', () => {
    it('accepts 6-digit code and rejects non-6-digit codes', () => {
      expect(verifyOtpSchema.safeParse({ otpCode: '123456' }).success).toBe(true);
      expect(verifyOtpSchema.safeParse({ otpCode: '12345' }).success).toBe(false);
      expect(verifyOtpSchema.safeParse({ otpCode: '1234567' }).success).toBe(false);
    });
  });

  describe('electronicConsentSchema', () => {
    it('requires consentGiven to be strictly true', () => {
      expect(electronicConsentSchema.safeParse({ consentGiven: true }).success).toBe(true);
      expect(electronicConsentSchema.safeParse({ consentGiven: false }).success).toBe(false);
    });
  });

  describe('declineSignSchema & cancelAgreementSchema', () => {
    it('requires non-empty reason strings', () => {
      expect(declineSignSchema.safeParse({ reason: 'Incorrect pricing' }).success).toBe(true);
      expect(declineSignSchema.safeParse({ reason: '' }).success).toBe(false);

      expect(cancelAgreementSchema.safeParse({ reason: 'Client cancelled' }).success).toBe(true);
      expect(cancelAgreementSchema.safeParse({ reason: '' }).success).toBe(false);
    });
  });
});
