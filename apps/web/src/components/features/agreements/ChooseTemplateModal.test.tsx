import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ChooseTemplateModal } from './ChooseTemplateModal';

describe('ChooseTemplateModal Unit Tests (INK-264)', () => {
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
