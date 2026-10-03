import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ElectronicConsentModal } from './ElectronicConsentModal';

describe('ElectronicConsentModal (INK-99)', () => {
  it('renders ERSD modal when open and enforces checkbox agreement before continuing', async () => {
    const onAcceptConsent = vi.fn();
    const onDecline = vi.fn();

    const { rerender } = render(
      <ElectronicConsentModal
        isOpen={true}
        documentTitle="Non-Disclosure Agreement"
        recipientName="Alice Smith"
        senderName="Bob Jones"
        organisationName="Acme Corp"
        onAcceptConsent={onAcceptConsent}
        onDecline={onDecline}
      />,
    );

    expect(screen.getByText('Electronic Record & Signature Disclosure')).toBeDefined();
    expect(screen.getByText('Non-Disclosure Agreement')).toBeDefined();
    expect(screen.getByText('Alice Smith')).toBeDefined();

    const acceptBtn = screen.getByTestId('ersd-accept-button');
    expect(acceptBtn).toHaveProperty('disabled', true);

    // Check the box
    const checkbox = screen.getByTestId('ersd-checkbox');
    fireEvent.click(checkbox);

    expect(acceptBtn).toHaveProperty('disabled', false);

    fireEvent.click(acceptBtn);
    expect(onAcceptConsent).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(acceptBtn).toHaveProperty('disabled', false));

    // Decline button
    const declineBtn = screen.getByTestId('ersd-decline-button');
    fireEvent.click(declineBtn);
    expect(onDecline).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onDecline).not.toHaveBeenCalled();
    fireEvent.click(declineBtn);
    fireEvent.click(screen.getByRole('button', { name: 'Decline agreement' }));
    expect(onDecline).toHaveBeenCalledTimes(1);

    // When isOpen is false, nothing is rendered
    rerender(
      <ElectronicConsentModal
        isOpen={false}
        documentTitle="Non-Disclosure Agreement"
        recipientName="Alice Smith"
        senderName="Bob Jones"
        organisationName="Acme Corp"
        onAcceptConsent={onAcceptConsent}
        onDecline={onDecline}
      />,
    );
    expect(screen.queryByText('Electronic Record & Signature Disclosure')).toBeNull();
  });

  const props = {
    isOpen: true,
    documentTitle: '<script>confidential</script>',
    recipientName: 'Alice',
    senderName: 'Bob',
    onAcceptConsent: vi.fn(),
    onDecline: vi.fn(),
  };

  it('omits missing envelope IDs rather than inventing one', () => {
    render(<ElectronicConsentModal {...props} />);
    expect(screen.queryByText('Envelope ID')).toBeNull();
    expect(screen.queryByText('env_sec_disclosure')).toBeNull();
  });

  it('prints the full disclosure safely as text rather than the clipped signing page', () => {
    const printDocument = document.implementation.createHTMLDocument();
    const print = vi.fn();
    const popup = { document: printDocument, focus: vi.fn(), print, opener: window };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    render(<ElectronicConsentModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Print Disclosure' }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(printDocument.body.textContent).toContain(props.documentTitle);
    expect(printDocument.body.textContent).toContain('Signature validity and limitations');
    expect(printDocument.body.querySelector('script')).toBeNull();
    expect(printDocument.body.textContent).not.toContain('Envelope ID: undefined');
    expect(popup.opener).toBeNull();
    open.mockRestore();
  });

  it('offers download when the print popup is blocked', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<ElectronicConsentModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Print Disclosure' }));
    expect(screen.getByRole('alert').textContent).toContain('Download Disclosure');
    open.mockRestore();
  });

  it('retains the decline confirmation and reports a failed submission', async () => {
    const onDecline = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<ElectronicConsentModal {...props} onDecline={onDecline} />);
    fireEvent.click(screen.getByTestId('ersd-decline-button'));
    fireEvent.change(screen.getByLabelText('Reason for declining (Optional):'), {
      target: { value: '  Paper please  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Decline agreement' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('decline could not be recorded'),
    );
    expect(onDecline).toHaveBeenCalledWith('Paper please');
    expect(screen.getByRole('button', { name: 'Decline agreement' })).toBeDefined();
  });

  it('keeps the consent gate open and allows retry when recording consent fails', async () => {
    const onAcceptConsent = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(undefined);
    render(<ElectronicConsentModal {...props} onAcceptConsent={onAcceptConsent} />);
    fireEvent.click(screen.getByTestId('ersd-checkbox'));
    fireEvent.click(screen.getByTestId('ersd-accept-button'));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Consent could not be recorded'),
    );
    expect(screen.getByTestId('ersd-modal-overlay')).toBeDefined();
    fireEvent.click(screen.getByTestId('ersd-accept-button'));
    await waitFor(() => expect(onAcceptConsent).toHaveBeenCalledTimes(2));
  });
});
