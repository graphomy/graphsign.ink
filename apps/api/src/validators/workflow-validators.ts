import { z } from 'zod';

export const signingOrderEnum = z.enum(['PARALLEL', 'SEQUENTIAL']);
export type SigningOrder = z.infer<typeof signingOrderEnum>;

export const recipientRoleEnum = z.enum(['signer', 'reviewer', 'approver', 'viewer']);
export type RecipientRole = z.infer<typeof recipientRoleEnum>;

export const conditionalConditionEnum = z.enum([
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'CHECKED',
  'UNCHECKED',
]);

export const conditionalActionEnum = z.enum(['SHOW', 'HIDE', 'REQUIRE']);

export const conditionalRuleSchema = z.object({
  dependsOnFieldId: z.string().min(1, 'Target field ID is required'),
  condition: conditionalConditionEnum,
  value: z.union([z.string(), z.boolean(), z.number()]).optional(),
  action: conditionalActionEnum,
});
export type ConditionalRule = z.infer<typeof conditionalRuleSchema>;

export const submitReviewSchema = z.object({
  reviewerId: z.string().uuid('Reviewer ID must be a valid UUID').optional(),
  reviewerEmail: z.string().email('Valid reviewer email is required').optional(),
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional(),
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

export const reviewDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  comments: z.string().max(1000, 'Comments cannot exceed 1000 characters').optional(),
});
export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;

export const sendRecipientConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Recipient name is required').max(255),
  email: z.string().email('Valid recipient email is required'),
  role: recipientRoleEnum.default('signer'),
  routingOrder: z.number().int().min(1).default(1),
  color: z.string().max(50).optional(),
});
export type SendRecipientConfig = z.infer<typeof sendRecipientConfigSchema>;

export const sendAgreementSchema = z.object({
  signingOrder: signingOrderEnum.default('PARALLEL'),
  expiresAt: z.string().datetime().optional().nullable(),
  recipients: z.array(sendRecipientConfigSchema).min(1, 'At least one recipient is required'),
  message: z.string().max(1000).optional(),
});
export type SendAgreementInput = z.infer<typeof sendAgreementSchema>;

export const recipientSignSchema = z.object({
  fieldsData: z.record(z.union([z.string(), z.boolean(), z.number(), z.null()])).default({}),
  signatureData: z
    .object({
      type: z.enum(['DRAWN', 'TYPED', 'UPLOADED']),
      data: z.string().min(1, 'Signature representation is required'),
      fontFamily: z.string().optional(),
      consentGiven: z.boolean().refine((val) => val === true, {
        message: 'Consent to electronic signing must be accepted',
      }),
      timestamp: z.string().datetime().optional(),
    })
    .optional(),
});
export type RecipientSignInput = z.infer<typeof recipientSignSchema>;

export const declineSignSchema = z.object({
  reason: z.string().min(1, 'Decline reason is required').max(500),
});
export type DeclineSignInput = z.infer<typeof declineSignSchema>;

export const cancelAgreementSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required').max(1000),
});
export type CancelAgreementInput = z.infer<typeof cancelAgreementSchema>;

export const electronicConsentSchema = z.object({
  consentGiven: z.boolean().refine((v) => v === true, {
    message: 'You must explicitly consent to use electronic records and signatures.',
  }),
  ersdVersion: z.string().default('v1.0'),
});
export type ElectronicConsentInput = z.infer<typeof electronicConsentSchema>;

export const sendReminderSchema = z.object({
  recipientId: z.string().uuid('Invalid recipient ID').optional(),
  note: z.string().max(1000).optional(),
});
export type SendReminderInput = z.infer<typeof sendReminderSchema>;
