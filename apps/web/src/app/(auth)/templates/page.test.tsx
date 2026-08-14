import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TemplateManagementPage from './page';

// Mock SessionGuard
vi.mock('@/components/features/auth/SessionGuard', () => ({
  SessionGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('TemplateManagementPage Unit Tests (Epic INK-11)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      }),
    );
  });

  it('renders template management dashboard title and create action button', async () => {
    render(<TemplateManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Template Management')).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Create Template/i)[0]).toBeInTheDocument();
  });

  it('renders library tabs for Organization Library, My Templates, and Shared with Me', async () => {
    render(<TemplateManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Organization Library')).toBeInTheDocument();
    });

    expect(screen.getByText('My Templates')).toBeInTheDocument();
    expect(screen.getByText('Shared with Me')).toBeInTheDocument();
  });
});
