import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TemplateManagementPage from './page';

// Mock SessionGuard
vi.mock('@/components/features/auth/SessionGuard', () => ({
  SessionGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('TemplateManagementPage Unit Tests (Epic INK-11, INK-264, INK-270)', () => {
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

  it('renders library tabs for Library, My Templates, and Shared with Me (INK-270)', async () => {
    render(<TemplateManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Library')).toBeInTheDocument();
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

  it('renders template table row with Active status and provides Use Template and Edit actions (INK-270)', async () => {
    render(<TemplateManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Master Service Template')).toBeInTheDocument();
    });

    expect(screen.getByText('v1.0')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();

    const useTemplateBtn = screen.getByRole('button', { name: 'Use Template' });
    expect(useTemplateBtn).toBeInTheDocument();

    fireEvent.click(useTemplateBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/templates/tpl-1/instantiate'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('opens edit modal when clicking Edit action', async () => {
    render(<TemplateManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Master Service Template')).toBeInTheDocument();
    });

    const editBtn = screen.getByRole('button', { name: 'Edit' });
    fireEvent.click(editBtn);

    expect(screen.getByText('Edit Agreement Template')).toBeInTheDocument();
  });

  it('publishes and unpublishes template with correct JSON payload (INK-264 & INK-270)', async () => {
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

  it('publishes a draft template with correct JSON payload', async () => {
    const draftTemplates = [
      {
        ...mockTemplates[0],
        id: 'tpl-draft',
        isPublished: false,
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/publish')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'tpl-draft', isPublished: true }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: draftTemplates }),
        });
      }),
    );

    render(<TemplateManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Master Service Template')).toBeInTheDocument();
    });

    const publishBtn = screen.getByRole('button', { name: 'Publish' });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/templates/tpl-draft/publish'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ isPublished: true }),
        }),
      );
    });
  });

  it('displays accessible loading state and prevents repeat activation during instantiation', async () => {
    let resolveInstantiate: (val: unknown) => void;
    const pendingInstantiate = new Promise((resolve) => {
      resolveInstantiate = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/instantiate')) {
          return pendingInstantiate.then(() => ({
            ok: true,
            json: () =>
              Promise.resolve({
                id: 'ag-new-1',
                title: '[Draft] Master Service Template',
                status: 'DRAFT',
              }),
          }));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: mockTemplates }),
        });
      }),
    );

    render(<TemplateManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Master Service Template')).toBeInTheDocument();
    });

    const useTemplateBtn = screen.getByRole('button', { name: 'Use Template' });
    fireEvent.click(useTemplateBtn);

    // During instantiation, button should display accessible loading state
    await waitFor(() => {
      const loadingBtn = screen.getByRole('button', { name: 'Creating…' });
      expect(loadingBtn).toBeInTheDocument();
      expect(loadingBtn).toBeDisabled();
      expect(loadingBtn).toHaveAttribute('aria-busy', 'true');
    });

    // Repeat click should be ignored
    const loadingBtn = screen.getByRole('button', { name: 'Creating…' });
    fireEvent.click(loadingBtn);

    const instantiateCalls = vi
      .mocked(globalThis.fetch)
      .mock.calls.filter((call) => typeof call[0] === 'string' && call[0].includes('/instantiate'));
    expect(instantiateCalls).toHaveLength(1);

    resolveInstantiate!({});
  });

  it('opens 3-dots dropdown menu with Version History, Share, and Delete options (INK-270)', async () => {
    render(<TemplateManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Master Service Template')).toBeInTheDocument();
    });

    const moreActionsBtn = screen.getByRole('button', { name: 'More actions' });
    fireEvent.click(moreActionsBtn);

    expect(screen.getByText('Version History')).toBeInTheDocument();
    expect(screen.getByText('Share Template')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('renders omnibar search and filters in template filter bar (INK-271)', async () => {
    render(<TemplateManagementPage />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/Search templates by title, description, content, or tags.../i),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Filters/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Presets/i })).toBeInTheDocument();
  });
});
