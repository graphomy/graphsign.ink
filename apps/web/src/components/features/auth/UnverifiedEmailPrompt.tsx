'use client';

import { useState, type FormEvent } from 'react';
import { getApiUrl } from '@/lib/api';

export interface UnverifiedEmailPromptProps {
  /** User's current email address */
  email?: string;
  /** Action name that was blocked (e.g. 'sign this document', 'create a template') */
  actionName?: string;
  /** Optional callback after user requests resend */
  onResendRequested?: () => void;
  /** Optional callback to close prompt if displayed as modal */
  onClose?: () => void;
}

/**
 * Component displayed when an unverified user attempts a privileged action.
 *
 * Acceptance Criteria (INK-40):
 * - Given a user attempts to perform a privileged action (e.g., signing a document),
 *   When their email is not verified,
 *   Then the system blocks the action and prompts them to verify their email.
 */
export function UnverifiedEmailPrompt({
  email: initialEmail = '',
  actionName = 'perform this action',
  onResendRequested,
  onClose,
}: UnverifiedEmailPromptProps) {
  const [email, setEmail] = useState(initialEmail);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleResend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    setStatus('idle');
    setMessage('');

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/v1/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok) {
        setStatus('success');
        setMessage(data?.message ?? 'Verification email sent. Please check your inbox.');
        onResendRequested?.();
      } else {
        setStatus('error');
        setMessage(data?.error?.message ?? 'Failed to resend verification email.');
      }
    } catch {
      setStatus('error');
      setMessage('Unable to connect to the server. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50/80 p-6 shadow-sm space-y-4 text-left"
      role="alert"
      aria-live="polite"
      data-testid="unverified-email-prompt"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </div>

        <div className="space-y-1 flex-1">
          <h3 className="text-base font-semibold text-neutral-900">Email verification required</h3>
          <p className="text-sm text-neutral-700">
            You must verify your email address before you can {actionName}.
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
            aria-label="Close prompt"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {status === 'success' && (
        <div
          className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700"
          data-testid="prompt-resend-success"
        >
          {message}
        </div>
      )}

      {status === 'error' && (
        <div
          className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"
          data-testid="prompt-resend-error"
        >
          {message}
        </div>
      )}

      <form onSubmit={handleResend} className="flex flex-col sm:flex-row gap-2 pt-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your.email@example.com"
          className="flex-1 rounded-lg border border-neutral-300 px-3.5 py-2 text-sm shadow-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20 focus:border-[#ba0000]"
          data-testid="prompt-email-input"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-[#ba0000] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] focus:outline-none focus:ring-2 focus:ring-[#ba0000] disabled:opacity-60 transition-colors shrink-0"
          data-testid="prompt-resend-button"
        >
          {isLoading ? 'Sending...' : 'Resend Verification Email'}
        </button>
      </form>
    </div>
  );
}
