import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SigningFieldGuide } from './SigningFieldGuide';

describe('SigningFieldGuide Component Tests (INK-103)', () => {
  it('renders field progress and triggers onNavigateNext when incomplete', () => {
    const onNavigateNext = vi.fn();
    const onSubmit = vi.fn();

    render(
      <SigningFieldGuide
        totalRequired={4}
        completedRequired={2}
        onNavigateNext={onNavigateNext}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('50%')).toBeDefined();
    expect(screen.getByText('Next Field ⬇')).toBeDefined();

    const nextBtn = screen.getByTestId('guide-next-field-button');
    fireEvent.click(nextBtn);
    expect(onNavigateNext).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('switches to Ready to Sign and triggers onSubmit when 100% complete', () => {
    const onNavigateNext = vi.fn();
    const onSubmit = vi.fn();

    render(
      <SigningFieldGuide
        totalRequired={3}
        completedRequired={3}
        onNavigateNext={onNavigateNext}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('100%')).toBeDefined();
    expect(screen.getByText('✓ Ready to Sign')).toBeDefined();

    const finishBtn = screen.getByTestId('guide-finish-button');
    fireEvent.click(finishBtn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
