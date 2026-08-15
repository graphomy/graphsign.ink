import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SubmitReviewModal } from './SubmitReviewModal';
import { ReviewDecisionModal } from './ReviewDecisionModal';
import { SendAgreementModal } from './SendAgreementModal';
import { CancelAgreementModal } from './CancelAgreementModal';

describe('Workflow Modals Unit Tests (INK-87 to INK-95)', () => {
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
      expect(handleSuccess).toHaveBeenCalledWith('Agreement submitted for review to reviewer@company.com');
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
      expect(handleSuccess).toHaveBeenCalledWith('Agreement "Employment Agreement" approved successfully.');
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
    const reasonInput = screen.getByPlaceholderText('Explain why this agreement is being cancelled...');
    fireEvent.change(reasonInput, { target: { value: 'Client cancelled contract.' } });

    const voidBtn = screen.getByRole('button', { name: 'Confirm Void / Cancel' });
    fireEvent.click(voidBtn);

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledWith('Agreement "Employment Agreement" has been cancelled.');
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
