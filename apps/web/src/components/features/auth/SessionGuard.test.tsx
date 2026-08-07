import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SessionGuard } from './SessionGuard';

describe('SessionGuard', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    localStorage.setItem('graphsign_session_token', 'test-token');

    // Mock window.location
    // @ts-expect-error Mocking window.location for test environment
    delete window.location;
    // @ts-expect-error Mocking window.location for test environment
    window.location = {
      href: '',
      pathname: '/dashboard',
      search: '?tab=settings',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionTimeoutMinutes: 15 }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error Restoring original window.location
    window.location = originalLocation;
  });

  it('should render children when authenticated', () => {
    render(
      <SessionGuard>
        <div data-testid="protected-content">Protected Page</div>
      </SessionGuard>,
    );

    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('should redirect to login if not authenticated', () => {
    localStorage.removeItem('graphsign_session_token');

    render(
      <SessionGuard>
        <div>Protected Page</div>
      </SessionGuard>,
    );

    expect(window.location.href).toBe('/login');
  });

  it('should trigger logout and redirect with returnTo on inactivity timeout', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    render(
      <SessionGuard idleTimeoutMs={1000}>
        <div>Protected Page</div>
      </SessionGuard>,
    );

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(localStorage.getItem('graphsign_session_token')).toBeNull();
    expect(window.location.href).toContain('/login?reason=timeout&returnTo=');
    expect(window.location.href).toContain(encodeURIComponent('/dashboard?tab=settings'));
  });

  it('should reset idle timer when user activity occurs', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    render(
      <SessionGuard idleTimeoutMs={1000}>
        <div>Protected Page</div>
      </SessionGuard>,
    );

    // Advance halfway
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Simulate user activity (e.g. mousemove)
    await act(async () => {
      window.dispatchEvent(new Event('mousemove'));
    });

    // Advance another 600ms (total 1100ms since start, but only 600ms since reset)
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    // Should still be authenticated because timer was reset
    expect(localStorage.getItem('graphsign_session_token')).toBe('test-token');

    // Advance full remaining time to trigger timeout
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(localStorage.getItem('graphsign_session_token')).toBeNull();
  });
});
