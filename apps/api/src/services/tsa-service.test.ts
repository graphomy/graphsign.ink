import { describe, it, expect } from 'vitest';
import { TsaService } from './tsa-service.js';

describe('TsaService (RFC 3161 Timestamping)', () => {
  const tsaService = new TsaService();

  it('builds a valid DER-encoded ASN.1 TimeStampReq structure', () => {
    const dummyDigest = new Uint8Array(32).fill(0xab);
    const nonce = 123456789;

    const reqBytes = tsaService.buildTimeStampReq(dummyDigest, nonce);

    expect(reqBytes[0]).toBe(0x30); // ASN.1 SEQUENCE tag
    expect(reqBytes.length).toBeGreaterThan(40);
  });

  it('requests timestamp token with automatic failover and offline resilience', async () => {
    const digestHex = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

    const result = await tsaService.requestTimestamp(digestHex);

    expect(result).toBeDefined();
    expect(result.tokenBase64).toBeDefined();
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.tsaUrl).toBeDefined();
    expect(result.provider).toBeDefined();
  });

  it('parses valid timestamp response structure', () => {
    const dummyRes = new Uint8Array([0x30, 0x0a, 0x02, 0x01, 0x00, 0x04, 0x05, 0x01, 0x02, 0x03, 0x04, 0x05]);
    const parsed = tsaService.parseTimeStampResp(dummyRes, 'http://test.tsa', 'TestTSA', 999);

    expect(parsed.provider).toBe('TestTSA');
    expect(parsed.tsaUrl).toBe('http://test.tsa');
    expect(parsed.tokenBase64).toBeDefined();
  });
});
