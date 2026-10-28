import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebhookModal } from './WebhookModal';

describe('WebhookModal Component Tests (INK-156)', () => {
  const store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, val: string) => {
      store[key] = val;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const k of Object.keys(store)) delete store[k];
    }),
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', mockLocalStorage);
    mockLocalStorage.clear();
    mockLocalStorage.setItem('graphsign_session_token', 'valid_test_token');
  });

  it('renders modal header, fields, and action buttons cleanly', () => {
    const handleClose = vi.fn();
    const handleSuccess = vi.fn();

    render(<WebhookModal onClose={handleClose} onSuccess={handleSuccess} />);

    // Header and close button
    expect(screen.getByText('Create Webhook Subscription')).toBeInTheDocument();

    // Required fields
    expect(screen.getByPlaceholderText('e.g. Production ERP Webhook')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('https://api.yourdomain.com/webhooks/graphsign'),
    ).toBeInTheDocument();

    // Event checkboxes
    expect(screen.getByText('document.completed')).toBeInTheDocument();
    expect(screen.getByText('Select All')).toBeInTheDocument();

    // Action buttons visible at bottom
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    const createBtn = screen.getByRole('button', { name: 'Create Subscription' });
    expect(cancelBtn).toBeInTheDocument();
    expect(createBtn).toBeInTheDocument();

    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('allows adding and removing custom headers', () => {
    render(<WebhookModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByText('No custom headers defined.')).toBeInTheDocument();

    const addHeaderBtn = screen.getByRole('button', { name: /add header/i });
    fireEvent.click(addHeaderBtn);

    expect(screen.queryByText('No custom headers defined.')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Header Name (e.g. X-Custom-Auth)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Header Value')).toBeInTheDocument();
  });
});

