import type { PrismaClient } from '@graphsign/db';
import { sha256 } from '../utils/crypto.js';
import { WebhookFilterService } from './webhook-filter-service.js';
import type { WebhookEnvelope } from '../contracts/webhook-events.js';

export class WebhookDispatchService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Fans out a domain event to all eligible tenant webhook subscriptions (INK-158).
   */
  async fanOutEvent(eventId: string) {
    if (!this.prisma?.domainEvent || !this.prisma?.webhookSubscription) {
      return [];
    }

    const event = await this.prisma.domainEvent.findUnique({
      where: { eventId },
    });

    if (!event) return [];

    // Find active subscriptions in the same organisation that subscribe to this event type
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: {
        organisationId: event.organisationId,
        status: 'active',
        deletedAt: null,
      },
    });

    const deliveries = [];

    for (const sub of subscriptions) {
      const subscribedTypes = Array.isArray(sub.eventTypes) ? (sub.eventTypes as string[]) : [];
      if (!subscribedTypes.includes(event.eventType) && !subscribedTypes.includes('*')) {
        continue;
      }

      const eventData = (event.dataSnapshot as Record<string, unknown>) || {};

      // Evaluate AST Filter rules (INK-162)
      const passesFilter = WebhookFilterService.evaluateFilter(
        sub.filterRules as any,
        eventData,
      );
      if (!passesFilter) {
        continue;
      }

      // Project custom fields (INK-164)
      const projectedData = WebhookFilterService.projectPayload(
        eventData,
        sub.payloadProjection as any,
      );

      const envelope: WebhookEnvelope = {
        id: event.eventId,
        event: event.eventType as any,
        schemaVersion: event.schemaVersion,
        timestamp: event.occurredAt.toISOString(),
        organisationId: event.organisationId,
        sequence: event.sequence,
        test: false,
        data: projectedData,
      };

      const payloadBytes = JSON.stringify(envelope);
      const payloadHash = await sha256(payloadBytes);

      try {
        const delivery = await this.prisma.webhookDelivery.create({
          data: {
            organisationId: event.organisationId,
            eventId: event.eventId,
            subscriptionId: sub.id,
            replayGeneration: 1,
            payloadBytes,
            payloadHash,
            configRevision: sub.configRevision,
            state: 'PENDING',
            attemptCount: 0,
            nextAttemptAt: new Date(),
          },
        });
        deliveries.push(delivery);
      } catch (err: any) {
        // Idempotent duplicate check
        if (err?.code !== 'P2002') {
          console.error('[WEBHOOK_DISPATCH] Failed to create delivery:', err);
        }
      }
    }

    // Mark event as DISPATCHED
    await this.prisma.domainEvent
      .update({
        where: { id: event.id },
        data: { dispatchState: 'DISPATCHED' },
      })
      .catch(() => {});

    return deliveries;
  }
}
