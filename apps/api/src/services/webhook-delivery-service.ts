import type { PrismaClient } from '@graphsign/db';
import { SafeWebhookTransport } from './safe-webhook-transport.js';
import { WebhookSigningService } from './webhook-signing-service.js';
import type { MailerService } from './mailer-service.js';

export interface WebhookDeliveryOptions {
  transport?: SafeWebhookTransport;
  mailer?: MailerService;
}

export class WebhookDeliveryService {
  private readonly transport: SafeWebhookTransport;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly options?: WebhookDeliveryOptions,
  ) {
    this.transport = options?.transport || new SafeWebhookTransport();
  }

  /**
   * Executes an individual webhook delivery with lease fencing, signing, and retry/DLQ handling (INK-158, INK-161).
   */
  async executeDelivery(deliveryId: string) {
    if (!this.prisma?.webhookDelivery) return null;

    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        subscription: {
          include: {
            signingKeys: {
              where: { retiredAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            owner: { select: { email: true, name: true } },
          },
        },
      },
    });

    if (!delivery || !delivery.subscription) return null;

    // Check if subscription was disabled or deleted mid-flight
    if (delivery.subscription.status !== 'active' || delivery.subscription.deletedAt) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { state: 'CANCELLED', lastErrorMessage: 'Subscription disabled or removed.' },
      });
      return { success: false, state: 'CANCELLED' };
    }

    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 30_000); // 30s lease
    const attemptNumber = delivery.attemptCount + 1;

    // Acquire lease atomically
    const leaseAcquired = await this.prisma.webhookDelivery.updateMany({
      where: {
        id: delivery.id,
        leaseVersion: delivery.leaseVersion,
      },
      data: {
        state: 'IN_FLIGHT',
        attemptCount: attemptNumber,
        leaseUntil,
        leaseVersion: delivery.leaseVersion + 1,
      },
    });

    if (leaseAcquired.count === 0) {
      return { success: false, state: 'LEASE_CONFLICT' };
    }

    const signingKey = delivery.subscription.signingKeys[0];
    const secret = signingKey?.encryptedSecret || 'default_webhook_secret';
    const keyId = signingKey?.keyId || 'primary';

    // Sign exact payload bytes
    const signatureHex = await WebhookSigningService.sign(delivery.payloadBytes, secret);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Signature': `sha256=${signatureHex}`,
      'X-Signature-Key-ID': keyId,
      'X-Delivery-ID': delivery.id,
      'X-Event-ID': delivery.eventId,
      'X-Attempt-Number': String(attemptNumber),
    };

    // Custom headers if present
    if (delivery.subscription.encryptedCustomHeaders) {
      try {
        const parsedCustom = JSON.parse(delivery.subscription.encryptedCustomHeaders);
        if (typeof parsedCustom === 'object') {
          Object.assign(headers, parsedCustom);
        }
      } catch {
        // Skip malformed custom headers
      }
    }

    let httpStatus: number | undefined;
    let durationMs = 0;
    let responseSnippet = '';
    let errorMessage: string | undefined;
    let isSuccess = false;

    try {
      const response = await this.transport.send({
        url: delivery.subscription.targetUrl,
        body: delivery.payloadBytes,
        headers,
      });

      httpStatus = response.statusCode;
      durationMs = response.durationMs;
      responseSnippet = response.responseSnippet;
      isSuccess = response.statusCode >= 200 && response.statusCode < 300;

      if (!isSuccess) {
        errorMessage = `HTTP error ${response.statusCode}: ${responseSnippet.substring(0, 200)}`;
      }
    } catch (err: any) {
      errorMessage = err.message || 'Network transport failure';
      httpStatus = 0;
    }

    // Record append-only WebhookAttempt
    await this.prisma.webhookAttempt.create({
      data: {
        organisationId: delivery.organisationId,
        deliveryId: delivery.id,
        attemptNumber,
        signingKeyId: keyId,
        finishedAt: new Date(),
        durationMs,
        httpStatus,
        errorCategory: isSuccess ? undefined : this.categorizeError(httpStatus, errorMessage),
        responseSnippet,
      },
    });

    if (isSuccess) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          state: 'SUCCEEDED',
          lastStatusCode: httpStatus,
          lastErrorMessage: null,
        },
      });
      await this.recordMetric(delivery.organisationId, delivery.subscriptionId, durationMs, true);
      return { success: true, state: 'SUCCEEDED' };
    }

    // Failure Handling & Retries (INK-161)
    const isRetriable = this.isRetriableError(httpStatus);
    const maxAttempts = 4; // 1 initial + 3 retries = 4 attempts total

    if (isRetriable && attemptNumber < maxAttempts) {
      // Exponential backoff: 1s, 2s, 4s + jitter
      const backoffSeconds = Math.pow(2, attemptNumber - 1) + Math.random();
      const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000);

      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          state: 'RETRY_SCHEDULED',
          nextAttemptAt,
          lastStatusCode: httpStatus,
          lastErrorMessage: errorMessage,
        },
      });

      return { success: false, state: 'RETRY_SCHEDULED', nextAttemptAt };
    }

    // Terminal Failure -> Move to Dead Letter Queue (DLQ)
    const dlqExpiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000); // 30 days retention

    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        state: 'DEAD_LETTER',
        lastStatusCode: httpStatus,
        lastErrorMessage: errorMessage,
      },
    });

    await this.prisma.webhookDeadLetter
      .upsert({
        where: { deliveryId: delivery.id },
        create: {
          organisationId: delivery.organisationId,
          subscriptionId: delivery.subscriptionId,
          deliveryId: delivery.id,
          reason: errorMessage || 'Terminal webhook delivery failure',
          expiresAt: dlqExpiresAt,
        },
        update: {
          reason: errorMessage || 'Terminal webhook delivery failure',
        },
      })
      .catch(() => {});

    // Notify subscription owner via Mailer (INK-161)
    if (this.options?.mailer?.sendNotificationEmail && delivery.subscription.owner?.email) {
      this.options.mailer
        .sendNotificationEmail(
          delivery.subscription.owner.email,
          'Webhook Delivery Terminal Failure Alert',
          `Your webhook subscription "${delivery.subscription.name}" to ${delivery.subscription.targetUrl} has failed after ${attemptNumber} attempts.\n\nError: ${errorMessage}\n\nPlease inspect the integration settings or trigger a replay once your receiver is restored.`,
          {
            organisationId: delivery.organisationId,
            eventType: 'WEBHOOK_DLQ_ALERT',
          },
        )
        .catch(() => {});
    }

    await this.recordMetric(delivery.organisationId, delivery.subscriptionId, durationMs, false);
    return { success: false, state: 'DEAD_LETTER', error: errorMessage };
  }

  private isRetriableError(status?: number): boolean {
    if (!status || status === 0) return true; // Network / DNS failure
    if (status === 408 || status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    return false; // 4xx client errors (400, 401, 403, 404, etc.) are terminal
  }

  private categorizeError(status?: number, message?: string): string {
    if (message?.includes('timed out')) return 'TIMEOUT';
    if (!status || status === 0) return 'NETWORK_ERROR';
    if (status === 429) return 'RATE_LIMITED';
    if (status >= 500) return 'SERVER_ERROR';
    if (status >= 400) return 'CLIENT_ERROR';
    return 'UNKNOWN';
  }

  private async recordMetric(
    organisationId: string,
    subscriptionId: string,
    durationMs: number,
    success: boolean,
  ) {
    if (!this.prisma?.webhookMetricBucket) return;
    try {
      const now = new Date();
      // Truncate to current hour bucket
      const timeBucket = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        0,
        0,
        0,
      );

      await this.prisma.webhookMetricBucket.upsert({
        where: {
          organisationId_subscriptionId_timeBucket: {
            organisationId,
            subscriptionId,
            timeBucket,
          },
        },
        create: {
          organisationId,
          subscriptionId,
          timeBucket,
          deliveriesCount: 1,
          attemptsCount: 1,
          successCount: success ? 1 : 0,
          failureCount: success ? 0 : 1,
          p50DurationMs: durationMs,
          p95DurationMs: durationMs,
        },
        update: {
          deliveriesCount: { increment: 1 },
          attemptsCount: { increment: 1 },
          successCount: { increment: success ? 1 : 0 },
          failureCount: { increment: success ? 0 : 1 },
        },
      });
    } catch {
      // Ignore metric collection errors
    }
  }
}
