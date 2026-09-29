import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RecordListState } from './RecordListState';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('reassures users when loading takes longer', () => {
  vi.useFakeTimers();
  render(<RecordListState label="templates" onRetry={vi.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading templates...');
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(screen.getByRole('status')).toHaveTextContent('no need to refresh');
});

it('offers recovery after a failed load', () => {
  const retry = vi.fn();
  render(<RecordListState label="templates" error="Could not load records" onRetry={retry} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load records');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledOnce();
});
