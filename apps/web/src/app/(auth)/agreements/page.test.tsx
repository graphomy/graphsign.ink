import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AgreementManagementPage from './page';

// Mock SessionGuard
vi.mock('@/components/features/auth/SessionGuard', () => ({
  SessionGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('AgreementManagementPage Unit Tests (Epic INK-8)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      }),
    );
  });

  it('renders agreement management dashboard title and action buttons', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Agreement Management')).toBeInTheDocument();
    });

    expect(screen.getByText(/Upload PDF\/DOCX/i)).toBeInTheDocument();
    expect(screen.getByText(/Create from Scratch/i)).toBeInTheDocument();
  });

  it('renders tab buttons for Active, Drafts, and Archived', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Active Agreements')).toBeInTheDocument();
    });

    expect(screen.getByText('Drafts')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });
});
