import React, { Suspense } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SignDocumentPage from './page';

describe('SignDocumentPage Component Tests (FR-007 Workflow Engine)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
      expect(screen.getByText('Vendor Master Agreement')).toBeDefined();
      expect(screen.getByText(/Jane Signer/)).toBeDefined();
      expect(screen.getByText('Electronic Record and Signature Disclosure:')).toBeDefined();
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

    await waitFor(() => {
      expect(screen.getAllByText(/Include Tax ID/).length).toBeGreaterThan(0);
    });

    // Tax ID field should be hidden by default (unchecked)
    expect(screen.queryByText('Tax Identification Number')).toBeNull();

    // Check the box
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    // Now Tax ID field should become visible
    await waitFor(() => {
      expect(screen.getByText('Tax Identification Number')).toBeDefined();
    });
  });
});
