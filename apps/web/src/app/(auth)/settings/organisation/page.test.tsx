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
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/organisations/me/branding')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ logoUrl: null, primaryColor: '#ba0000' }),
        });
      }
      if (url.includes('/organisations/me/usage')) {
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
        });
      }
      if (url.includes('/organisations/me/compliance')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              allowedEsignStandards: ['ESIGN'],
              signatureReasonRequired: false,
            }),
        });
      }
      if (url.includes('/organisations/invitations')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
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
      });
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
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ name: 'Acme' }),
    });

    render(<OrganisationSettingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('tab-branding')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('tab-branding'));
    expect(screen.getByTestId('branding-form')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('tab-[#members]' ? 'tab-members' : 'tab-members'));
    expect(screen.getByTestId('members-section')).toBeInTheDocument();
  });
});
