import { describe, it, expect } from 'vitest';
import { WebhookSigningService } from './webhook-signing-service.js';

describe('WebhookSigningService (INK-159, FR-017.009)', () => {
  it('generates a 64-character hexadecimal secret (256 bits)', () => {
    const secret = WebhookSigningService.generateSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signs payload with HMAC-SHA256 and verifies successfully', async () => {
    const secret = WebhookSigningService.generateSecret();
    const payload = JSON.stringify({
      id: 'd9b35b6f-44e2-45ad-b825-e51c89fbf914',
      event: 'document.completed',
      timestamp: new Date().toISOString(),
      data: { document_id: 'doc-123', status: 'COMPLETED' },
    });

    const signature = await WebhookSigningService.signPayload(payload, secret);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);

    const isValid = await WebhookSigningService.verifySignature(payload, signature, secret);
    expect(isValid).toBe(true);
  });

  it('rejects signature when payload is tampered', async () => {
    const secret = WebhookSigningService.generateSecret();
    const original = JSON.stringify({ event: 'document.completed', amount: 100 });
    const tampered = JSON.stringify({ event: 'document.completed', amount: 999 });

    const signature = await WebhookSigningService.signPayload(original, secret);
    const isValid = await WebhookSigningService.verifySignature(tampered, signature, secret);

    expect(isValid).toBe(false);
  });

  it('rejects signature when wrong secret is used', async () => {
    const secret1 = WebhookSigningService.generateSecret();
    const secret2 = WebhookSigningService.generateSecret();
    const payload = JSON.stringify({ event: 'document.signed' });

    const signature = await WebhookSigningService.signPayload(payload, secret1);
    const isValid = await WebhookSigningService.verifySignature(payload, signature, secret2);

    expect(isValid).toBe(false);
  });
});
