import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './page';

// Mock SessionGuard
vi.mock('@/components/features/auth/SessionGuard', () => ({
  SessionGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock HeaderNav
vi.mock('@/components/layout/HeaderNav', () => ({
  HeaderNav: () => <nav data-testid="header-nav">HeaderNav</nav>,
}));

// Mock Footer
vi.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}));

describe('DashboardPage Unit Tests (INK-257)', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('graphsign_session_token', 'valid_test_token_123');
    localStorage.setItem('graphsign_user_email', 'tester@graphsign.ink');
    localStorage.setItem('graphsign_org_id', 'org-123');

    // Reset window.location
    delete (window as unknown as Record<string, unknown>).location;
    (window as unknown as Record<string, unknown>).location = { href: '/dashboard' };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: 'ag-1',
                title: 'Employment Agreement',
                description: 'Full-time employment',
                status: 'DRAFT',
                createdAt: '2026-08-18T00:00:00Z',
                updatedAt: '2026-08-18T00:00:00Z',
                author: { email: 'author@graphsign.ink' },
              },
              {
                id: 'ag-2',
                title: 'Vendor Service Contract',
                description: 'Service agreement',
                status: 'COMPLETED',
                createdAt: '2026-08-18T00:00:00Z',
                updatedAt: '2026-08-18T00:00:00Z',
                author: { email: 'author@graphsign.ink' },
              },
              {
                id: 'ag-3',
                title: 'Consulting NDA',
                description: 'NDA in review',
                status: 'IN_REVIEW',
                createdAt: '2026-08-18T00:00:00Z',
                updatedAt: '2026-08-18T00:00:00Z',
                author: { email: 'other@graphsign.ink' },
              },
            ],
          }),
      }),
    );
  });

  it('renders Pending Signature (5) and Pending Review (1) with counts when pending documents exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: 'ag-review',
                title: 'Consulting NDA',
                status: 'IN_REVIEW',
                createdAt: '2026-08-18T00:00:00Z',
                updatedAt: '2026-08-18T00:00:00Z',
                author: { email: 'other@graphsign.ink' },
              },
              ...Array.from({ length: 5 }, (_, i) => ({
                id: `ag-sig-${i}`,
                title: `Agreement Pending Signature ${i + 1}`,
                status: 'SENT',
                createdAt: '2026-08-18T00:00:00Z',
                updatedAt: '2026-08-18T00:00:00Z',
                author: { email: 'author@graphsign.ink' },
              })),
            ],
          }),
      }),
    );

    render(<DashboardPage />);
    expect(await screen.findByRole('link', { name: 'Pending Signature (5)' })).toHaveAttribute(
      'href',
      '/agreements?tab=waiting_for_me',
    );
    expect(screen.getByRole('link', { name: 'Pending Review (1)' })).toHaveAttribute(
      'href',
      '/agreements?tab=review_required',
    );
    expect(screen.queryByRole('link', { name: /Upload Template/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Upload Agreement/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Create from Scratch/ })).not.toBeInTheDocument();
  });

  it('hides Pending Review and Pending Signature buttons when no documents are pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: 'ag-1',
                title: 'Draft Agreement',
                status: 'DRAFT',
                createdAt: '2026-08-18T00:00:00Z',
                updatedAt: '2026-08-18T00:00:00Z',
                author: { email: 'author@graphsign.ink' },
              },
              {
                id: 'ag-2',
                title: 'Completed Agreement',
                status: 'COMPLETED',
                createdAt: '2026-08-18T00:00:00Z',
                updatedAt: '2026-08-18T00:00:00Z',
                author: { email: 'author@graphsign.ink' },
              },
            ],
          }),
      }),
    );

    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Draft Agreement')).toBeInTheDocument();
    });

    expect(screen.queryByRole('link', { name: /Pending Review/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Pending Signature/ })).not.toBeInTheDocument();
  });

  it('renders dashboard greeting, workspace agreements, and Requiring My Review widget', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Welcome back,/i)).toBeInTheDocument();
      expect(screen.getByText('tester')).toBeInTheDocument();
      expect(screen.getByText('Employment Agreement')).toBeInTheDocument();
      expect(screen.getByText('Vendor Service Contract')).toBeInTheDocument();
      expect(screen.getByText('Consulting NDA')).toBeInTheDocument();
    });

    // Check live metrics including Requiring My Review
    expect(screen.getByText('Pending Actions')).toBeInTheDocument();
    expect(screen.getByText('Requiring My Review')).toBeInTheDocument();
    expect(screen.getByText('Completed Agreements')).toBeInTheDocument();
    expect(screen.getByText('Total Workspace Contracts')).toBeInTheDocument();
  });

  it('redirects to login when 401 Unauthorized is returned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: { message: 'Invalid or tampered session token.' },
          }),
      }),
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(window.location.href).toBe('/login?reason=session_expired');
      expect(localStorage.getItem('graphsign_session_token')).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  it('surfaces backend error message when API fails with non-401 error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            error: {
              message:
                'Organisation access is currently suspended. Please contact platform administration.',
            },
          }),
      }),
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Organisation access is currently suspended. Please contact platform administration.',
        ),
      ).toBeInTheDocument();
    });
  });

  it('renders empty state when no agreements exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ items: [] }),
      }),
    );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/No agreements found in workspace yet/i)).toBeInTheDocument();
    });
  });
});
