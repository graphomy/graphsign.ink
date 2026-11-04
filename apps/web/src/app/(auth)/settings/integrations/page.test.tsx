import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import IntegrationsPage from './page';

vi.mock('@/components/features/auth/SessionGuard', () => ({
  SessionGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/layout/HeaderNav', () => ({
  HeaderNav: () => <nav data-testid="header-nav">HeaderNav</nav>,
}));

vi.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}));

vi.mock('@/components/features/integrations/WebhookSubscriptionList', () => ({
  WebhookSubscriptionList: () => <div data-testid="webhooks-list">Webhooks Subscription List</div>,
}));

describe('IntegrationsPage Developer API & Bindings Tests (INK-146, INK-148, INK-152)', () => {
  const store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, val: string) => {
      store[key] = val;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const k of Object.keys(store)) delete store[k];
    }),
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', mockLocalStorage);
    mockLocalStorage.clear();
    mockLocalStorage.setItem('graphsign_session_token', 'valid_test_token');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/organisations/me/api-clients')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: [
                  {
                    id: 'client-test-1',
                    name: 'ERP Invoicing Daemon',
                    clientId: 'service-erp-123',
                    status: 'active',
                    scopes: ['documents:read', 'documents:create'],
                    createdAt: '2026-10-28T10:00:00Z',
                  },
                ],
              }),
          });
        }

        if (url.includes('/api/v1/organisations/me/api-logs')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: [
                  {
                    id: 'log-1',
                    requestId: 'req-abc-123',
                    method: 'POST',
                    routeTemplate: '/api/v1/documents',
                    statusCode: 201,
                    durationMs: 42,
                    createdAt: '2026-10-28T10:05:00Z',
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

  it('renders page header and default Webhooks tab', () => {
    render(<IntegrationsPage />);
    expect(screen.getByText('Integrations & Developer APIs')).toBeInTheDocument();
    expect(screen.getByTestId('webhooks-list')).toBeInTheDocument();
  });

  it('switches to API Client Bindings tab and renders clients', async () => {
    render(<IntegrationsPage />);

    const clientsTabBtn = screen.getByRole('button', { name: /api client bindings/i });
    fireEvent.click(clientsTabBtn);

    await waitFor(() => {
      expect(screen.getByText('ERP Invoicing Daemon')).toBeInTheDocument();
      expect(screen.getByText(/Client ID: service-erp-123/i)).toBeInTheDocument();
      expect(screen.getByText('documents:read')).toBeInTheDocument();
    });

    // Verify Register Client button exists and opens modal
    const registerBtn = screen.getByRole('button', { name: /register client/i });
    expect(registerBtn).toBeInTheDocument();
    fireEvent.click(registerBtn);

    expect(screen.getByText('Register Machine API Client')).toBeInTheDocument();
  });

  it('switches to API Request Logs tab and renders logged requests', async () => {
    render(<IntegrationsPage />);

    const logsTabBtn = screen.getByRole('button', { name: /api request logs/i });
    fireEvent.click(logsTabBtn);

    await waitFor(() => {
      expect(screen.getByText('Redacted API Request Logs')).toBeInTheDocument();
      expect(screen.getByText('/api/v1/documents')).toBeInTheDocument();
      expect(screen.getByText('201')).toBeInTheDocument();
      expect(screen.getByText('req-abc-123')).toBeInTheDocument();
    });
  });

  it('switches to Interactive Docs tab and displays Scalar documentation links', () => {
    render(<IntegrationsPage />);

    const docsTabBtn = screen.getByRole('button', { name: /interactive docs/i });
    fireEvent.click(docsTabBtn);

    expect(screen.getByText(/Interactive OpenAPI 3.1 & Scalar Documentation/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open scalar api docs/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/api/v1/docs'),
    );
    expect(screen.getByRole('link', { name: /download openapi.json/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/api/v1/docs/openapi.json'),
    );
  });
});
