import React, { Suspense } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TokenVerifyPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'GS-test-token-123' }),
}));

describe('TokenVerifyPage Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state initially and displays verification report upon success', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/verify/GS-test-token-123')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              isValid: true,
              status: 'VALID',
              verificationToken: 'GS-test-token-123',
              documentTitle: 'Non-Disclosure Agreement',
              documentHash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
              completedAt: '2026-08-30T12:00:00.000Z',
              totalSigners: 2,
              signedSigners: 2,
              sealDetails: {
                algorithm: 'SHA256withRSA',
                padesLevel: 'B_LTA',
                tsaUrl: 'https://timestamp.digicert.com',
                tsaTimestamp: '2026-08-30T12:00:00.000Z',
                tsaProvider: 'DigiCert RFC 3161 TSA',
                certificateSubject: 'CN=graphsign Document Signing CA',
                certificateIssuer: 'CN=graphsign Root CA',
              },
              organisationName: 'Acme Legal Corp',
              sealedAt: '2026-08-30T12:00:00.000Z',
            }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TokenVerifyPage />
      </Suspense>,
    );

    await waitFor(() => {
      expect(screen.getByText('Non-Disclosure Agreement')).toBeDefined();
      expect(screen.getByText('Acme Legal Corp')).toBeDefined();
      expect(screen.getByText(/Cryptographically Sealed & Authentic/i)).toBeDefined();
      expect(screen.getByText(/2 of 2 signers completed/i)).toBeDefined();
      expect(screen.getByText(/PAdES B-LTA/i)).toBeDefined();
    });
  });

  it('handles error state when verification record is not found', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: { message: 'Not found' } }),
      });
    });

    render(
      <Suspense fallback={<div>Loading...</div>}>
        <TokenVerifyPage />
      </Suspense>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Verification Record Not Found/i)).toBeDefined();
      expect(
        screen.getByText(/No verification record found for token "GS-test-token-123"/i),
      ).toBeDefined();
    });
  });
});
