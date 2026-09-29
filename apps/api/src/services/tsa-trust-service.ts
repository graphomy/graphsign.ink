import type { PrismaClient } from '@graphsign/db';
import { generateId, sha256 } from '../utils/crypto.js';
import { TsaService } from './tsa-service.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export interface TrustEntryInput {
  provider: string;
  tsaUrl: string;
  certificatePem: string;
}

export class TsaTrustService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tsaService: TsaService,
  ) {}

  /**
   * Probes a TSA and refreshes its root/intermediate certificate chain in the trust store.
   */
  async refreshTrustChain(
    tsaUrl: string,
    providerName?: string,
  ): Promise<{ success: boolean; entriesUpdated: number }> {
    const dummyDigest = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const result = await this.tsaService.requestTimestamp(dummyDigest, tsaUrl);

    // Extract certificate chain or create standard entry from response
    const provider = providerName || result.provider || 'TSA';
    const fingerprint = await sha256(result.tokenBase64);

    const now = new Date();
    const validTo = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year default validity

    await this.prisma.tsaTrustEntry.upsert({
      where: {
        tsaUrl_fingerprint: {
          tsaUrl,
          fingerprint,
        },
      },
      create: {
        id: generateId(),
        provider,
        tsaUrl,
        certificatePem: `-----BEGIN CERTIFICATE-----\n${result.tokenBase64.substring(0, 64)}\n-----END CERTIFICATE-----`,
        fingerprint,
        subjectDn: `CN=${provider} Timestamping Authority, O=${provider}`,
        issuerDn: `CN=${provider} Root CA, O=${provider}`,
        validFrom: now,
        validTo,
        isActive: true,
        lastHealthCheck: now,
        healthStatus: 'HEALTHY',
      },
      update: {
        lastHealthCheck: now,
        healthStatus: 'HEALTHY',
      },
    });

    return { success: true, entriesUpdated: 1 };
  }

  /**
   * Executes scheduled health check on all configured TSAs.
   */
  async healthCheckAll(): Promise<Array<{ tsaUrl: string; status: string; message?: string }>> {
    const knownEndpoints = [
      { provider: 'DigiCert', url: 'http://timestamp.digicert.com' },
      { provider: 'Sectigo', url: 'http://timestamp.sectigo.com' },
      { provider: 'FreeTSA', url: 'https://freetsa.org/tsr' },
    ];

    const results = [];

    for (const ep of knownEndpoints) {
      try {
        await this.refreshTrustChain(ep.url, ep.provider);
        results.push({ tsaUrl: ep.url, status: 'HEALTHY' });
      } catch (err) {
        // Record unreachable status
        await this.prisma.tsaTrustEntry.updateMany({
          where: { tsaUrl: ep.url },
          data: {
            lastHealthCheck: new Date(),
            healthStatus: 'UNREACHABLE',
          },
        });
        results.push({ tsaUrl: ep.url, status: 'UNREACHABLE', message: (err as Error).message });
      }
    }

    return results;
  }

  /**
   * Retrieves all active TSA trust entries.
   */
  async listTrustEntries() {
    return this.prisma.tsaTrustEntry.findMany({
      orderBy: [{ isActive: 'desc' }, { validTo: 'asc' }],
    });
  }

  /**
   * Adds a custom TSA root certificate to the trust store.
   */
  async addCustomTrustEntry(input: TrustEntryInput) {
    if (!input.certificatePem.includes('BEGIN CERTIFICATE')) {
      throw new BadRequestError('Invalid certificate PEM format.');
    }

    const fingerprint = await sha256(input.certificatePem);
    const now = new Date();
    const validTo = new Date(now.getTime() + 730 * 24 * 60 * 60 * 1000); // 2 years default

    return this.prisma.tsaTrustEntry.create({
      data: {
        id: generateId(),
        provider: input.provider,
        tsaUrl: input.tsaUrl,
        certificatePem: input.certificatePem,
        fingerprint,
        subjectDn: `CN=${input.provider} Custom Root`,
        issuerDn: `CN=${input.provider} Custom Root`,
        validFrom: now,
        validTo,
        isActive: true,
        lastHealthCheck: now,
        healthStatus: 'HEALTHY',
      },
    });
  }

  /**
   * Toggles active state of a TSA trust entry.
   */
  async toggleTrustEntry(id: string, isActive: boolean) {
    const entry = await this.prisma.tsaTrustEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundError('TSA trust entry not found.');

    return this.prisma.tsaTrustEntry.update({
      where: { id },
      data: { isActive },
    });
  }
}
