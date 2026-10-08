import { describe, it, expect } from 'vitest';
import { DnsVerificationService, type DnsResolver } from './dns-verification-service.js';

describe('DnsVerificationService', () => {
  it('returns true when expected token matches in TXT record', async () => {
    const mockResolver: DnsResolver = {
      resolveTxt: async () => [['graphsign-verify=abc123token']],
    };
    const service = new DnsVerificationService(mockResolver);
    const result = await service.verifyTxtRecord('acme.com', 'graphsign-verify=abc123token');
    expect(result).toBe(true);
  });

  it('returns false when expected token is absent', async () => {
    const mockResolver: DnsResolver = {
      resolveTxt: async () => [['v=spf1 include:_spf.google.com ~all']],
    };
    const service = new DnsVerificationService(mockResolver);
    const result = await service.verifyTxtRecord('acme.com', 'graphsign-verify=abc123token');
    expect(result).toBe(false);
  });

  it('returns false when DNS resolution fails or domain not found', async () => {
    const mockResolver: DnsResolver = {
      resolveTxt: async () => {
        throw new Error('ENOTFOUND');
      },
    };
    const service = new DnsVerificationService(mockResolver);
    const result = await service.verifyTxtRecord(
      'invalid-domain.local',
      'graphsign-verify=abc123token',
    );
    expect(result).toBe(false);
  });
});
