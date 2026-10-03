import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegisterPage from './page';

vi.mock('@/components/features/auth/GuestGuard', () => ({
  GuestGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('RegisterPage Component Tests (INK-304)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders registration form with 18+ terms checkbox and disabled submit initially', () => {
    render(<RegisterPage />);

    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByTestId('terms-checkbox')).toBeInTheDocument();

    const termsLink = screen.getByTestId('terms-link');
    expect(termsLink).toBeInTheDocument();
    expect(termsLink).toHaveAttribute('href', '/terms');
    expect(termsLink).toHaveAttribute('target', '_blank');
    expect(termsLink).toHaveAttribute('rel', 'noopener noreferrer');

    const submitBtn = screen.getByTestId('register-button');
    expect(submitBtn).toBeDisabled();
  });

  it('enables submit button only after checking the 18+ terms checkbox', () => {
    render(<RegisterPage />);

    const submitBtn = screen.getByTestId('register-button');
    const checkbox = screen.getByTestId('terms-checkbox');

    expect(submitBtn).toBeDisabled();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(submitBtn).toBeDisabled();
  });

  it('completes registration when all required inputs and terms agreement are provided', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'usr-1', email: 'test@example.com' }),
    } as unknown as Response);

    render(<RegisterPage />);

    fireEvent.change(screen.getByTestId('email-input'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByTestId('password-input'), {
      target: { value: 'ValidPass123!' },
    });
    fireEvent.change(screen.getByTestId('confirm-password-input'), {
      target: { value: 'ValidPass123!' },
    });

    const checkbox = screen.getByTestId('terms-checkbox');
    fireEvent.click(checkbox);

    const submitBtn = screen.getByTestId('register-button');
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('registration-success')).toBeInTheDocument();
    });
  });
});
