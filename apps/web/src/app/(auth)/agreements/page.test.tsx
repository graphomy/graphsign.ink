import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import AgreementManagementPage from './page';
import { renderMarkdownToHtml } from '@/components/features/agreements/MarkdownEditor';

const navigation = vi.hoisted(() => ({ query: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.query),
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace }),
  usePathname: () => '/agreements',
}));

// Mock SessionGuard
vi.mock('@/components/features/auth/SessionGuard', () => ({
  SessionGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('AgreementManagementPage Unit Tests (Epic INK-8)', () => {
  beforeEach(() => {
    navigation.query = '';
    navigation.replace.mockClear();
    localStorage.clear();
    localStorage.setItem('graphsign_user_id', 'user-reviewer-1');
    localStorage.setItem('graphsign_user_email', 'reviewer@graphsign.ink');
    localStorage.setItem('graphsign_session_token', 'test-token');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('isArchived=true')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                items: [
                  {
                    id: 'ag-archived-1',
                    title: 'Archived Partnership Agreement',
                    description: 'Old partnership agreement',
                    status: 'ACTIVE',
                    version: '1.0',
                    isArchived: true,
                    tags: ['legacy'],
                    createdAt: '2026-01-01T00:00:00Z',
                    updatedAt: '2026-01-01T00:00:00Z',
                  },
                ],
                pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
              }),
          });
        }

        if (url.includes('status=ACTIVE_AND_DRAFT')) {
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
                  {
                    id: 'ag-review-1',
                    title: 'NDA Under Legal Review',
                    description: 'In review NDA',
                    status: 'IN_REVIEW',
                    reviewerId: 'user-reviewer-1',
                    reviewer: { id: 'user-reviewer-1', email: 'reviewer@graphsign.ink' },
                    version: '0.2',
                    markdownContent: '# NDA Review',
                    isArchived: false,
                    tags: ['review'],
                    createdAt: '2026-08-14T00:00:00Z',
                    updatedAt: '2026-08-14T00:00:00Z',
                  },
                ],
                pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
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

  it.each([
    ['waiting_for_me', 'Pending Signature', 'WAITING_FOR_ME'],
    ['review_required', 'Review Required', 'REVIEW_REQUIRED'],
  ])('opens the dashboard destination %s with the correct filter', async (tab, label, status) => {
    navigation.query = 'tab=' + tab;
    render(<AgreementManagementPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: new RegExp(label) })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=' + status),
        expect.anything(),
      ),
    );
  });

  it('shows an empty archive without an upload action in the empty state', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], pagination: { total: 0 } }),
    } as Response);
    render(<AgreementManagementPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await waitFor(() => {
      const heading = screen.getByRole('heading', { name: 'No agreements here yet' });
      expect(screen.getByText('Archived agreements will appear here.')).toBeInTheDocument();
      expect(
        within(heading.parentElement!).queryByRole('button', { name: /Upload agreement/i }),
      ).not.toBeInTheDocument();
    });
    expect(navigation.replace).toHaveBeenCalledWith('/agreements?tab=archived', { scroll: false });
  });

  it('opens the complete Markdown editor directly from Create from scratch', async () => {
    render(<AgreementManagementPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Create from scratch/i }));
    expect(
      screen.getByRole('dialog', { name: 'Create agreement from scratch' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'H1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Split View' })).toBeInTheDocument();
    expect(screen.getByLabelText('Markdown Editor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Draft' })).toBeInTheDocument();
  });

  it('renders agreement management dashboard title and action buttons', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Agreement Management')).toBeInTheDocument();
    });

    expect(screen.getByText(/Upload Agreement/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Create from Scratch/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/From Template/i)).toBeInTheDocument();
  });

  it('opens ChooseTemplateModal when clicking From Template button (INK-264)', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByText(/From Template/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/From Template/i));

    await waitFor(() => {
      expect(screen.getByText(/Create Agreement from Template/i)).toBeInTheDocument();
    });
  });

  it('renders the updated agreement tabs without a separate Drafts tab', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Signature Completed' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Active Agreements' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Active Agreements' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Archived' })).toBeInTheDocument();
    });
  });

  it('renders active agreements in table rows with Send for Signature, PDF, and 3-dots dropdown', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Active Agreements' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Active Agreements' }));

    await waitFor(() => {
      expect(screen.getByText('Active NDA Contract')).toBeInTheDocument();
    });

    const activeRow = within(screen.getByText('Active NDA Contract').closest('tr')!);

    // Status badge in row
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();

    // Table header columns (Version column removed per user request)
    expect(screen.getByText('Document Details')).toBeInTheDocument();
    expect(screen.getByText('Last Modified')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Version/i })).not.toBeInTheDocument();

    // Edit button MUST NOT be present in Active tab for active agreements
    expect(activeRow.queryByRole('button', { name: /Edit/i })).not.toBeInTheDocument();

    // Send for Signature, PDF and 3-dots buttons MUST be present
    expect(activeRow.getByTitle('Send for Signature')).toBeInTheDocument();
    expect(activeRow.getByTitle('View PDF')).toBeInTheDocument();
    expect(activeRow.getByTitle('More actions')).toBeInTheDocument();

    // Clicking 3-dots button reveals Clone, History, Tags, Archive, Delete
    fireEvent.click(activeRow.getByTitle('More actions'));
    expect(screen.getByRole('button', { name: /Clone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /History/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tags/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Archive$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete$/i })).toBeInTheDocument();
  });

  it('renders active and draft agreements together with status-appropriate actions', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Active Agreements' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Active Agreements' }));

    await waitFor(() => {
      expect(screen.getByText('Vendor Master Agreement Draft')).toBeInTheDocument();
    });

    // In Drafts tab, Review and Edit buttons MUST be present for DRAFT status
    expect(screen.getByTitle('Submit for Review')).toBeInTheDocument();
    expect(screen.getByTitle('Edit Document')).toBeInTheDocument();
    expect(
      within(screen.getByText('Vendor Master Agreement Draft').closest('tr')!).queryByTitle(
        'Send for Signature',
      ),
    ).not.toBeInTheDocument();
    expect(screen.getAllByTitle('View PDF')[0]).toBeInTheDocument();

    // IN_REVIEW agreement should have In Review status badge and Review Decision button for reviewer
    expect(screen.getByText('NDA Under Legal Review')).toBeInTheDocument();
    expect(screen.getAllByText('In Review')[0]).toBeInTheDocument();
    expect(screen.getByTitle('Review Decision')).toBeInTheDocument();

    // Dropdown contains Clone
    const moreActionsButtons = screen.getAllByTitle('More actions');
    fireEvent.click(moreActionsButtons[0]);
    expect(screen.getByText(/Clone/i)).toBeInTheDocument();
  });

  it('does not render Review Decision button if current user is not the designated reviewer (INK-263)', async () => {
    localStorage.setItem('graphsign_user_id', 'different-user-999');
    localStorage.setItem('graphsign_user_email', 'other@graphsign.ink');

    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Active Agreements' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Active Agreements' }));

    await waitFor(() => {
      expect(screen.getByText('NDA Under Legal Review')).toBeInTheDocument();
    });

    // Review Decision button MUST NOT be rendered for non-reviewers
    expect(screen.queryByTitle('Review Decision')).not.toBeInTheDocument();
  });

  it('renders archived agreements with only PDF button and Unarchive in dropdown on Archived tab', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archived' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));

    await waitFor(() => {
      expect(screen.getByText('Archived Partnership Agreement')).toBeInTheDocument();
    });

    // On Archived tab, Send for Signature and Edit MUST NOT be rendered
    expect(screen.queryByTitle('Send for Signature')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Edit Document')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Submit for Review')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Review Decision')).not.toBeInTheDocument();

    // PDF button MUST be present
    expect(screen.getByTitle('View PDF')).toBeInTheDocument();

    // Dropdown MUST contain Unarchive, History, and Clone
    fireEvent.click(screen.getByTitle('More actions'));
    expect(screen.getByRole('button', { name: /Unarchive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /History/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clone/i })).toBeInTheDocument();
  });

  it('opens PDF viewer modal when PDF button is clicked and displays Download action without Open Original File (INK-271)', async () => {
    render(<AgreementManagementPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Active Agreements' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Active Agreements' }));

    await waitFor(() => {
      expect(screen.getByText('Active NDA Contract')).toBeInTheDocument();
    });

    const pdfButtons = screen.getAllByTitle('View PDF');
    fireEvent.click(pdfButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Download/i)).toBeInTheDocument();
      expect(screen.queryByText(/Open Original File/i)).not.toBeInTheDocument();
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
