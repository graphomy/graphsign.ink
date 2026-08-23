import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GuestGuard } from './GuestGuard';

describe('GuestGuard', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();

    // Mock window.location
    // @ts-expect-error Mocking window.location for test environment
    delete window.location;
    // @ts-expect-error Mocking window.location for test environment
    window.location = {
      href: '',
      pathname: '/login',
    };
  });

  afterEach(() => {
    // @ts-expect-error Restoring original window.location
    window.location = originalLocation;
  });

  it('should render children when unauthenticated', () => {
    render(
      <GuestGuard>
        <div data-testid="guest-content">Login Form</div>
      </GuestGuard>,
    );

    expect(screen.getByTestId('guest-content')).toBeInTheDocument();
  });

  it('should redirect to dashboard and not render children when authenticated', () => {
    localStorage.setItem('graphsign_session_token', 'test-token');

    render(
      <GuestGuard>
        <div data-testid="guest-content">Login Form</div>
      </GuestGuard>,
    );

    expect(screen.queryByTestId('guest-content')).not.toBeInTheDocument();
    expect(window.location.href).toBe('/dashboard');
  });

  it('should redirect to custom URL if specified', () => {
    localStorage.setItem('graphsign_session_token', 'test-token');

    render(
      <GuestGuard redirectTo="/custom-page">
        <div data-testid="guest-content">Login Form</div>
      </GuestGuard>,
    );

    expect(window.location.href).toBe('/custom-page');
  });

  it('should redirect when session token is set in another tab (storage event)', () => {
    render(
      <GuestGuard>
        <div data-testid="guest-content">Login Form</div>
      </GuestGuard>,
    );

    expect(screen.getByTestId('guest-content')).toBeInTheDocument();

    // Simulate cross-tab login via storage event
    act(() => {
      localStorage.setItem('graphsign_session_token', 'new-token');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'graphsign_session_token',
          newValue: 'new-token',
        }),
      );
    });

    expect(window.location.href).toBe('/dashboard');
  });
});
