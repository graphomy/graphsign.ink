import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SubmitReviewModal } from './SubmitReviewModal';
import { ReviewDecisionModal } from './ReviewDecisionModal';
import { SendAgreementModal } from './SendAgreementModal';
import { CancelAgreementModal } from './CancelAgreementModal';
import { PdfViewerModal } from './PdfViewerModal';

describe('Workflow Modals Unit Tests (INK-87 to INK-95, INK-268)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders SubmitReviewModal and submits reviewer email (INK-87)', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    render(
      <SubmitReviewModal
        agreementId="ag-1"
        agreementTitle="Employment Agreement"
        onClose={handleClose}
        onSuccess={handleSuccess}
      />,
    );

    expect(screen.getByText('Submit for Internal Review')).toBeDefined();
    const emailInput = screen.getByPlaceholderText('colleague@example.com');
    fireEvent.change(emailInput, { target: { value: 'reviewer@company.com' } });

    const submitBtn = screen.getByRole('button', { name: 'Submit for Review' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledWith(
        'Agreement submitted for review to reviewer@company.com',
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('renders ReviewDecisionModal and approves agreement (INK-88)', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    render(
      <ReviewDecisionModal
        agreementId="ag-1"
        agreementTitle="Employment Agreement"
        onClose={handleClose}
        onSuccess={handleSuccess}
      />,
    );

    expect(screen.getByText('Review & Decision')).toBeDefined();
    const confirmBtn = screen.getByRole('button', { name: 'Confirm Approval' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledWith(
        'Agreement "Employment Agreement" approved successfully.',
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('renders SendAgreementModal with sequential and parallel options (INK-90, INK-91, INK-92)', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    render(
      <SendAgreementModal
        agreementId="ag-1"
        agreementTitle="Employment Agreement"
        onClose={handleClose}
        onSuccess={handleSuccess}
      />,
    );

    expect(screen.getByText('Send Agreement for Signature')).toBeDefined();
    expect(screen.getByText(/Parallel Order/)).toBeDefined();
    expect(screen.getByText(/Sequential Order/)).toBeDefined();

    // Fill in signer email
    const emailInput = screen.getByPlaceholderText('signer@example.com');
    fireEvent.change(emailInput, { target: { value: 'signer1@example.com' } });

    const sendBtn = screen.getByRole('button', { name: 'Send for Signature 🚀' });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledWith(
        'Agreement "Employment Agreement" sent to 1 recipient(s) (PARALLEL routing).',
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('renders CancelAgreementModal and voids document (INK-95)', async () => {
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    render(
      <CancelAgreementModal
        agreementId="ag-1"
        agreementTitle="Employment Agreement"
        onClose={handleClose}
        onSuccess={handleSuccess}
      />,
    );

    expect(screen.getByText(/Cancel \/ Void Agreement/)).toBeDefined();
    const reasonInput = screen.getByPlaceholderText(
      'Explain why this agreement is being cancelled...',
    );
    fireEvent.change(reasonInput, { target: { value: 'Client cancelled contract.' } });

    const voidBtn = screen.getByRole('button', { name: 'Confirm Void / Cancel' });
    fireEvent.click(voidBtn);

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledWith(
        'Agreement "Employment Agreement" has been voided and returned to Draft.',
      );
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('renders PdfViewerModal and triggers onOpenEditor on Design Fields click (INK-268)', () => {
    const handleClose = vi.fn();
    const handleOpenEditor = vi.fn();

    const mockAg = {
      id: 'ag-1',
      title: 'Sales Order NDA',
      version: 1,
      status: 'DRAFT',
      markdownContent: '# Sales Order\n\nAgreement body text.',
      createdAt: '2026-08-27T00:00:00Z',
      updatedAt: '2026-08-27T00:00:00Z',
    };

    render(
      <PdfViewerModal agreement={mockAg} onClose={handleClose} onOpenEditor={handleOpenEditor} />,
    );

    const designFieldsBtn = screen.getByRole('button', { name: /Design Fields/i });
    expect(designFieldsBtn).toBeDefined();

    fireEvent.click(designFieldsBtn);

    expect(handleOpenEditor).toHaveBeenCalledTimes(1);
    expect(handleClose).not.toHaveBeenCalled();
  });

  describe('Signature Validity Indicators (INK-138)', () => {
    it('displays Unsigned indicator for draft unsigned agreement and toggles indicators', () => {
      const mockAg = {
        id: 'ag-unsigned',
        title: 'Unsigned Draft Document',
        version: 1,
        status: 'DRAFT',
        markdownContent: '# Unsigned Document\n\nContent here.',
        createdAt: '2026-08-27T00:00:00Z',
        updatedAt: '2026-08-27T00:00:00Z',
      };

      render(<PdfViewerModal agreement={mockAg} onClose={vi.fn()} />);

      const unsignedBadge = screen.getByTestId('indicator-unsigned');
      expect(unsignedBadge).toBeDefined();
      expect(unsignedBadge.textContent).toContain('Unsigned Document');

      const toggleBtn = screen.getByRole('button', { name: /Hide signature indicators/i });
      expect(toggleBtn).toBeDefined();

      fireEvent.click(toggleBtn);
      expect(screen.queryByTestId('indicator-unsigned')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: /Show signature indicators/i }));
      expect(screen.getByTestId('indicator-unsigned')).toBeDefined();
    });

    it('displays Valid Signature indicator for completed agreement with seal metadata', () => {
      const mockAg = {
        id: 'ag-completed',
        title: 'Signed Employment Contract',
        version: 1,
        status: 'COMPLETED',
        markdownContent: '# Employment Contract\n\nExecuted agreement.',
        createdAt: '2026-08-27T00:00:00Z',
        updatedAt: '2026-08-27T01:00:00Z',
        metadata: {
          sealedAt: '2026-08-27T01:00:00Z',
          signerName: 'Jane Doe',
          signerEmail: 'jane@example.com',
          padesLevel: 'PAdES B-T',
        },
      };

      render(<PdfViewerModal agreement={mockAg} onClose={vi.fn()} />);

      expect(screen.getByTestId('indicator-valid')).toBeDefined();
      expect(screen.getByText(/Valid Signature/i)).toBeDefined();
      expect(screen.getByText(/Jane Doe/i)).toBeDefined();
    });

    it('displays Invalid Signature watermark and badge for voided agreement', () => {
      const mockAg = {
        id: 'ag-voided',
        title: 'Voided Contract',
        version: 1,
        status: 'VOIDED',
        markdownContent: '# Contract\n\nVoided content.',
        createdAt: '2026-08-27T00:00:00Z',
        updatedAt: '2026-08-27T02:00:00Z',
      };

      render(<PdfViewerModal agreement={mockAg} onClose={vi.fn()} />);

      expect(screen.getByTestId('indicator-invalid')).toBeDefined();
      expect(screen.getByTestId('invalid-signature-watermark')).toBeDefined();
    });
  });
});
