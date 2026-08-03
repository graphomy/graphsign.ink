'use client';

import { useState, useEffect, Suspense, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api';

/**
 * Email verification content component.
 * Reads token from search params, calls verify-email API, and handles success/error/resend states.
 *
 * Acceptance criteria (INK-40):
 * - Valid link -> Email verified in system, success message shown.
 * - Expired or invalid link -> Error message displayed with option to resend verification email.
 */
function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'no-token'>(() =>
    token ? 'verifying' : 'no-token',
  );
  const [errorMessage, setErrorMessage] = useState('');

  // Resend state
  const [resendEmail, setResendEmail] = useState('');
  const [resendStatus, setResendStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [resendMessage, setResendMessage] = useState('');

  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    async function verify() {
      try {
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}/api/v1/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (!isMounted) return;

        if (res.ok) {
          setStatus('success');
        } else {
          const data = await res.json().catch(() => null);
          setErrorMessage(
            data?.error?.message ??
              'Invalid or expired verification link. Please request a new one.',
          );
          setStatus('error');
        }
      } catch {
        if (!isMounted) return;
        setErrorMessage('Unable to connect to the verification server. Please try again later.');
        setStatus('error');
      }
    }

    verify();

    return () => {
      isMounted = false;
    };
  }, [token]);

  async function handleResendSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resendEmail) return;

    setResendStatus('loading');
    setResendMessage('');

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/v1/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setResendStatus('success');
        setResendMessage(
          data?.message ?? 'A new verification link has been sent to your email address.',
        );
      } else {
        setResendStatus('error');
        setResendMessage(data?.error?.message ?? 'Failed to send verification email.');
      }
    } catch {
      setResendStatus('error');
      setResendMessage('Unable to connect to the server. Please try again later.');
    }
  }

  return (
    <div className="space-y-6" data-testid="verify-email-container">
      <div>
        <h2 className="text-center text-2xl font-semibold text-neutral-900">Email Verification</h2>
        <p className="mt-2 text-center text-sm text-neutral-600">
          Confirming your email address to secure your account.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm space-y-6">
        {/* Loading state */}
        {status === 'verifying' && (
          <div className="text-center space-y-4 py-4" data-testid="verify-loading">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
              <svg
                className="h-6 w-6 animate-spin text-[#ba0000]"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-neutral-900">Verifying your email...</h3>
            <p className="text-sm text-neutral-500">Please wait while we validate your token.</p>
          </div>
        )}

        {/* Success state */}
        {status === 'success' && (
          <div className="text-center space-y-4 py-4" data-testid="verify-success">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-neutral-900">Email Verified!</h3>
            <p className="text-sm text-neutral-600">
              Your email address has been successfully verified. You now have full access to
              graphsign.ink.
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-block rounded-lg bg-[#ba0000] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] transition-colors"
                data-testid="signin-button"
              >
                Sign in to your account
              </Link>
            </div>
          </div>
        )}

        {/* Error or No Token state */}
        {(status === 'error' || status === 'no-token') && (
          <div className="space-y-6" data-testid="verify-error">
            <div className="text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                <svg
                  className="h-6 w-6 text-amber-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">
                {status === 'no-token' ? 'Verification Link Required' : 'Verification Failed'}
              </h3>
              <p className="text-sm text-neutral-600">
                {status === 'no-token'
                  ? 'No verification token was provided in the link. Please request a new verification email.'
                  : errorMessage}
              </p>
            </div>

            <hr className="border-neutral-200" />

            {/* Resend Verification Form */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-neutral-900">Resend verification email</h4>

              {resendStatus === 'success' && (
                <div
                  className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-700"
                  role="alert"
                  data-testid="resend-success"
                >
                  {resendMessage}
                </div>
              )}

              {resendStatus === 'error' && (
                <div
                  className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700"
                  role="alert"
                  data-testid="resend-error"
                >
                  {resendMessage}
                </div>
              )}

              <form onSubmit={handleResendSubmit} className="space-y-4" data-testid="resend-form">
                <div>
                  <label
                    htmlFor="resend-email"
                    className="block text-sm font-medium text-neutral-700"
                  >
                    Email address
                  </label>
                  <input
                    id="resend-email"
                    name="email"
                    type="email"
                    required
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm shadow-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20 focus:border-[#ba0000]"
                    data-testid="resend-email-input"
                  />
                </div>

                <button
                  type="submit"
                  disabled={resendStatus === 'loading'}
                  className="w-full rounded-lg bg-[#ba0000] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] focus:outline-none focus:ring-2 focus:ring-[#ba0000] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  data-testid="resend-button"
                >
                  {resendStatus === 'loading' ? 'Sending email...' : 'Send new verification link'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-sm text-neutral-600">
        Back to{' '}
        <Link
          href="/login"
          className="font-medium text-[#ba0000] hover:text-[#a00000] transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

/**
 * Public email verification page wrapper with Suspense for search params.
 */
export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-8 text-neutral-500 text-sm">
          Loading verification page...
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
