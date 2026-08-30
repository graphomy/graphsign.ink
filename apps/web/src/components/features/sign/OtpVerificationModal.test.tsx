import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OtpVerificationModal } from './OtpVerificationModal';

describe('OtpVerificationModal Component Tests (B6 Rebuild)', () => {
  const defaultProps = {
    token: 'test-sign-token',
    recipientEmail: 'signer@example.com',
    recipientName: 'Signer User',
    agreementTitle: 'Vendor Contract',
    isOpen: true,
    onClose: vi.fn(),
    onVerified: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<OtpVerificationModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with masked email and 6 digit input boxes', () => {
    render(<OtpVerificationModal {...defaultProps} />);

    expect(screen.getByText('Verify Your Identity')).toBeInTheDocument();
    expect(screen.getByText(/s••••er@example.com/i)).toBeInTheDocument();

    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(6);
  });

  it('handles 6-digit OTP verification success', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { message: 'OTP verified successfully' },
      }),
    } as Response);

    render(<OtpVerificationModal {...defaultProps} />);

    const inputs = screen.getAllByRole('textbox');
    // Simulate typing 1 2 3 4 5 6
    fireEvent.change(inputs[0]!, { target: { value: '1' } });
    fireEvent.change(inputs[1]!, { target: { value: '2' } });
    fireEvent.change(inputs[2]!, { target: { value: '3' } });
    fireEvent.change(inputs[3]!, { target: { value: '4' } });
    fireEvent.change(inputs[4]!, { target: { value: '5' } });
    fireEvent.change(inputs[5]!, { target: { value: '6' } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/sign/test-sign-token/otp/verify'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ otpCode: '123456' }),
        }),
      );
    });

    await waitFor(
      () => {
        expect(defaultProps.onVerified).toHaveBeenCalledWith('123456');
      },
      { timeout: 1000 },
    );
  });

  it('displays error when invalid OTP is entered', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: { message: 'Invalid verification code' },
      }),
    } as Response);

    render(<OtpVerificationModal {...defaultProps} />);

    const inputs = screen.getAllByRole('textbox');
    // Paste 6-digit invalid code into first input
    fireEvent.change(inputs[0]!, { target: { value: '000000' } });

    await waitFor(() => {
      expect(screen.getByText(/that code doesn't match/i)).toBeInTheDocument();
    });
  });
});
