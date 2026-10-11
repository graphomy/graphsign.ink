import { promises as dnsPromises } from 'dns';

export interface DnsResolver {
  resolveTxt(domain: string): Promise<string[][]>;
}

export class NodeDnsResolver implements DnsResolver {
  async resolveTxt(domain: string): Promise<string[][]> {
    return dnsPromises.resolveTxt(domain);
  }
}

/**
 * Service to verify custom domain DNS TXT ownership proof.
 */
export class DnsVerificationService {
  constructor(private readonly resolver: DnsResolver = new NodeDnsResolver()) {}

  /**
   * Resolves TXT records for a domain and verifies that the expected token is present.
   */
  async verifyTxtRecord(domain: string, expectedToken: string): Promise<boolean> {
    try {
      const records = await this.resolver.resolveTxt(domain);
      const flattened = records.map((entry) => entry.join(''));
      return flattened.some(
        (txt) => txt.trim() === expectedToken.trim() || txt.includes(expectedToken.trim()),
      );
    } catch {
      return false;
    }
  }
}
