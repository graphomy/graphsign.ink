import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ElectronicConsentModal } from './ElectronicConsentModal';

describe('ElectronicConsentModal (INK-99)', () => {
  it('renders ERSD modal when open and enforces checkbox agreement before continuing', () => {
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

    // Decline button
    const declineBtn = screen.getByTestId('ersd-decline-button');
    fireEvent.click(declineBtn);
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
});
