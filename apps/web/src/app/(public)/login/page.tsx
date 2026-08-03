'use client';

import { useState, Suspense, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginFormSchema } from '@/lib/validators/auth';

function LoginContent() {
  const searchParams = useSearchParams();
  const isTimeout = searchParams.get('reason') === 'timeout';
  const returnTo = searchParams.get('returnTo');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [redirectTarget, setRedirectTarget] = useState('/dashboard');

  const [showMfaPrompt, setShowMfaPrompt] = useState(false);
  const [showMfaSetupPrompt, setShowMfaSetupPrompt] = useState(false);
  const [mfaTicket, setMfaTicket] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [setupQrCode, setSetupQrCode] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setApiError('');

    // Client-side validation
    const parsed = loginFormSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const err of parsed.error.errors) {
        const field = err.path[0];
        if (field && typeof field === 'string' && !fieldErrors[field]) {
          fieldErrors[field] = err.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
      const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: parsed.data.email, password: parsed.data.password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setApiError(data?.error?.message ?? 'Invalid email or password.');
        return;
      }

      if (data?.mfaRequired) {
        setMfaTicket(data.mfaTicket);
        setShowMfaPrompt(true);
        return;
      }

      if (data?.mfaSetupRequired) {
        setMfaTicket(data.mfaTicket);
        // Start forced setup
        const setupRes = await fetch(`${apiUrl}/api/v1/auth/mfa/setup`, { method: 'POST' });
        const setupData = await setupRes.json().catch(() => null);
        if (setupData?.secret) {
          setSetupSecret(setupData.secret);
          setSetupQrCode(setupData.qrCode);
          setShowMfaSetupPrompt(true);
        }
        return;
      }

      if (data?.token) {
        localStorage.setItem('graphsign_session_token', data.token);
        localStorage.setItem('graphsign_user_email', data.email);
        localStorage.setItem('graphsign_org_id', data.organisationId);
        if (data.id) {
          localStorage.setItem('graphsign_user_id', data.id);
        }
      }

      const target = returnTo ? decodeURIComponent(returnTo) : '/dashboard';
      setRedirectTarget(target);
      setIsSuccess(true);
      window.location.href = target;
    } catch {
      setApiError('Unable to connect to the server. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMfaSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setApiError('');

    if (totpCode.length !== 6) {
      setApiError('Please enter a 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
      const res = await fetch(`${apiUrl}/api/v1/auth/login/mfa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaTicket, code: totpCode }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setApiError(data?.error?.message ?? 'Invalid verification code.');
        return;
      }

      if (data?.token) {
        localStorage.setItem('graphsign_session_token', data.token);
        localStorage.setItem('graphsign_user_email', data.email);
        localStorage.setItem('graphsign_org_id', data.organisationId);
        if (data.id) {
          localStorage.setItem('graphsign_user_id', data.id);
        }
      }

      const target = returnTo ? decodeURIComponent(returnTo) : '/dashboard';
      setRedirectTarget(target);
      setIsSuccess(true);
      window.location.href = target;
    } catch {
      setApiError('Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleForcedSetupSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setApiError('');

    if (totpCode.length !== 6) {
      setApiError('Please enter a 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
      const verifyRes = await fetch(`${apiUrl}/api/v1/auth/mfa/verify-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode }),
      });

      const verifyData = await verifyRes.json().catch(() => null);

      if (!verifyRes.ok) {
        setApiError(verifyData?.error?.message ?? 'Invalid TOTP code.');
        return;
      }

      const target = returnTo ? decodeURIComponent(returnTo) : '/dashboard';
      setRedirectTarget(target);
      setIsSuccess(true);
      window.location.href = target;
    } catch {
      setApiError('Setup verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  if (isSuccess) {
    return (
      <div
        className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm"
        role="alert"
        aria-live="polite"
        data-testid="login-success"
      >
        <div className="text-center space-y-4">
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
          <h2 className="text-xl font-semibold text-neutral-900">Signed in successfully</h2>
          <p className="text-neutral-600">
            Welcome back, <strong className="text-neutral-900">{email}</strong>.
          </p>
          <div className="pt-2">
            <Link
              href={redirectTarget}
              className="inline-block rounded-lg bg-[#ba0000] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] transition-colors"
              data-testid="go-to-dashboard-button"
            >
              Continue
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (showMfaPrompt) {
    return (
      <div className="space-y-6" data-testid="mfa-verification-step">
        <div>
          <h2 className="text-center text-2xl font-semibold text-neutral-900">Two-Step Verification</h2>
          <p className="mt-2 text-center text-sm text-neutral-600">
            Enter the 6-digit code from your authenticator app to complete sign in.
          </p>
        </div>

        <form
          onSubmit={handleMfaSubmit}
          className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm space-y-6"
          data-testid="mfa-login-form"
        >
          {apiError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">
              {apiError}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="totpCode" className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider text-center">
              6-Digit Authenticator Code
            </label>
            <input
              id="totpCode"
              type="text"
              maxLength={6}
              autoFocus
              required
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              className="block w-full text-center tracking-[0.5em] font-mono text-2xl rounded-lg border border-neutral-300 px-3.5 py-3 shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
              placeholder="123456"
              data-testid="mfa-code-input"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || totpCode.length !== 6}
            className="w-full rounded-lg bg-[#ba0000] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] disabled:opacity-50 transition-colors"
            data-testid="mfa-submit-button"
          >
            {isLoading ? 'Verifying...' : 'Verify & Sign In'}
          </button>
        </form>
      </div>
    );
  }

  if (showMfaSetupPrompt) {
    return (
      <div className="space-y-6" data-testid="mfa-forced-setup-step">
        <div>
          <h2 className="text-center text-2xl font-semibold text-neutral-900">MFA Setup Required</h2>
          <p className="mt-2 text-center text-sm text-neutral-600">
            Your organisation requires Multi-Factor Authentication for your account role before signing in.
          </p>
        </div>

        <form
          onSubmit={handleForcedSetupSubmit}
          className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm space-y-6"
          data-testid="mfa-forced-setup-form"
        >
          {apiError && (
            <div
              className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700"
              role="alert"
              data-testid="mfa-setup-error"
            >
              {apiError}
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
              Step 1: Scan QR Code with Authenticator App
            </h3>
            <div className="flex flex-col items-center gap-3">
              {setupQrCode && (
                <div className="bg-white p-2 border border-neutral-200 rounded-lg shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={setupQrCode} alt="TOTP QR Code" className="h-36 w-36" data-testid="forced-mfa-qr" />
                </div>
              )}
              {setupSecret && (
                <div className="text-center">
                  <span className="text-xs text-neutral-500 block">Manual Key Entry:</span>
                  <code className="font-mono text-xs font-bold bg-neutral-100 px-2 py-1 rounded text-neutral-800 tracking-wider">
                    {setupSecret}
                  </code>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-neutral-100">
            <label htmlFor="forcedTotpCode" className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider text-center">
              Step 2: Enter Generated 6-Digit Code
            </label>
            <input
              id="forcedTotpCode"
              type="text"
              maxLength={6}
              autoFocus
              required
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              className="block w-full text-center tracking-[0.5em] font-mono text-2xl rounded-lg border border-neutral-300 px-3.5 py-3 shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
              placeholder="123456"
              data-testid="mfa-forced-code-input"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || totpCode.length !== 6}
            className="w-full rounded-lg bg-[#ba0000] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] disabled:opacity-50 transition-colors"
            data-testid="mfa-forced-submit-button"
          >
            {isLoading ? 'Verifying...' : 'Complete Setup & Sign In'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-center text-2xl font-semibold text-neutral-900">Welcome back</h2>
        <p className="mt-2 text-center text-sm text-neutral-600">
          Sign in to your graphsign.ink account.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm space-y-5"
        noValidate
        data-testid="login-form"
      >
        {/* Session Timeout Warning Banner */}
        {isTimeout && (
          <div
            className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800"
            role="alert"
            data-testid="timeout-banner"
          >
            Your session expired due to inactivity. Please sign in again to continue.
          </div>
        )}

        {/* API error */}
        {apiError && (
          <div
            className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700"
            role="alert"
            aria-live="assertive"
            data-testid="api-error"
          >
            {apiError}
          </div>
        )}

        {/* Email */}
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
            className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm shadow-sm
              placeholder:text-neutral-400
              focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20 focus:border-[#ba0000]
              ${errors.email ? 'border-red-500' : 'border-neutral-300'}`}
            placeholder="you@company.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            data-testid="email-input"
          />
          {errors.email && (
            <p id="email-error" className="mt-1.5 text-sm text-red-600" role="alert">
              {errors.email}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-[#ba0000] hover:text-[#a00000] transition-colors"
              data-testid="forgot-password-link"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm shadow-sm
              placeholder:text-neutral-400
              focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20 focus:border-[#ba0000]
              ${errors.password ? 'border-red-500' : 'border-neutral-300'}`}
            placeholder="••••••••"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            data-testid="password-input"
          />
          {errors.password && (
            <p id="password-error" className="mt-1.5 text-sm text-red-600" role="alert">
              {errors.password}
            </p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-[#ba0000] px-4 py-2.5 text-sm font-semibold text-white
            shadow-sm hover:bg-[#a00000] focus:outline-none focus:ring-2 focus:ring-[#ba0000]
            focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed
            transition-colors duration-150"
          data-testid="login-button"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
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
              Signing in...
            </span>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <p className="text-center text-sm text-neutral-600">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="font-medium text-[#ba0000] hover:text-[#a00000] transition-colors"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-8 text-neutral-500 text-sm">Loading sign in page...</div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
