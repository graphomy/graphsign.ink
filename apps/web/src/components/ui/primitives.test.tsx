import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';
import { Input } from './Input';
import { Badge, StatusPill } from './Badge';
import { Card } from './Card';
import { Skeleton } from './Skeleton';

describe('UI Primitives Unit Tests', () => {
  describe('Button', () => {
    it('renders primary button with correct styles and responds to click', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Click Me</Button>);
      const btn = screen.getByRole('button', { name: /click me/i });
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('renders loading state with spinner and disables button', () => {
      const handleClick = vi.fn();
      render(
        <Button isLoading onClick={handleClick}>
          Submit
        </Button>,
      );
      const btn = screen.getByRole('button', { name: /submit/i });
      expect(btn).toBeDisabled();
      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('renders secondary and outline variants correctly', () => {
      const { rerender } = render(<Button variant="secondary">Secondary</Button>);
      expect(screen.getByRole('button', { name: /secondary/i })).toHaveClass('bg-ink-900');

      rerender(<Button variant="outline">Outline</Button>);
      expect(screen.getByRole('button', { name: /outline/i })).toHaveClass('border-ink-200');
    });
  });

  describe('Input', () => {
    it('renders input with label and helper text', () => {
      render(
        <Input
          id="test-input"
          label="Email Address"
          helperText="We will never share your email."
          placeholder="you@example.com"
        />,
      );
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByText(/we will never share your email/i)).toBeInTheDocument();
    });

    it('renders error state with errorMessage', () => {
      render(
        <Input
          id="test-error-input"
          label="Password"
          errorMessage="Password must be at least 8 characters"
        />,
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        /password must be at least 8 characters/i,
      );
    });
  });

  describe('Badge & StatusPill', () => {
    it('renders Badge with custom text and tone', () => {
      render(<Badge tone="success">Completed</Badge>);
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('renders StatusPill for various lifecycle statuses', () => {
      const { rerender } = render(<StatusPill status="ACTIVE" />);
      expect(screen.getByText('ACTIVE')).toBeInTheDocument();

      rerender(<StatusPill status="SIGNED" />);
      expect(screen.getByText('Signed')).toBeInTheDocument();

      rerender(<StatusPill status="DRAFT" />);
      expect(screen.getByText('Draft')).toBeInTheDocument();

      rerender(<StatusPill status="DECLINED" />);
      expect(screen.getByText('Declined')).toBeInTheDocument();
    });
  });

  describe('Card', () => {
    it('renders Card with custom elevation', () => {
      render(
        <Card data-testid="test-card" elevation="e2">
          <div>Card Content</div>
        </Card>,
      );
      expect(screen.getByTestId('test-card')).toBeInTheDocument();
      expect(screen.getByText('Card Content')).toBeInTheDocument();
    });
  });

  describe('Skeleton', () => {
    it('renders pulsing skeleton placeholder with custom className', () => {
      render(<Skeleton data-testid="test-skeleton" className="h-6 w-32" />);
      const skeleton = screen.getByTestId('test-skeleton');
      expect(skeleton).toHaveClass('animate-pulse');
      expect(skeleton).toHaveClass('h-6');
      expect(skeleton).toHaveClass('w-32');
    });
  });
});
