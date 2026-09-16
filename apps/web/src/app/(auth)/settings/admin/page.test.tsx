import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdminDashboardPage from './page';

vi.mock('@/components/features/auth/SessionGuard', () => ({
  SessionGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/layout/HeaderNav', () => ({
  HeaderNav: () => <nav data-testid="header-nav">HeaderNav</nav>,
}));

vi.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}));

describe('AdminDashboardPage Control Plane Unit Tests (FR-015 / INK-287)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('graphsign_session_token', 'valid_admin_token');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/admin/health')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                status: 'healthy',
                database: { status: 'connected', latencyMs: 3 },
                uptimeSeconds: 7200,
                memory: { rssBytes: 104857600, heapUsedBytes: 52428800, heapTotalBytes: 83886080 },
                timestamp: '2026-09-16T12:00:00Z',
              }),
          });
        }
        if (url.includes('/api/v1/admin/stats')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                totalUsers: 15,
                totalOrgs: 4,
                totalAgreements: 48,
                totalStorageUsedBytes: '10485760',
              }),
          });
        }
        if (url.includes('/api/v1/admin/maintenance')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                isActive: false,
                message: 'System operating normally.',
                scope: 'platform',
              }),
          });
        }
        if (url.includes('/api/v1/admin/organisations')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                items: [
                  {
                    id: 'org-1',
                    name: 'Acme Global',
                    slug: 'acme-global',
                    status: 'active',
                    planType: 'teams',
                    storageQuotaBytes: '1073741824',
                    storageUsedBytes: '10485760',
                    maxDocuments: 100,
                    documentCount: 12,
                    maxUsers: 50,
                    activeUsersCount: 8,
                    totalAgreements: 20,
                    sessionTimeoutMinutes: 60,
                    mfaRequired: false,
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-02T00:00:00Z',
                  },
                ],
                pagination: { page: 1, totalPages: 1, total: 1 },
              }),
          });
        }
        if (url.includes('/api/v1/admin/feature-flags')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                flags: [
                  {
                    id: 'flag-1',
                    key: 'qes_signatures',
                    name: 'QES Signatures',
                    description: 'Enables qualified electronic signatures',
                    isEnabled: true,
                    tenantOverrides: {},
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-02T00:00:00Z',
                  },
                ],
              }),
          });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      }),
    );
  });

  it('renders Super Admin Control Plane header and overview tab by default', async () => {
    render(<AdminDashboardPage />);

    expect(screen.getByText('Super Admin Control Plane')).toBeInTheDocument();
    expect(screen.getByText('Overview & Health')).toBeInTheDocument();
    expect(screen.getByText('Tenants Directory')).toBeInTheDocument();
    expect(screen.getByText('Maintenance Mode')).toBeInTheDocument();
    expect(screen.getByText('Feature Flags')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Platform Runtime Telemetry & Diagnostics')).toBeInTheDocument();
      expect(screen.getByText(/HEALTHY/i)).toBeInTheDocument();
    });
  });

  it('navigates to Tenants Directory and displays tenant details', async () => {
    render(<AdminDashboardPage />);

    const tenantsTab = screen.getByText('Tenants Directory');
    fireEvent.click(tenantsTab);

    await waitFor(() => {
      expect(screen.getByText('Workspace Tenants Directory')).toBeInTheDocument();
      expect(screen.getByText('Acme Global')).toBeInTheDocument();
      expect(screen.getByText('Override Limits')).toBeInTheDocument();
    });
  });

  it('opens and closes the Override Limits modal for a tenant', async () => {
    render(<AdminDashboardPage />);

    fireEvent.click(screen.getByText('Tenants Directory'));

    await waitFor(() => {
      expect(screen.getByText('Acme Global')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Override Limits'));

    expect(screen.getByText('Override Limits: Acme Global')).toBeInTheDocument();
    expect(screen.getByText('Audit Reason')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Override Limits: Acme Global')).not.toBeInTheDocument();
  });

  it('navigates to Feature Flags tab and displays configured flags', async () => {
    render(<AdminDashboardPage />);

    fireEvent.click(screen.getByText('Feature Flags'));

    await waitFor(() => {
      expect(screen.getByText('Platform Feature Flags & Progressive Rollouts')).toBeInTheDocument();
      expect(screen.getByText('QES Signatures')).toBeInTheDocument();
      expect(screen.getByText('qes_signatures')).toBeInTheDocument();
    });
  });

  it('navigates to Maintenance Mode tab and displays control panel', async () => {
    render(<AdminDashboardPage />);

    fireEvent.click(screen.getByText('Maintenance Mode'));

    await waitFor(() => {
      expect(screen.getByText('Platform Maintenance Mode Control')).toBeInTheDocument();
      expect(screen.getByText('NORMAL OPERATION')).toBeInTheDocument();
      expect(screen.getByText('Activate Maintenance')).toBeInTheDocument();
    });
  });
});
