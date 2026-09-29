import type { PrismaClient } from '@graphsign/db';
import type { WebhookEventType } from '../contracts/webhook-events.js';

export interface DomainEventParams {
  organisationId: string;
  eventType: WebhookEventType;
  resourceType: 'agreement' | 'user' | 'template' | 'organisation';
  resourceId: string;
  sequence?: number;
  actorKind?: 'user' | 'service' | 'signer' | 'system';
  actorId?: string;
  data: Record<string, unknown>;
  dedupeKey: string;
}

export class DomainEventService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Publishes an immutable domain event to the transactional outbox table.
   * Can run within an existing Prisma transaction or standalone.
   */
  async publish(params: DomainEventParams, tx?: any) {
    const client = tx || this.prisma;
    if (!client?.domainEvent) {
      return null;
    }

    const eventId = crypto.randomUUID();
    const cleanData = this.sanitizeSnapshot(params.data);

    try {
      const event = await client.domainEvent.create({
        data: {
          organisationId: params.organisationId,
          eventId,
          eventType: params.eventType,
          schemaVersion: '1.0',
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          sequence: params.sequence ?? 1,
          actorKind: params.actorKind ?? 'user',
          actorId: params.actorId,
          dataSnapshot: cleanData,
          dedupeKey: params.dedupeKey,
          dispatchState: 'PENDING',
        },
      });

      return event;
    } catch (err: any) {
      // If unique constraint on dedupeKey is hit, event is already recorded (idempotent)
      if (err?.code === 'P2002') {
        return await client.domainEvent.findUnique({
          where: {
            organisationId_dedupeKey: {
              organisationId: params.organisationId,
              dedupeKey: params.dedupeKey,
            },
          },
        });
      }
      throw err;
    }
  }

  /**
   * Strips binary file blobs, passwords, tokens, and private secrets from the event snapshot.
   */
  private sanitizeSnapshot(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const excludedKeys = new Set([
      'fileData',
      'fileBase64',
      'signedPdfBase64',
      'sealedPdfBase64',
      'passwordHash',
      'signingTokenHash',
      'verificationToken',
      'mfaSecret',
      'encryptedSecret',
    ]);

    for (const [key, value] of Object.entries(data)) {
      if (excludedKeys.has(key)) continue;
      if (typeof value === 'string' && value.length > 10000) {
        // Exclude huge arbitrary strings
        continue;
      }
      sanitized[key] = value;
    }

    return sanitized;
  }
}
