import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgreementEditModal } from './AgreementEditModal';

const props = {
  agreementId: 'ag-1',
  initialTitle: 'Test agreement',
  initialMarkdown: '# Original terms',
  currentVersion: '0.1',
  currentStatus: 'DRAFT',
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

describe('Agreement editor creation and full-page handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('graphsign_session_token', 'test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'ag-1', version: '0.2' }) }),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a Markdown draft with formatting controls, preview, description and tags', async () => {
    render(<AgreementEditModal {...props} mode="create" agreementId="" />);
    expect(screen.getByRole('button', { name: 'Split View' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move to Active/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Description / Reference (Optional)'), {
      target: { value: 'Vendor terms' },
    });
    fireEvent.change(screen.getByPlaceholderText('Add tag (e.g. legal, nda, sales)'), {
      target: { value: 'legal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Tag' }));
    fireEvent.change(screen.getByLabelText('Markdown Editor'), {
      target: { value: 'Payment terms' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'H1' }));
    expect(screen.getByRole('heading', { name: 'Payment terms' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create Draft' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/agreements/scratch'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: 'Test agreement',
          description: 'Vendor terms',
          markdownContent: '# Payment terms',
          tags: ['legal'],
        }),
      }),
    );
  });

  it('saves current edits before navigating the new tab', async () => {
    const tab = { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    render(<AgreementEditModal {...props} />);
    fireEvent.change(screen.getByLabelText('Markdown Editor'), {
      target: { value: '# Unsaved changes' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save & open in new tab/ }));
    await waitFor(() =>
      expect(tab.location.replace).toHaveBeenCalledWith(
        expect.stringMatching(/^\/agreements\/edit\?id=ag-1&returnTo=/),
      ),
    );
    expect(tab.opener).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/ag-1/draft'),
      expect.objectContaining({ body: expect.stringContaining('# Unsaved changes') }),
    );
  });

  it('retains edits and closes the blank tab if saving fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Save failed' }),
    } as Response);
    const tab = { opener: null, location: { replace: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    render(<AgreementEditModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Save & open in new tab/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.replace).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Markdown Editor')).toHaveValue('# Original terms');
  });

  it('does not save when the browser blocks the new tab', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    render(<AgreementEditModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Save & open in new tab/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('blocked the new tab');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the full-page editor open and updates the version after saving', async () => {
    render(<AgreementEditModal {...props} fullPage />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open in new tab/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Save Draft/ }));
    expect(await screen.findByText('DRAFT v0.2')).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('rejects empty terms and supports Escape to close', () => {
    render(<AgreementEditModal {...props} mode="create" agreementId="" initialMarkdown="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Draft' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Agreement terms are required');
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });
});
