import { describe, it, expect } from 'vitest';
import { WebhookFilterService } from './webhook-filter-service.js';
import type { WebhookEnvelope } from '../contracts/webhook-events.js';

describe('WebhookFilterService (INK-162, INK-163, FR-017.006, FR-017.007)', () => {
  const sampleEnvelope: WebhookEnvelope = {
    id: 'f94dc92c-eb0e-436d-9654-7ca835848bb0',
    event: 'document.signed',
    schemaVersion: '1.0',
    timestamp: '2026-09-16T12:00:00Z',
    organisationId: '6fa85f64-5717-4562-b3fc-2c963f66afa6',
    sequence: 42,
    test: false,
    data: {
      document_id: 'doc-abc-123',
      document_name: 'NDA Agreement.pdf',
      status: 'IN_PROGRESS',
      folder: 'Legal/2026',
      recipient_id: 'recip-01',
      recipient_email: 'signer@example.com',
      amount: 5000,
    },
  };

  describe('AST Predicate Evaluation (INK-162)', () => {
    it('returns true when filterRules is empty or undefined', () => {
      expect(WebhookFilterService.matchesFilter(sampleEnvelope, undefined)).toBe(true);
      expect(WebhookFilterService.matchesFilter(sampleEnvelope, {})).toBe(true);
    });

    it('evaluates eq (equals) rule correctly', () => {
      expect(
        WebhookFilterService.matchesFilter(sampleEnvelope, {
          'data.folder': { eq: 'Legal/2026' },
        }),
      ).toBe(true);

      expect(
        WebhookFilterService.matchesFilter(sampleEnvelope, {
          'data.folder': { eq: 'Finance' },
        }),
      ).toBe(false);
    });

    it('evaluates neq (not equals) rule correctly', () => {
      expect(
        WebhookFilterService.matchesFilter(sampleEnvelope, {
          'data.status': { neq: 'COMPLETED' },
        }),
      ).toBe(true);

      expect(
        WebhookFilterService.matchesFilter(sampleEnvelope, {
          'data.status': { neq: 'IN_PROGRESS' },
        }),
      ).toBe(false);
    });

    it('evaluates contains rule correctly', () => {
      expect(
        WebhookFilterService.matchesFilter(sampleEnvelope, {
          'data.recipient_email': { contains: 'example.com' },
        }),
      ).toBe(true);

      expect(
        WebhookFilterService.matchesFilter(sampleEnvelope, {
          'data.recipient_email': { contains: 'gmail.com' },
        }),
      ).toBe(false);
    });

    it('evaluates in (array membership) rule correctly', () => {
      expect(
        WebhookFilterService.matchesFilter(sampleEnvelope, {
          'data.status': { in: ['DRAFT', 'IN_PROGRESS', 'SENT'] },
        }),
      ).toBe(true);

      expect(
        WebhookFilterService.matchesFilter(sampleEnvelope, {
          'data.status': { in: ['COMPLETED', 'DECLINED'] },
        }),
      ).toBe(false);
    });

    it('requires all rules to match (conjunction AND)', () => {
      expect(
        WebhookFilterService.matchesFilter(sampleEnvelope, {
          'data.folder': { eq: 'Legal/2026' },
          'data.recipient_email': { contains: 'example.com' },
        }),
      ).toBe(true);

      expect(
        WebhookFilterService.matchesFilter(sampleEnvelope, {
          'data.folder': { eq: 'Legal/2026' },
          'data.recipient_email': { contains: 'other.com' },
        }),
      ).toBe(false);
    });
  });

  describe('Payload Projection (INK-163)', () => {
    it('returns full envelope when projection mode is ALL', () => {
      const projected = WebhookFilterService.projectPayload(sampleEnvelope, { mode: 'ALL' });
      expect(projected).toEqual(sampleEnvelope);
    });

    it('returns subset of fields when projection mode is CUSTOM', () => {
      const projected = WebhookFilterService.projectPayload(sampleEnvelope, {
        mode: 'CUSTOM',
        includeFields: ['id', 'event', 'timestamp', 'data.document_id', 'data.status'],
      }) as any;

      expect(projected.id).toBe(sampleEnvelope.id);
      expect(projected.event).toBe('document.signed');
      expect(projected.timestamp).toBe(sampleEnvelope.timestamp);
      expect(projected.data?.document_id).toBe('doc-abc-123');
      expect(projected.data?.status).toBe('IN_PROGRESS');

      // Excluded fields should not be present
      expect(projected.data?.folder).toBeUndefined();
      expect(projected.data?.recipient_email).toBeUndefined();
      expect(projected.data?.amount).toBeUndefined();
    });
  });
});
