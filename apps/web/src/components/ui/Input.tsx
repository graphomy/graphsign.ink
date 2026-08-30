'use client';

import React, { forwardRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  errorMessage?: string;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  showPasswordToggle?: boolean;
  detectCapsLock?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = 'text',
      label,
      helperText,
      errorMessage,
      leftIcon,
      rightSlot,
      showPasswordToggle = false,
      detectCapsLock = false,
      disabled,
      id,
      ...props
    },
    ref,
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const [capsLockOn, setCapsLockOn] = useState(false);
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    const actualType = showPasswordToggle ? (showPassword ? 'text' : 'password') : type;

    function handleKeyUp(e: React.KeyboardEvent<HTMLInputElement>) {
      if (detectCapsLock) {
        setCapsLockOn(e.getModifierState('CapsLock'));
      }
      props.onKeyUp?.(e);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (detectCapsLock) {
        setCapsLockOn(e.getModifierState('CapsLock'));
      }
      props.onKeyDown?.(e);
    }

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <div className="flex items-center justify-between">
            <label htmlFor={inputId} className="block text-[13px] font-medium text-ink-700">
              {label}
            </label>
            {rightSlot}
          </div>
        )}

        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-400">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            type={actualType}
            disabled={disabled}
            aria-invalid={!!errorMessage}
            aria-describedby={
              errorMessage
                ? `${inputId}-error`
                : helperText
                  ? `${inputId}-helper`
                  : undefined
            }
            onKeyUp={handleKeyUp}
            onKeyDown={handleKeyDown}
            className={cn(
              'h-10 w-full bg-white text-sm text-ink-900 placeholder:text-ink-400 rounded-md border border-ink-200 px-3 transition-colors',
              'hover:border-ink-300',
              'focus:border-ink-900 focus:ring-2 focus:ring-ink-950/10 focus:outline-none',
              'disabled:bg-ink-50 disabled:text-ink-400 disabled:cursor-not-allowed',
              leftIcon && 'pl-9',
              showPasswordToggle && 'pr-10',
              errorMessage && 'border-brand-500 bg-brand-50/40 focus:border-brand-600 focus:ring-brand-500/20',
              className,
            )}
            {...props}
          />

          {showPasswordToggle && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-ink-400 hover:text-ink-600 focus:outline-none"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>

        {detectCapsLock && capsLockOn && (
          <p className="text-[13px] text-amber-700 font-medium">Caps Lock is on</p>
        )}

        {errorMessage && (
          <div
            id={`${inputId}-error`}
            role="alert"
            className="flex items-center gap-1.5 text-[13px] text-brand-700"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!errorMessage && helperText && (
          <p id={`${inputId}-helper`} className="text-[13px] text-ink-500">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
