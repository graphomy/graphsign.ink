import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ChooseTemplateModal } from './ChooseTemplateModal';

describe('ChooseTemplateModal Unit Tests (INK-264)', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const mockTemplates = [
    {
      id: 'tpl-1',
      title: 'Sales Agreement Template',
      description: 'Standard sales agreement blueprint',
      version: 1,
      isPublished: true,
      isArchived: false,
      tags: ['sales', 'commercial'],
      createdAt: '2026-08-25T00:00:00Z',
      updatedAt: '2026-08-25T00:00:00Z',
      author: { name: 'Admin', email: 'admin@acme.com' },
    },
  ];

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/instantiate')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                id: 'ag-new-1',
                title: '[Draft] Sales Agreement Template',
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

  it('keeps loading through a transient failure and displays records without a refresh', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<ChooseTemplateModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading templates');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText('Sales Agreement Template')).toBeInTheDocument();
    expect(screen.queryByText('No templates found.')).not.toBeInTheDocument();
  });

  it('offers a working retry after exhausted attempts instead of an empty list', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ChooseTemplateModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Please try again');
    expect(screen.queryByText('No templates found.')).not.toBeInTheDocument();
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: mockTemplates })));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    });
    expect(screen.getByText('Sales Agreement Template')).toBeInTheDocument();
  });

  it('renders modal header and loads organization templates by default', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(<ChooseTemplateModal onClose={onClose} onSuccess={onSuccess} />);

    expect(screen.getByText(/Create Agreement from Template/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Sales Agreement Template')).toBeInTheDocument();
    });

    expect(screen.getByText('v1.0')).toBeInTheDocument();
    expect(screen.getByText('#sales')).toBeInTheDocument();
  });

  it('switches between Organization Library and My Templates tabs', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(<ChooseTemplateModal onClose={onClose} onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByText('Sales Agreement Template')).toBeInTheDocument();
    });

    const myTemplatesTab = screen.getByRole('button', { name: 'My Templates' });
    fireEvent.click(myTemplatesTab);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('view=mine'),
      expect.anything(),
    );
  });

  it('instantiates agreement and calls onSuccess when clicking Use Template', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(<ChooseTemplateModal onClose={onClose} onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByText('Sales Agreement Template')).toBeInTheDocument();
    });

    const useTemplateBtn = screen.getByRole('button', { name: /Use Template/i });
    fireEvent.click(useTemplateBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(expect.stringContaining('Sales Agreement Template'));
      expect(onClose).toHaveBeenCalled();
    });
  });
});
