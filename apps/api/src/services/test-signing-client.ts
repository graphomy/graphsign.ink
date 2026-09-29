/** Deterministic external signing-boundary fixture; JVM tests validate real cryptography. */
export class TestSigningClient {
  configured = true;
  async sign(body: { pdfBase64: string }) {
    return {
      ...(await this.certificate()),
      pdfBase64: body.pdfBase64,
      padesLevel: 'B_B',
      timestamp: null,
    };
  }
  async signHash() {
    return { signature: 'EXTERNAL_SIGNATURE_FIXTURE' };
  }
  async certificate() {
    return {
      certificatePem: '-----BEGIN CERTIFICATE-----\nEXTERNAL_FIXTURE\n-----END CERTIFICATE-----',
      algorithm: 'RSA_2048',
      subjectDn: 'CN=Test Signing',
      issuerDn: 'CN=Test Signing',
      serialNumber: '123',
      validFrom: '2026-01-01T00:00:00Z',
      validTo: '2030-01-01T00:00:00Z',
    };
  }
  async timestamp(_digestBase64: string, tsaUrl?: string) {
    return {
      tokenBase64: Buffer.from('TEST_TSA_TOKEN').toString('base64'),
      timestamp: new Date().toISOString(),
      tsaUrl: tsaUrl || 'https://freetsa.org/tsr',
    };
  }
  async verify() {
    return {
      valid: true,
      subject: 'CN=Test Signing',
      signingTime: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      padesLevel: 'B_B',
    };
  }
}
