import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdvancedFilterBar, FilterState } from './AdvancedFilterBar';

describe('AdvancedFilterBar Component Tests (INK-117 to INK-122)', () => {
  const initialFilters: FilterState = {
    keyword: '',
    status: 'ALL',
    datePreset: 'all',
    documentType: 'all',
    tag: '',
    authorEmail: '',
    recipientEmail: '',
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.setItem('graphsign_session_token', 'mock-token');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: [
            {
              id: 'preset-1',
              name: 'Active PDFs',
              filters: { status: 'ACTIVE', documentType: 'pdf' },
              isDefault: true,
            },
          ],
        }),
    });
  });

  it('renders search input and triggers onFilterChange when typing (INK-117)', () => {
    const handleFilterChange = vi.fn();
    const handleClear = vi.fn();

    render(
      <AdvancedFilterBar
        filters={initialFilters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClear}
      />,
    );

    const searchInput = screen.getByPlaceholderText(
      'Search documents by title, description, content, or file name...',
    );
    fireEvent.change(searchInput, { target: { value: 'Contract' } });

    expect(handleFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: 'Contract' }),
    );
  });

  it('updates status filter when selecting from dropdown (INK-118)', () => {
    const handleFilterChange = vi.fn();
    const handleClear = vi.fn();

    render(
      <AdvancedFilterBar
        filters={initialFilters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClear}
      />,
    );

    const select = screen.getByDisplayValue('All Statuses');
    fireEvent.change(select, { target: { value: 'SENT' } });

    expect(handleFilterChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'SENT' }));
  });

  it('toggles advanced filter panel and applies date & type filters (INK-118, INK-119)', () => {
    const handleFilterChange = vi.fn();
    const handleClear = vi.fn();

    render(
      <AdvancedFilterBar
        filters={initialFilters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClear}
      />,
    );

    const filterBtn = screen.getByRole('button', { name: /Filters/i });
    fireEvent.click(filterBtn);

    expect(screen.getByText('Date Range')).toBeDefined();
    expect(screen.getByText('Format / Type')).toBeDefined();

    const tagInput = screen.getByPlaceholderText('e.g. hr, legal, finance');
    fireEvent.change(tagInput, { target: { value: 'legal' } });

    expect(handleFilterChange).toHaveBeenCalledWith(expect.objectContaining({ tag: 'legal' }));
  });

  it('displays and applies saved presets (INK-120)', async () => {
    const handleFilterChange = vi.fn();
    const handleClear = vi.fn();

    render(
      <AdvancedFilterBar
        filters={initialFilters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClear}
      />,
    );

    const presetsBtn = screen.getByRole('button', { name: /Presets/i });
    fireEvent.click(presetsBtn);

    await waitFor(() => {
      expect(screen.getByText('Active PDFs')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Active PDFs'));
    expect(handleFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE', documentType: 'pdf' }),
    );
  });

  it('renders suggestion banner and applies suggestion on click (INK-122)', () => {
    const handleFilterChange = vi.fn();
    const handleClear = vi.fn();
    const handleApplySuggestion = vi.fn();

    render(
      <AdvancedFilterBar
        filters={{ ...initialFilters, keyword: 'Contrct' }}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClear}
        suggestion="contract"
        onApplySuggestion={handleApplySuggestion}
      />,
    );

    expect(screen.getByText(/No exact matches found. Did you mean/i)).toBeDefined();
    const suggestionBtn = screen.getByRole('button', { name: '"contract"' });
    fireEvent.click(suggestionBtn);

    expect(handleApplySuggestion).toHaveBeenCalledWith('contract');
  });
});
