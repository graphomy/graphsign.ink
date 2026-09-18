import { AppError } from '../utils/errors.js';

export interface SigningResult {
  pdfBase64: string;
  certificatePem: string;
  timestamp: string | null;
  padesLevel: string;
  subjectDn: string;
  issuerDn: string;
  validFrom: string;
  validTo: string;
  serialNumber: string;
  algorithm: string;
}
export interface SignatureVerification {
  valid: boolean;
  subject: string;
  signingTime: string | null;
  timestamp: string | null;
  padesLevel: string;
}

/** Calls the private signing boundary; never transports private keys to the browser. */
export class SigningClient {
  constructor(
    private readonly url = process.env.SIGNING_SERVICE_URL,
    private readonly token = process.env.SIGNING_SERVICE_TOKEN,
  ) {}

  get configured() {
    return !!this.url && !!this.token;
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    if (!this.configured)
      throw new AppError(
        'SIGNING_UNAVAILABLE',
        'The digital signing service is not configured. Signatures are saved; final sealing must be retried.',
        503,
      );
    const url = new URL(this.url!);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))
      throw new AppError('SIGNING_UNAVAILABLE', 'The signing service requires HTTPS.', 503);
    const response = await fetch(new URL(path, url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok)
      throw new AppError(
        'SIGNING_FAILED',
        'Digital signature processing failed. No verified signed artifact was produced.',
        503,
      );
    return response.json() as Promise<T>;
  }

  sign(body: {
    pdfBase64: string;
    organisationId: string;
    certificateId: string;
    verificationToken: string;
    selfSigned: boolean;
    certificatePem: string;
    tsaUrl?: string | null;
  }) {
    return this.request<SigningResult>('/sign', body);
  }

  verify(pdfBase64: string) {
    return this.request<SignatureVerification>('/verify', { pdfBase64 });
  }
  signHash(body: { organisationId: string; certificateId: string; hashBase64: string }) {
    return this.request<{ signature: string }>('/sign-hash', body);
  }
  timestamp(digestBase64: string, tsaUrl?: string) {
    return this.request<{ tokenBase64: string; timestamp: string; tsaUrl: string }>('/timestamp', {
      digestBase64,
      tsaUrl,
    });
  }

  certificate(body: {
    organisationId: string;
    certificateId: string;
    selfSigned: boolean;
    algorithm?: string;
    commonName?: string;
    validityDays?: number;
    organization?: string;
    organizationUnit?: string;
    country?: string;
    state?: string;
    locality?: string;
    email?: string;
    privateKeyPem?: string;
    certificatePem?: string;
    chainPem?: string;
  }) {
    return this.request<Omit<SigningResult, 'pdfBase64' | 'timestamp' | 'padesLevel'>>(
      '/certificate',
      body,
    );
  }
}
