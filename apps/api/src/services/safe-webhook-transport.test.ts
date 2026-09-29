import { describe, it, expect } from 'vitest';
import { validateWebhookUrl } from './safe-webhook-transport.js';

describe('SafeWebhookTransport SSRF Protection (INK-157, FR-017.008)', () => {
  it('accepts valid public HTTPS target URLs', async () => {
    const valid = await validateWebhookUrl('https://api.example.com/webhooks/graphsign');
    expect(valid.valid).toBe(true);
  });

  it('rejects plain HTTP scheme (unless localhost)', async () => {
    const res = await validateWebhookUrl('http://insecure-api.example.com/webhook');
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('HTTPS');
  });

  it('allows localhost for development testing when explicit', async () => {
    const res = await validateWebhookUrl('http://localhost:3000/webhook');
    expect(res.valid).toBe(true);
  });

  it('rejects loopback and private IPv4 ranges (SSRF protection)', async () => {
    const loopback = await validateWebhookUrl('http://127.0.0.1:8080/hook');
    expect(loopback.valid).toBe(false);

    const privateClassA = await validateWebhookUrl('https://10.0.1.50/hook');
    expect(privateClassA.valid).toBe(false);

    const privateClassB = await validateWebhookUrl('https://172.16.0.1/hook');
    expect(privateClassB.valid).toBe(false);

    const privateClassC = await validateWebhookUrl('https://192.168.1.1/hook');
    expect(privateClassC.valid).toBe(false);

    const cloudMetadata = await validateWebhookUrl('http://169.254.169.254/latest/meta-data');
    expect(cloudMetadata.valid).toBe(false);
  });
});
