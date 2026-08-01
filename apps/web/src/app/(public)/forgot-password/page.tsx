'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';

/**
 * Forgot password page — requests a password reset link.
 *
 * Acceptance criteria (INK-39):
 * - Given a user clicks "Forgot Password", When they enter their registered email,
 *   Then a password reset link is sent to their email.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
      const res = await fetch(`${apiUrl}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? 'Failed to send password reset link.');
        return;
      }

      setIsSuccess(true);
    } catch {
      setError('Unable to connect to the server. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }

  if (isSuccess) {
    return (
      <div
        className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm text-center space-y-4"
        role="alert"
        aria-live="polite"
        data-testid="forgot-password-success"
      >
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
        <h2 className="text-xl font-semibold text-neutral-900">Check your inbox</h2>
        <p className="text-neutral-600 text-sm">
          If an account exists for <strong className="text-neutral-900">{email}</strong>, we have
          sent a password reset link.
        </p>
        <p className="text-xs text-neutral-500">
          The link is valid for 1 hour. Didn&apos;t receive it? Check your spam folder or try again.
        </p>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-block rounded-lg bg-[#ba0000] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] transition-colors"
          >
            Back to Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="forgot-password-container">
      <div>
        <h2 className="text-center text-2xl font-semibold text-neutral-900">Reset your password</h2>
        <p className="mt-2 text-center text-sm text-neutral-600">
          Enter your email address and we&apos;ll send you a password reset link.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm space-y-5"
        noValidate
        data-testid="forgot-password-form"
      >
        {error && (
          <div
            className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700"
            role="alert"
            data-testid="api-error"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm shadow-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20 focus:border-[#ba0000]"
            placeholder="you@company.com"
            data-testid="email-input"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-[#ba0000] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] focus:outline-none focus:ring-2 focus:ring-[#ba0000] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          data-testid="submit-button"
        >
          {isLoading ? 'Sending reset link...' : 'Send reset link'}
        </button>
      </form>

      <p className="text-center text-sm text-neutral-600">
        Remember your password?{' '}
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
