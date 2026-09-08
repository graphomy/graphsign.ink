import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AgreementEditorPage from './page';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('id=ag-1'),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/components/features/auth/SessionGuard', () => ({
  SessionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('Full-page agreement route', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('loads the agreement by URL and saves without leaving the page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url, options) =>
        Promise.resolve({
          ok: true,
          json: async () =>
            options?.method === 'PATCH'
              ? { version: '0.2' }
              : {
                  id: 'ag-1',
                  title: 'Full-page contract',
                  markdownContent: '# Terms',
                  version: '0.1',
                  status: 'DRAFT',
                },
        }),
      ),
    );
    render(<AgreementEditorPage />);
    expect(await screen.findByLabelText('Agreement Title *')).toHaveValue('Full-page contract');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Markdown Editor'), {
      target: { value: '# Updated terms' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Draft/ }));
    expect(await screen.findByText('DRAFT v0.2')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('saved successfully');
    expect(screen.getByLabelText('Markdown Editor')).toHaveValue('# Updated terms');
  });

  it('shows an error and return link when the agreement cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    render(<AgreementEditorPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load');
    expect(screen.getByRole('link', { name: 'Back to agreements' })).toHaveAttribute(
      'href',
      '/agreements',
    );
    expect(screen.queryByRole('button', { name: /Save Draft/ })).not.toBeInTheDocument();
  });
});
