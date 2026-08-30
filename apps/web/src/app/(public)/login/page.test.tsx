import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './page';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/components/features/auth/GuestGuard', () => ({
  GuestGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('LoginPage Component Tests (B1 Screen Rebuild)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    localStorage.clear();
    global.fetch = vi.fn();
  });

  it('renders login form with branding, email, password inputs, and submit button', () => {
    render(<LoginPage />);

    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('displays session timeout banner when reason=timeout in search params', () => {
    mockSearchParams = new URLSearchParams('reason=timeout');
    render(<LoginPage />);

    expect(screen.getByText(/your session expired due to inactivity/i)).toBeInTheDocument();
  });

  it('validates required fields before submitting', async () => {
    render(<LoginPage />);

    const submitBtn = screen.getByRole('button', { name: /^sign in$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it('submits valid credentials, saves session token, and redirects to dashboard', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        token: 'mock-jwt-token',
        email: 'alice@example.com',
        organisationId: 'org-1',
        id: 'usr-1',
      }),
    } as Response);

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'Password123!' },
    });

    const submitBtn = screen.getByRole('button', { name: /^sign in$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(localStorage.getItem('graphsign_session_token')).toBe('mock-jwt-token');
      expect(screen.getByText(/signed in successfully/i)).toBeInTheDocument();
    });
  });

  it('displays API error banner when credentials are invalid', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: { message: 'Invalid email or password' },
      }),
    } as Response);

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'WrongPassword!' },
    });

    const submitBtn = screen.getByRole('button', { name: /^sign in$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });
});
