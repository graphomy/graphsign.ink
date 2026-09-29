import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PublicVerifyPage from './page';

describe('PublicVerifyPage Component Tests (INK-135 to INK-139)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all 4 tabs and defaults to Token verification tab', () => {
    render(<PublicVerifyPage />);

    expect(screen.getByRole('button', { name: /Enter ID \/ Token/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Upload PDF/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Batch Verify/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Offline Verify/i })).toBeDefined();

    expect(screen.getByLabelText(/Verification Token, Document ID, or Envelope ID/i)).toBeDefined();
  });

  it('switches to Batch Verify tab and enforces max 100 documents limit', async () => {
    render(<PublicVerifyPage />);

    const batchTabBtn = screen.getByRole('button', { name: /Batch Verify/i });
    fireEvent.click(batchTabBtn);

    expect(screen.getByText(/Batch Document Signature Verification/i)).toBeDefined();
    expect(screen.getByText(/0 \/ 100 files/i)).toBeDefined();

    const fileInput = document.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    expect(fileInput).toBeDefined();

    // Create 105 mock files
    const excessFiles = Array.from(
      { length: 105 },
      (_, i) => new File(['content'], `doc-${i}.pdf`, { type: 'application/pdf' }),
    );

    fireEvent.change(fileInput, { target: { files: excessFiles } });

    await waitFor(() => {
      expect(screen.getByText(/Maximum 100 documents allowed per batch/i)).toBeDefined();
      expect(screen.getByText(/100 \/ 100 files/i)).toBeDefined();
    });
  });

  it('executes batch verification and displays results summary (INK-136)', async () => {
    global.fetch = vi.fn().mockImplementation((url, init) => {
      if (typeof url === 'string' && url.includes('/api/v1/verify/batch')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                total: 2,
                validCount: 1,
                invalidCount: 1,
                unsignedCount: 0,
                results: [
                  {
                    documentId: 'doc-1',
                    documentTitle: 'contract.pdf',
                    isValid: true,
                    status: 'VALID',
                    signerName: 'Alice Smith',
                    verifiedAt: '2026-09-11T12:00:00Z',
                  },
                  {
                    documentId: 'doc-2',
                    documentTitle: 'invoice.pdf',
                    isValid: false,
                    status: 'TAMPERED',
                    signerName: 'Bob Jones',
                    verifiedAt: '2026-09-11T12:01:00Z',
                    details: 'Document modified after sealing.',
                  },
                ],
              },
            }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<PublicVerifyPage />);

    fireEvent.click(screen.getByRole('button', { name: /Batch Verify/i }));

    const fileInput = document.querySelector('input[type="file"][multiple]') as HTMLInputElement;
    const testFiles = [
      new File(['doc1-content'], 'contract.pdf', { type: 'application/pdf' }),
      new File(['doc2-content'], 'invoice.pdf', { type: 'application/pdf' }),
    ];
    fireEvent.change(fileInput, { target: { files: testFiles } });

    await waitFor(() => {
      expect(screen.getByText(/Ready to verify 2 documents/i)).toBeDefined();
    });

    const verifyBtn = screen.getByRole('button', { name: /Verify Batch \(2\)/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByText('contract.pdf')).toBeDefined();
      expect(screen.getByText('Alice Smith')).toBeDefined();
      expect(screen.getByText('invoice.pdf')).toBeDefined();
      expect(screen.getByText('Export CSV')).toBeDefined();
      expect(screen.getByText('Export PDF Report')).toBeDefined();
    });
  });

  it('switches to Offline Verify tab and allows document selection (INK-137)', async () => {
    render(<PublicVerifyPage />);

    const offlineTabBtn = screen.getByRole('button', { name: /Offline Verify/i });
    fireEvent.click(offlineTabBtn);

    expect(screen.getByText(/Offline Standalone Verification/i)).toBeDefined();
    expect(screen.getByText(/Signed Document File \(Required\)/i)).toBeDefined();
    expect(screen.getByText(/Root Certificate PEM \/ CER \(Optional\)/i)).toBeDefined();

    const verifyBtn = screen.getByRole('button', { name: /Execute Offline Verification/i });
    expect(verifyBtn).toBeDefined();
    expect(verifyBtn.hasAttribute('disabled')).toBe(true);
  });

  it('displays Expired status banner for expired signatures (INK-139)', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/verify/GS-expired-123')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              isValid: false,
              status: 'EXPIRED',
              verificationToken: 'GS-expired-123',
              documentTitle: 'Expired Warranty Deed',
              documentHash: 'c0ffee1234567890abcdef',
              completedAt: '2025-01-01T00:00:00Z',
              totalSigners: 1,
              signedSigners: 1,
              sealDetails: {
                algorithm: 'SHA256withRSA',
                padesLevel: 'B_T',
                tsaUrl: null,
                tsaTimestamp: null,
              },
              organisationName: 'Old Firm Inc',
              sealedAt: '2025-01-01T00:00:00Z',
            }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    render(<PublicVerifyPage />);

    const input = screen.getByLabelText(/Verification Token, Document ID, or Envelope ID/i);
    fireEvent.change(input, { target: { value: 'GS-expired-123' } });

    const verifyBtn = screen.getByRole('button', { name: /Verify Authenticity/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByText(/Signature Expired/i)).toBeDefined();
      expect(screen.getByText(/outside its valid lifecycle dates/i)).toBeDefined();
    });
  });
});
