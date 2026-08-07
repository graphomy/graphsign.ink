import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ProfileDropdown } from './ProfileDropdown';

describe('ProfileDropdown', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('graphsign_user_email', 'test@graphsign.ink');
    localStorage.setItem('graphsign_session_token', 'test-token');

    // @ts-expect-error Mocking window.location
    delete window.location;
    // @ts-expect-error Mocking window.location
    window.location = { href: '' };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
    });
  });

  afterEach(() => {
    // @ts-expect-error Restoring window.location
    window.location = originalLocation;
  });

  it('should render profile button with initial avatar bubble', () => {
    render(<ProfileDropdown email="test@graphsign.ink" />);

    expect(screen.getByTestId('profile-menu-button')).toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument(); // Initial of test@graphsign.ink
  });

  it('should toggle dropdown menu when menu button is clicked', () => {
    render(<ProfileDropdown email="test@graphsign.ink" />);

    // Menu initially closed
    expect(screen.queryByTestId('profile-dropdown-menu')).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(screen.getByTestId('profile-menu-button'));
    expect(screen.getByTestId('profile-dropdown-menu')).toBeInTheDocument();
    expect(screen.getByTestId('profile-settings-link')).toBeInTheDocument();
    expect(screen.getByTestId('security-settings-link')).toBeInTheDocument();
    expect(screen.getByTestId('session-settings-link')).toBeInTheDocument();
    expect(screen.getByTestId('sign-out-button')).toBeInTheDocument();

    // Click to close
    fireEvent.click(screen.getByTestId('profile-menu-button'));
    expect(screen.queryByTestId('profile-dropdown-menu')).not.toBeInTheDocument();
  });

  it('should close menu when Escape key is pressed', () => {
    render(<ProfileDropdown email="test@graphsign.ink" />);

    fireEvent.click(screen.getByTestId('profile-menu-button'));
    expect(screen.getByTestId('profile-dropdown-menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('profile-dropdown-menu')).not.toBeInTheDocument();
  });

  it('should clear localStorage and redirect to /login on sign out', async () => {
    render(<ProfileDropdown email="test@graphsign.ink" token="test-token" />);

    fireEvent.click(screen.getByTestId('profile-menu-button'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('sign-out-button'));
    });

    expect(localStorage.getItem('graphsign_session_token')).toBeNull();
    expect(window.location.href).toBe('/login');
  });
});
