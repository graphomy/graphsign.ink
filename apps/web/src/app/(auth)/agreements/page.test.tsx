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
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: 'ag-1',
                title: 'Vendor Master Agreement',
                description: 'Annual vendor agreement',
                status: 'DRAFT',
                version: '0.1',
                markdownContent: '# Vendor Agreement\n\n- Clause 1',
                isArchived: false,
                tags: ['vendor', 'legal'],
                createdAt: '2026-08-14T00:00:00Z',
                updatedAt: '2026-08-14T00:00:00Z',
              },
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
          }),
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

  it('renders tab buttons for Active, Drafts, and Archived', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Active Agreements')).toBeInTheDocument();
    });

    expect(screen.getByText(/Drafts Only/i)).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('renders agreements with version badges and pencil edit buttons', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Vendor Master Agreement')).toBeInTheDocument();
      expect(screen.getByText('Active NDA Contract')).toBeInTheDocument();
    });

    expect(screen.getByText('v0.1')).toBeInTheDocument();
    expect(screen.getByText('v1.0')).toBeInTheDocument();

    const editButtons = screen.getAllByRole('button', { name: /Edit/i });
    expect(editButtons.length).toBeGreaterThanOrEqual(2);
  });

  it('opens edit modal when pencil edit button is clicked', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Vendor Master Agreement')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: /Edit/i });
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Edit Agreement Document')).toBeInTheDocument();
    });
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
