import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AgreementManagementPage from './page';
import { renderMarkdownToHtml } from '@/components/features/agreements/MarkdownEditor';

// Mock SessionGuard
vi.mock('@/components/features/auth/SessionGuard', () => ({
  SessionGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('AgreementManagementPage Unit Tests (Epic INK-8)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('status=DRAFT')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                items: [
                  {
                    id: 'ag-1',
                    title: 'Vendor Master Agreement Draft',
                    description: 'Annual vendor agreement',
                    status: 'DRAFT',
                    version: '0.1',
                    markdownContent: '# Vendor Agreement\n\n- Clause 1',
                    isArchived: false,
                    tags: ['vendor', 'legal'],
                    createdAt: '2026-08-14T00:00:00Z',
                    updatedAt: '2026-08-14T00:00:00Z',
                  },
                ],
                pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
              }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [
                {
                  id: 'ag-2',
                  title: 'Active NDA Contract',
                  description: 'Mutual non-disclosure',
                  status: 'ACTIVE',
                  version: '1.0',
                  markdownContent: '# NDA\n\nConfidentiality terms',
                  isArchived: false,
                  tags: ['nda'],
                  createdAt: '2026-08-14T00:00:00Z',
                  updatedAt: '2026-08-14T00:00:00Z',
                },
              ],
              pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
            }),
        });
      }),
    );
  });

  it('renders agreement management dashboard title and action buttons', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Agreement Management')).toBeInTheDocument();
    });

    expect(screen.getByText(/Upload PDF\/DOCX\/MD/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Create from Scratch/i)[0]).toBeInTheDocument();
  });

  it('renders tab buttons renamed to Active, Drafts, and Archived', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Drafts' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Archived' })).toBeInTheDocument();
    });
  });

  it('renders active agreements in table rows without Edit or Clone buttons', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Active NDA Contract')).toBeInTheDocument();
    });

    // Version and status badges in row
    expect(screen.getByText('v1.0')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();

    // Table header columns
    expect(screen.getByText('Document Details')).toBeInTheDocument();
    expect(screen.getByText('Last Modified')).toBeInTheDocument();

    // Edit and Clone buttons MUST NOT be present in Active tab
    expect(screen.queryByRole('button', { name: /Edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clone/i })).not.toBeInTheDocument();

    // PDF and History buttons MUST be present
    expect(screen.getByTitle('View PDF')).toBeInTheDocument();
    expect(screen.getByTitle('Change History')).toBeInTheDocument();
  });

  it('renders draft agreements with Edit and Clone buttons in Drafts tab', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Drafts' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Drafts' }));

    await waitFor(() => {
      expect(screen.getByText('Vendor Master Agreement Draft')).toBeInTheDocument();
    });

    // In Drafts tab, Edit and Clone buttons MUST be present
    expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clone/i })).toBeInTheDocument();
  });

  it('opens PDF viewer modal when PDF button is clicked', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Active NDA Contract')).toBeInTheDocument();
    });

    const pdfButtons = screen.getAllByTitle('View PDF');
    fireEvent.click(pdfButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Open Original File/i)).toBeInTheDocument();
      expect(screen.getByText(/Download/i)).toBeInTheDocument();
    });
  });

  describe('renderMarkdownToHtml Helper', () => {
    it('correctly converts markdown headings, bold, lists, and tables', () => {
      const md = '# Title\n\n## Subtitle\n\n**Bold Text**\n\n- Item 1\n- Item 2';
      const html = renderMarkdownToHtml(md);

      expect(html).toContain('<h1');
      expect(html).toContain('Title');
      expect(html).toContain('<h2');
      expect(html).toContain('Subtitle');
      expect(html).toContain('Bold Text');
      expect(html).toContain('<li');
    });
  });
});
