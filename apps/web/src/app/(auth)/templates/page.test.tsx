import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TemplateManagementPage from './page';

// Mock SessionGuard
vi.mock('@/components/features/auth/SessionGuard', () => ({
  SessionGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('TemplateManagementPage Unit Tests (Epic INK-11 & INK-264)', () => {
  const mockTemplates = [
    {
      id: 'tpl-1',
      title: 'Master Service Template',
      description: 'Standard master services agreement blueprint',
      htmlContent: '# Master Agreement\n\n- Scope of work',
      version: 1,
      isPublished: true,
      isArchived: false,
      tags: ['msa', 'legal'],
      createdAt: '2026-08-25T00:00:00Z',
      updatedAt: '2026-08-25T00:00:00Z',
      author: { name: 'Admin', email: 'admin@acme.com' },
    },
  ];

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/publish')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'tpl-1', isPublished: false }),
          });
        }
        if (url.includes('/instantiate')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                id: 'ag-new-1',
                title: '[Draft] Master Service Template',
                status: 'DRAFT',
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: mockTemplates }),
        });
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

  it('queries API with view=library by default and switches to view=mine when clicking My Templates (INK-264)', async () => {
    render(<TemplateManagementPage />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('view=library'),
        expect.anything(),
      );
    });

    const myTemplatesBtn = screen.getByRole('button', { name: 'My Templates' });
    fireEvent.click(myTemplatesBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('view=mine'),
        expect.anything(),
      );
    });
  });

  it('renders template card with Markdown blueprint and provides Use Template action (INK-264)', async () => {
    render(<TemplateManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Master Service Template')).toBeInTheDocument();
    });

    expect(screen.getByText('v1.0')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();

    const useTemplateBtn = screen.getByRole('button', { name: /Use Template/i });
    expect(useTemplateBtn).toBeInTheDocument();

    fireEvent.click(useTemplateBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/templates/tpl-1/instantiate'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('publishes and unpublishes template with correct JSON payload (INK-264)', async () => {
    render(<TemplateManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Master Service Template')).toBeInTheDocument();
    });

    const unpublishBtn = screen.getByRole('button', { name: 'Unpublish' });
    fireEvent.click(unpublishBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/templates/tpl-1/publish'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ isPublished: false }),
        }),
      );
    });
  });
});
