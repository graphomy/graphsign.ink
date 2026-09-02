import React, { Suspense } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SignDocumentPage from './page';

describe('SignDocumentPage Component Tests (FR-007 Workflow Engine)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.setItem('graphsign_session_token', 'test-valid-token');
  });

  it('renders loading state initially and then signing interface upon loading session', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/v1/sign/token-123/view')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              agreement: {
                id: 'ag-1',
                title: 'Vendor Master Agreement',
                status: 'SENT',
                signingOrder: 'PARALLEL',
                currentStep: 1,
                senderName: 'Acme Legal',
                organisationName: 'Acme Corp',
                markdownContent: '# Vendor Agreement Terms',
                fields: {
                  fields: [
                    {
                      id: 'f-1',
                      type: 'TEXT',
                      label: 'Full Name',
                      isRequired: true,
                      recipientId: 'recip-1',
                    },
                    {
                      id: 'f-2',
                      type: 'SIGNATURE',
                      label: 'Signature',
                      isRequired: true,
                      recipientId: 'recip-1',
                    },
                  ],
                  recipients: [
                    {
                      id: 'recip-1',
                      name: 'Jane Signer',
                      email: 'jane@example.com',
                      role: 'signer',
                      routingOrder: 1,
                      status: 'INVITED',
                    },
                  ],
                },
              },
              recipient: {
                id: 'recip-1',
                name: 'Jane Signer',
                email: 'jane@example.com',
                role: 'signer',
                status: 'INVITED',
              },
              allRecipients: [
                {
                  id: 'recip-1',
                  name: 'Jane Signer',
                  email: 'jane@example.com',
                  role: 'signer',
                  status: 'INVITED',
                },
              ],
              isTurn: true,
            },
          }),
      });
    });

    render(
      <Suspense fallback={<div>Loading test...</div>}>
        <SignDocumentPage params={{ token: 'token-123' }} />
      </Suspense>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Vendor Master Agreement/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Jane Signer/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Electronic Record/i).length).toBeGreaterThan(0);
    });
  });

  it('evaluates conditional logic rules to hide or show dependent fields (INK-96)', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/v1/sign/token-123/view')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              agreement: {
                id: 'ag-1',
                title: 'Conditional Form Agreement',
                status: 'SENT',
                signingOrder: 'PARALLEL',
                currentStep: 1,
                senderName: 'Acme Legal',
                organisationName: 'Acme Corp',
                fields: {
                  fields: [
                    {
                      id: 'f-check',
                      type: 'CHECKBOX',
                      label: 'Include Tax ID',
                      isRequired: false,
                      recipientId: 'recip-1',
                    },
                    {
                      id: 'f-tax',
                      type: 'TEXT',
                      label: 'Tax Identification Number',
                      isRequired: false,
                      recipientId: 'recip-1',
                      conditionalLogic: [
                        {
                          dependsOnFieldId: 'f-check',
                          condition: 'CHECKED',
                          action: 'SHOW',
                        },
                        {
                          dependsOnFieldId: 'f-check',
                          condition: 'UNCHECKED',
                          action: 'HIDE',
                        },
                      ],
                    },
                  ],
                },
              },
              recipient: {
                id: 'recip-1',
                name: 'Jane Signer',
                email: 'jane@example.com',
                role: 'signer',
                status: 'INVITED',
              },
              allRecipients: [],
              isTurn: true,
            },
          }),
      });
    });

    render(
      <Suspense fallback={<div>Loading test...</div>}>
        <SignDocumentPage params={{ token: 'token-123' }} />
      </Suspense>,
    );

    // Accept ERSD Consent Modal first
    await waitFor(() => {
      expect(screen.getByTestId('ersd-modal-overlay')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('ersd-checkbox'));
    fireEvent.click(screen.getByTestId('ersd-accept-button'));

    await waitFor(() => {
      expect(screen.getAllByText(/Include Tax ID/).length).toBeGreaterThan(0);
    });

    // Tax ID field should be hidden by default (unchecked)
    expect(screen.queryByText('Tax Identification Number')).toBeNull();

    // Check the box
    const checkbox = screen.getByTestId('input-checkbox-f-check');
    fireEvent.click(checkbox);

    // Now Tax ID field should become visible
    await waitFor(() => {
      expect(screen.getAllByText('Tax Identification Number').length).toBeGreaterThan(0);
    });
  });

  it('completes the full signing flow: ERSD consent -> adopted signature -> completed screen -> download (INK-97 to INK-105)', async () => {
    let completeCalled = false;

    global.fetch = vi.fn().mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/sign/token-123/view')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      if (urlStr.includes('/api/v1/sign/token-123/consent')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      if (urlStr.includes('/api/v1/sign/token-123/complete')) {
        completeCalled = true;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { isCompleted: true } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              agreement: {
                id: 'ag-100',
                title: 'Employment Agreement',
                status: 'SENT',
                signingOrder: 'PARALLEL',
                currentStep: 1,
                senderName: 'HR Dept',
                organisationName: 'Acme Global',
                markdownContent: '# Employment Agreement Contract',
                fields: {
                  fields: [
                    {
                      id: 'f-name',
                      type: 'TEXT',
                      label: 'Legal Name',
                      isRequired: true,
                      recipientId: 'recip-1',
                    },
                    {
                      id: 'f-sig',
                      type: 'SIGNATURE',
                      label: 'Employee Signature',
                      isRequired: true,
                      recipientId: 'recip-1',
                    },
                  ],
                  recipients: [
                    {
                      id: 'recip-1',
                      name: 'Sam Developer',
                      email: 'sam@example.com',
                      role: 'signer',
                      routingOrder: 1,
                      status: 'INVITED',
                    },
                  ],
                },
              },
              recipient: {
                id: 'recip-1',
                name: 'Sam Developer',
                email: 'sam@example.com',
                role: 'signer',
                status: 'INVITED',
              },
              allRecipients: [
                {
                  id: 'recip-1',
                  name: 'Sam Developer',
                  email: 'sam@example.com',
                  role: 'signer',
                  status: 'INVITED',
                },
              ],
              isTurn: true,
            },
          }),
      });
    });

    render(
      <Suspense fallback={<div>Loading test...</div>}>
        <SignDocumentPage params={{ token: 'token-123' }} />
      </Suspense>,
    );

    // 1. Check that ERSD Modal appears
    await waitFor(() => {
      expect(screen.getByTestId('ersd-modal-overlay')).toBeDefined();
    });

    // Accept ERSD Consent
    fireEvent.click(screen.getByTestId('ersd-checkbox'));
    fireEvent.click(screen.getByTestId('ersd-accept-button'));

    // 2. Fill in required text field
    await waitFor(() => {
      expect(screen.getByTestId('input-text-f-name')).toBeDefined();
    });
    fireEvent.change(screen.getByTestId('input-text-f-name'), {
      target: { value: 'Sam Developer' },
    });

    // 3. Click signature field to open signature adoption modal
    fireEvent.click(screen.getByTestId('click-to-sign-f-sig'));

    await waitFor(() => {
      expect(screen.getByTestId('signature-modal-overlay')).toBeDefined();
    });

    // Switch to Type tab and adopt
    fireEvent.click(screen.getByTestId('tab-type-signature'));
    fireEvent.change(screen.getByTestId('typed-signature-input'), {
      target: { value: 'Sam Developer' },
    });
    fireEvent.click(screen.getByTestId('adopt-signature-button'));

    // 4. Submit signing action (wait for finish button to appear when 100% complete)
    const finishBtn = await screen.findByTestId('guide-finish-button');
    fireEvent.click(finishBtn);

    // 5. Verify completion view
    await waitFor(() => {
      expect(completeCalled).toBe(true);
      expect(screen.getByText("You're All Set!")).toBeDefined();
      expect(screen.getByTestId('download-signed-document-button')).toBeDefined();
    });
  });

  it('shows Auth Gate when unauthenticated, allows signing as guest, and requires OTP (INK-266)', async () => {
    localStorage.clear();

    let otpSent = false;
    let otpVerified = false;

    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/api/v1/sign/token-guest/view')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }
      if (typeof url === 'string' && url.includes('/api/v1/sign/token-guest/otp/send')) {
        otpSent = true;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, expiresInSeconds: 600 }),
        });
      }
      if (typeof url === 'string' && url.includes('/api/v1/sign/token-guest/otp/verify')) {
        otpVerified = true;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, verified: true }),
        });
      }
      if (
        typeof url === 'string' &&
        (url.includes('/api/v1/sign/token-guest/complete') ||
          url.includes('/api/v1/sign/token-guest/submit'))
      ) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ success: true, data: { isCompleted: true, status: 'COMPLETED' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              agreement: {
                id: 'ag-guest-1',
                title: 'Guest Agreement Test',
                status: 'SENT',
                signingOrder: 'PARALLEL',
                currentStep: 1,
                senderName: 'Sender Alice',
                organisationName: 'Guest Org',
                markdownContent: '# Guest Agreement Content',
                fields: {
                  fields: [
                    {
                      id: 'f-sig-1',
                      type: 'SIGNATURE',
                      label: 'Signature',
                      isRequired: true,
                      recipientId: 'recip-guest-1',
                    },
                  ],
                  recipients: [
                    {
                      id: 'recip-guest-1',
                      name: 'Guest Signer',
                      email: 'guest@example.com',
                      role: 'signer',
                      routingOrder: 1,
                      status: 'INVITED',
                    },
                  ],
                },
              },
              recipient: {
                id: 'recip-guest-1',
                name: 'Guest Signer',
                email: 'guest@example.com',
                role: 'signer',
                status: 'INVITED',
              },
              allRecipients: [
                {
                  id: 'recip-guest-1',
                  name: 'Guest Signer',
                  email: 'guest@example.com',
                  role: 'signer',
                  routingOrder: 1,
                  status: 'INVITED',
                },
              ],
              isTurn: true,
            },
          }),
      });
    });

    render(
      <Suspense fallback={<div>Loading test...</div>}>
        <SignDocumentPage params={{ token: 'token-guest' }} />
      </Suspense>,
    );

    // 1. Check that Auth Gate appears
    await waitFor(() => {
      expect(screen.getByText('Sign Document')).toBeDefined();
      expect(screen.getByText('Log In with Existing Account')).toBeDefined();
      expect(screen.getByText('Sign as Guest (Email OTP Required)')).toBeDefined();
    });

    // 2. Click "Sign as Guest"
    fireEvent.click(screen.getByText('Sign as Guest (Email OTP Required)'));

    // 3. ERSD modal appears
    await waitFor(() => {
      expect(screen.getByTestId('ersd-modal-overlay')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('ersd-checkbox'));
    fireEvent.click(screen.getByTestId('ersd-accept-button'));

    // 4. Sign document
    await waitFor(() => {
      expect(screen.getByTestId('click-to-sign-f-sig-1')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('click-to-sign-f-sig-1'));
    await waitFor(() => {
      expect(screen.getByTestId('signature-modal-overlay')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('tab-type-signature'));
    fireEvent.change(screen.getByTestId('typed-signature-input'), {
      target: { value: 'Guest Signer' },
    });
    fireEvent.click(screen.getByTestId('adopt-signature-button'));

    // 5. Click finish - triggers OTP dispatch & opens OTP modal
    const finishBtn = await screen.findByTestId('guide-finish-button');
    fireEvent.click(finishBtn);

    await waitFor(() => {
      expect(otpSent).toBe(true);
      expect(screen.getByText('Verify Your Identity')).toBeDefined();
    });

    // 6. Enter OTP digits and confirm
    const inputs = screen.getAllByRole('textbox');
    const otpInputs = inputs.filter((inp) => inp.getAttribute('inputmode') === 'numeric');
    expect(otpInputs.length).toBe(6);

    otpInputs.forEach((inp, idx) => {
      fireEvent.change(inp, { target: { value: String(idx + 1) } });
    });

    fireEvent.click(screen.getByText('Confirm & Seal Signature'));

    // 7. Verify completed
    await waitFor(() => {
      expect(otpVerified).toBe(true);
      expect(screen.getByText("You're All Set!")).toBeDefined();
    });
  });
});
