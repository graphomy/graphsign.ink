'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '@/lib/api';
import { maskEmail } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';

interface OtpVerificationModalProps {
  token: string;
  recipientEmail: string;
  recipientName: string;
  agreementTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onVerified: (otpCode: string) => Promise<void> | void;
}

export function OtpVerificationModal({
  token,
  recipientEmail,
  recipientName,
  agreementTitle,
  isOpen,
  onClose,
  onVerified,
}: OtpVerificationModalProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number>(5);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [expirySeconds, setExpirySeconds] = useState(600); // 10 minutes

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Expiry countdown timer
  useEffect(() => {
    if (!isOpen || expirySeconds <= 0) return;
    const interval = setInterval(() => {
      setExpirySeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, expirySeconds]);

  // Resend cooldown timer
  useEffect(() => {
    if (!isOpen || resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, resendCooldown]);

  // Focus first input on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setDigits(['', '', '', '', '', '']);
        setError(null);
        setIsSuccess(false);
        inputRefs.current[0]?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function handleDigitChange(index: number, value: string) {
    if (isLockedOut || expirySeconds === 0) return;
    setError(null);

    // Multi-character paste
    if (value.length > 1) {
      const cleanDigits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newDigits = [...digits];
      cleanDigits.forEach((d, i) => {
        if (i < 6) newDigits[i] = d;
      });
      setDigits(newDigits);
      const nextIndex = Math.min(cleanDigits.length, 5);
      inputRefs.current[nextIndex]?.focus();

      if (cleanDigits.length === 6) {
        submitOtp(cleanDigits.join(''));
      }
      return;
    }

    const char = value.replace(/\D/g, '');
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit on 6th digit
    if (char && index === 5) {
      const fullOtp = newDigits.join('');
      if (fullOtp.length === 6) {
        submitOtp(fullOtp);
      }
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      } else if (digits[index]) {
        const newDigits = [...digits];
        newDigits[index] = '';
        setDigits(newDigits);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  async function submitOtp(otpCode: string) {
    if (isVerifying || isLockedOut || expirySeconds === 0) return;
    setIsVerifying(true);
    setError(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/sign/${token}/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpCode }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const nextAttempts = attemptsRemaining - 1;
        setAttemptsRemaining(nextAttempts);
        if (nextAttempts <= 0) {
          setIsLockedOut(true);
          throw new Error('Too many failed attempts. Identity verification locked for 15 minutes.');
        }
        throw new Error(
          `That code doesn't match. ${nextAttempts} attempt${nextAttempts === 1 ? '' : 's'} remaining.`,
        );
      }

      setIsSuccess(true);
      setTimeout(async () => {
        await onVerified(otpCode);
      }, 400);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResendCode() {
    if (resendCooldown > 0 || isResending || isLockedOut) return;
    setIsResending(true);
    setError(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/sign/${token}/otp/send`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to resend code.');
      }
      setResendCooldown(30);
      setExpirySeconds(600);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsResending(false);
    }
  }

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isExpired = expirySeconds === 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-950/55 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
      data-testid="otp-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="otp-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-[440px] w-full p-7 text-center shadow-[0_8px_16px_-4px_rgb(16_24_40/0.08),0_24px_48px_-12px_rgb(16_24_40/0.16)] border border-ink-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header Icon */}
        <div className="mx-auto h-12 w-12 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
          <ShieldCheck className="w-6 h-6" aria-hidden="true" />
        </div>

        <h2 id="otp-modal-title" className="text-xl font-bold text-ink-900 tracking-tight">
          Verify Your Identity
        </h2>

        <p className="text-[13px] text-ink-500 mt-2 max-w-[34ch] mx-auto leading-relaxed">
          We sent a 6-digit code to{' '}
          <strong className="text-ink-900 font-semibold">{maskEmail(recipientEmail)}</strong>. Enter
          it to seal your signature on{' '}
          <strong className="text-ink-900 font-semibold">{agreementTitle}</strong>.
        </p>

        {/* 6-Digit Cells */}
        <div
          className="mt-7 flex justify-center gap-2"
          role="group"
          aria-label="One-time verification code"
        >
          {digits.map((digit, index) => {
            const hasError = !!error;
            return (
              <input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={1}
                disabled={isLockedOut || isExpired || isVerifying || isSuccess}
                value={digit}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className={`w-[52px] h-[60px] text-center text-2xl font-bold font-mono rounded-md border transition-all tabular-nums ${
                  isSuccess
                    ? 'bg-verified-50 border-verified-500 text-verified-700'
                    : hasError
                      ? 'bg-brand-50 border-brand-500 text-brand-900 animate-shake'
                      : digit
                        ? 'bg-white border-ink-300 text-ink-900'
                        : 'bg-white border-ink-200 text-ink-900 hover:border-ink-300'
                } focus:border-ink-900 focus:ring-2 focus:ring-ink-950/10 focus:outline-none disabled:bg-ink-50 disabled:text-ink-400 disabled:cursor-not-allowed`}
                data-testid={`otp-input-${index}`}
              />
            );
          })}
        </div>

        {/* Expiry / Status Caption */}
        <div className="mt-3 text-xs tabular-nums">
          {isExpired ? (
            <span className="text-brand-700 font-semibold">Code expired</span>
          ) : (
            <span className={expirySeconds < 60 ? 'text-amber-700 font-medium' : 'text-ink-500'}>
              Code expires in {formatTimer(expirySeconds)}
            </span>
          )}
        </div>

        {/* Error Alert Line */}
        {error && (
          <div
            role="alert"
            className="mt-4 flex items-center justify-center gap-1.5 text-[13px] text-brand-700 font-medium"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-brand-600" />
            <span>{error}</span>
          </div>
        )}

        {/* CTA Button */}
        <div className="mt-6">
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="w-full"
            isLoading={isVerifying}
            disabled={digits.some((d) => !d) || isLockedOut || isExpired}
            onClick={() => submitOtp(digits.join(''))}
            data-testid="otp-verify-submit-button"
          >
            Confirm &amp; Seal Signature
          </Button>
        </div>

        {/* Footer: Cancel & Resend */}
        <div className="mt-5 flex items-center justify-between text-xs">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>

          <Button
            type="button"
            variant={isExpired ? 'outline' : 'link'}
            size="sm"
            disabled={resendCooldown > 0 || isResending || isLockedOut}
            onClick={handleResendCode}
          >
            {isResending ? (
              <span className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Sending…
              </span>
            ) : resendCooldown > 0 ? (
              `Resend in ${resendCooldown}s`
            ) : (
              'Resend code'
            )}
          </Button>
        </div>

        {/* Trust Note Line */}
        <div className="mt-5 pt-4 border-t border-ink-100 flex items-center justify-center gap-1.5 text-xs text-ink-400">
          <ShieldCheck className="w-3.5 h-3.5 text-ink-400" aria-hidden="true" />
          <span>Your IP address, timestamp and device are recorded in the audit trail.</span>
        </div>
      </div>
    </div>
  );
}
