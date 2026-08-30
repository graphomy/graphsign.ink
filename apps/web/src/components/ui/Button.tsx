'use client';

import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ink-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:outline-none disabled:pointer-events-none select-none';

    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-ink-100 disabled:text-ink-400 disabled:border-ink-200 shadow-sm',
      secondary:
        'bg-ink-900 text-white hover:bg-ink-800 disabled:bg-ink-100 disabled:text-ink-400 disabled:border-ink-200',
      outline:
        'bg-white text-ink-900 border border-ink-200 hover:bg-ink-50 hover:border-ink-300 disabled:bg-ink-100 disabled:text-ink-400 disabled:border-ink-200 shadow-sm',
      ghost:
        'bg-transparent text-ink-700 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-400',
      destructive:
        'bg-white text-brand-600 border border-brand-200 hover:bg-brand-50 hover:border-brand-300 disabled:bg-ink-100 disabled:text-ink-400 shadow-sm',
      link: 'text-brand-700 underline-offset-4 hover:underline disabled:text-ink-400 p-0 h-auto',
    };

    const sizeStyles: Record<ButtonSize, string> = {
      sm: 'h-8 px-3 text-xs rounded-md gap-1.5',
      md: 'h-10 px-4 text-sm rounded-md gap-2',
      lg: 'h-12 px-6 text-base rounded-md gap-2.5',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={cn(
          baseStyles,
          variantStyles[variant],
          variant !== 'link' && sizeStyles[size],
          className,
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
        ) : (
          leftIcon && <span className="shrink-0 flex items-center">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && <span className="shrink-0 flex items-center">{rightIcon}</span>}
      </button>
    );
  },
);

Button.displayName = 'Button';
