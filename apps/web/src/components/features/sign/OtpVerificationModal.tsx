'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '@/lib/api';

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
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Focus first input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function handleDigitChange(index: number, value: string) {
    // Handle pasting multi-character string
    if (value.length > 1) {
      const cleanDigits = value.replace(/\D/g, '').slice(0, 6).split('');
      const newDigits = [...digits];
      cleanDigits.forEach((d, i) => {
        if (i < 6) newDigits[i] = d;
      });
      setDigits(newDigits);
      const nextIndex = Math.min(cleanDigits.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    const char = value.replace(/\D/g, '');
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleResendCode() {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setError(null);
    setInfoMessage(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/sign/${token}/otp/send`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to resend code.');
      }

      setInfoMessage(`New verification code sent to ${recipientEmail}`);
      setResendCooldown(60);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsResending(false);
    }
  }

  async function handleVerify(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const otpCode = digits.join('');

    if (otpCode.length !== 6) {
      setError('Please enter all 6 digits of your verification code.');
      return;
    }

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
        throw new Error(data.error?.message || data.message || 'Invalid or expired verification code.');
      }

      await onVerified(otpCode);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 text-neutral-900 border border-neutral-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="w-12 h-12 bg-red-50 text-[#ba0000] rounded-full flex items-center justify-center mx-auto mb-3 text-xl font-bold border border-red-200">
            🔐
          </div>
          <h2 className="text-lg font-bold text-neutral-900">Verify Your Identity</h2>
          <p className="text-xs text-neutral-500 max-w-xs mx-auto">
            A 6-digit verification code was sent to <strong className="text-neutral-800">{recipientEmail}</strong> for signing <em>&quot;{agreementTitle}&quot;</em>.
          </p>
        </div>

        {/* Error / Info Messages */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)} className="font-bold text-red-600">×</button>
          </div>
        )}
        {infoMessage && (
          <div className="p-3 bg-green-50 border border-green-200 text-green-800 text-xs rounded-xl flex items-center justify-between">
            <span>✓ {infoMessage}</span>
            <button onClick={() => setInfoMessage(null)} className="font-bold text-green-600">×</button>
          </div>
        )}

        {/* 6-Digit Code Input Grid */}
        <form onSubmit={handleVerify} className="space-y-5">
          <div className="flex justify-center gap-2 sm:gap-3">
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold font-mono rounded-xl border transition-all focus:outline-none ${
                  digit
                    ? 'border-[#ba0000] bg-red-50/30 text-neutral-900 ring-2 ring-[#ba0000]/20'
                    : 'border-neutral-300 bg-neutral-50 hover:bg-white text-neutral-900 focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20'
                }`}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              type="submit"
              disabled={isVerifying || digits.join('').length !== 6}
              className="w-full py-3 bg-[#ba0000] hover:bg-red-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
            >
              {isVerifying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verifying Code...
                </>
              ) : (
                'Confirm & Seal Signature'
              )}
            </button>

            <div className="flex items-center justify-between text-xs text-neutral-500 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="hover:text-neutral-800 font-semibold"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || isResending}
                className="font-bold text-[#ba0000] hover:underline disabled:opacity-40 disabled:no-underline"
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
