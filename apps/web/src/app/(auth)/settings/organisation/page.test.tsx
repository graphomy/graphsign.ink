import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import OrganisationSettingsPage from './page';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock fetch
global.fetch = vi.fn();

describe('OrganisationSettingsPage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.setItem('graphsign_session_token', 'fake-jwt-token');
    localStorageMock.setItem('graphsign_user_id', 'user-123');
    vi.clearAllMocks();
  });

  it('renders organisation settings header and tabs', async () => {
    vi.mocked(global.fetch).mockImplementation((url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('/organisations/me/branding')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ logoUrl: null, primaryColor: '#ba0000' }),
        } as Response);
      }
      if (urlStr.includes('/organisations/me/usage')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              storageQuotaBytes: '5368709120',
              storageUsedBytes: '0',
              storageUsagePercent: 0,
              documentCount: 0,
              maxDocuments: 1000,
            }),
        } as Response);
      }
      if (urlStr.includes('/organisations/me/compliance')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              allowedEsignStandards: ['ESIGN'],
              signatureReasonRequired: false,
            }),
        } as Response);
      }
      if (urlStr.includes('/organisations/invitations')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'org-1',
            name: 'Acme Legal Workspace',
            slug: 'acme-legal',
            sessionTimeoutMinutes: 15,
            mfaRequired: false,
          }),
      } as Response);
    });

    render(<OrganisationSettingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('organisation-settings-container')).toBeInTheDocument();
    });

    expect(screen.getByTestId('tab-general')).toBeInTheDocument();
    expect(screen.getByTestId('tab-branding')).toBeInTheDocument();
    expect(screen.getByTestId('tab-members')).toBeInTheDocument();
    expect(screen.getByTestId('tab-usage')).toBeInTheDocument();
    expect(screen.getByTestId('tab-compliance')).toBeInTheDocument();
  });

  it('switches between tabs cleanly', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ name: 'Acme' }),
    } as Response);

    render(<OrganisationSettingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('tab-branding')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('tab-branding'));
    expect(screen.getByTestId('branding-form')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-members'));
    expect(screen.getByTestId('members-section')).toBeInTheDocument();
  });

  it('renders compliance settings with retention days and delete account trigger', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          name: 'Acme Legal',
          documentRetentionDays: 30,
          allowedEsignStandards: ['ESIGN'],
        }),
    } as Response);

    render(<OrganisationSettingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('tab-compliance')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('tab-compliance'));
    expect(screen.getByTestId('compliance-form')).toBeInTheDocument();
    expect(screen.getByText('Delete Account (Right to Erasure)')).toBeInTheDocument();

    // Click delete account button to open modal
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
    expect(screen.getByText('Confirm Permanent Account Deletion')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your account password...')).toBeInTheDocument();
  });

  it('renders audit logs with pagination controls', async () => {
    vi.mocked(global.fetch).mockImplementation((url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes('/audit-logs')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              logs: [
                {
                  id: 'log-1',
                  action: 'DOCUMENT_CREATED',
                  resourceType: 'Agreement',
                  createdAt: new Date().toISOString(),
                  user: { email: 'admin@acme.com' },
                },
              ],
              total: 1,
              page: 1,
              totalPages: 1,
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ name: 'Acme Legal' }),
      } as Response);
    });

    render(<OrganisationSettingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('tab-audit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('tab-audit'));
    expect(screen.getByTestId('audit-section')).toBeInTheDocument();
    expect(screen.getByText('DOCUMENT_CREATED')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });
});
