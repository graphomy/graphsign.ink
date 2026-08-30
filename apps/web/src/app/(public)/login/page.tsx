'use client';

import React, { useState, useRef, useEffect, Suspense, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginFormSchema } from '@/lib/validators/auth';
import { getApiUrl } from '@/lib/api';
import { GuestGuard } from '@/components/features/auth/GuestGuard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AlertCircle, ShieldCheck, Lock, FileClock, CheckCircle2 } from 'lucide-react';

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

  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  function handleEmailBlur() {
    if (!email) return;
    const parsed = loginFormSchema.shape.email.safeParse(email);
    if (!parsed.success) {
      setErrors((prev) => ({ ...prev, email: parsed.error.errors[0]?.message || 'Invalid email' }));
    } else {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.email;
        return next;
      });
    }
  }

  function handlePasswordBlur() {
    if (!password) return;
    const parsed = loginFormSchema.shape.password.safeParse(password);
    if (!parsed.success) {
      setErrors((prev) => ({
        ...prev,
        password: parsed.error.errors[0]?.message || 'Password required',
      }));
    } else {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.password;
        return next;
      });
    }
  }

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
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: parsed.data.email, password: parsed.data.password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setApiError(data?.error?.message ?? 'Email or password is incorrect.');
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
        localStorage.setItem('token', data.token);
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
      const apiUrl = getApiUrl();
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
        localStorage.setItem('token', data.token);
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
      const apiUrl = getApiUrl();
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
        className="w-full max-w-[420px] bg-white border border-ink-200 rounded-lg p-8 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_1px_3px_rgb(16_24_40/0.06)] text-center space-y-4"
        role="alert"
        aria-live="polite"
        data-testid="login-success"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-verified-50 text-verified-600">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-ink-900">Signed in successfully</h2>
        <p className="text-sm text-ink-600">
          Welcome back, <strong className="text-ink-900">{email}</strong>.
        </p>
        <div className="pt-2">
          <Link
            href={redirectTarget}
            className="inline-flex w-full items-center justify-center rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
            data-testid="go-to-dashboard-button"
          >
            Continue
          </Link>
        </div>
      </div>
    );
  }

  if (showMfaPrompt) {
    return (
      <div
        className="w-full max-w-[420px] bg-white border border-ink-200 rounded-lg p-8 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_1px_3px_rgb(16_24_40/0.06)] space-y-6"
        data-testid="mfa-verification-step"
      >
        <div className="text-center">
          <h2 className="text-xl font-bold text-ink-900">Two-Step Verification</h2>
          <p className="mt-1 text-sm text-ink-500">
            Enter the 6-digit code from your authenticator app to complete sign in.
          </p>
        </div>

        <form onSubmit={handleMfaSubmit} className="space-y-5" data-testid="mfa-login-form">
          {apiError && (
            <div
              className="rounded-md bg-brand-50 border border-brand-200 p-3 text-sm text-brand-800 flex items-center gap-2"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-brand-600" />
              <span>{apiError}</span>
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="totpCode"
              className="block text-xs font-semibold text-ink-700 uppercase tracking-wider text-center"
            >
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
              className="block w-full text-center tracking-[0.5em] font-mono text-2xl rounded-md border border-ink-200 px-3.5 py-3 bg-white text-ink-900 shadow-sm focus:border-ink-900 focus:ring-2 focus:ring-ink-950/10 focus:outline-none"
              placeholder="123456"
              data-testid="mfa-code-input"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            variant="primary"
            className="w-full"
            isLoading={isLoading}
            disabled={totpCode.length !== 6}
            data-testid="mfa-submit-button"
          >
            Verify & Sign In
          </Button>
        </form>
      </div>
    );
  }

  if (showMfaSetupPrompt) {
    return (
      <div
        className="w-full max-w-[420px] bg-white border border-ink-200 rounded-lg p-8 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_1px_3px_rgb(16_24_40/0.06)] space-y-6"
        data-testid="mfa-forced-setup-step"
      >
        <div className="text-center">
          <h2 className="text-xl font-bold text-ink-900">MFA Setup Required</h2>
          <p className="mt-1 text-sm text-ink-500">
            Your organisation requires Multi-Factor Authentication for your account before signing
            in.
          </p>
        </div>

        <form
          onSubmit={handleForcedSetupSubmit}
          className="space-y-5"
          data-testid="mfa-forced-setup-form"
        >
          {apiError && (
            <div
              className="rounded-md bg-brand-50 border border-brand-200 p-3 text-sm text-brand-800 flex items-center gap-2"
              role="alert"
              data-testid="mfa-setup-error"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-brand-600" />
              <span>{apiError}</span>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-ink-700 uppercase tracking-wider text-center">
              Step 1: Scan QR Code with Authenticator App
            </h3>
            <div className="flex flex-col items-center gap-2">
              {setupQrCode && (
                <div className="bg-white p-2 border border-ink-200 rounded-md shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={setupQrCode}
                    alt="TOTP QR Code"
                    className="h-36 w-36"
                    data-testid="forced-mfa-qr"
                  />
                </div>
              )}
              {setupSecret && (
                <div className="text-center">
                  <span className="text-xs text-ink-500 block">Manual Key Entry:</span>
                  <code className="font-mono text-xs font-bold bg-ink-100 px-2 py-1 rounded text-ink-800 tracking-wider">
                    {setupSecret}
                  </code>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-ink-100">
            <label
              htmlFor="forcedTotpCode"
              className="block text-xs font-semibold text-ink-700 uppercase tracking-wider text-center"
            >
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
              className="block w-full text-center tracking-[0.5em] font-mono text-2xl rounded-md border border-ink-200 px-3.5 py-3 bg-white text-ink-900 shadow-sm focus:border-ink-900 focus:ring-2 focus:ring-ink-950/10 focus:outline-none"
              placeholder="123456"
              data-testid="mfa-forced-code-input"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            variant="primary"
            className="w-full"
            isLoading={isLoading}
            disabled={totpCode.length !== 6}
            data-testid="mfa-forced-submit-button"
          >
            Complete Setup & Sign In
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center">
      {/* Brand Lockup above card (24px gap) */}
      <div className="mb-6 flex items-center gap-2.5">
        <div className="h-10 w-10 rounded-xl bg-brand-600 text-white font-black text-xl flex items-center justify-center shadow-md shadow-brand-600/20">
          g
        </div>
        <h2 className="text-xl font-bold tracking-tight text-ink-900">
          graphsign<span className="text-brand-600">.ink</span>
        </h2>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-[420px] bg-white border border-ink-200 sm:rounded-lg p-6 sm:p-8 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_1px_3px_rgb(16_24_40/0.06)]">
        <div className="text-center mb-7">
          <h2 className="text-xl font-bold text-ink-900">Welcome back</h2>
          <p className="mt-1 text-sm text-ink-500">Sign in to continue to your agreements.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate data-testid="login-form">
          {/* Session Timeout Warning Banner */}
          {isTimeout && (
            <div
              className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex items-center gap-2"
              role="alert"
              data-testid="timeout-banner"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-700" />
              <span>Your session expired due to inactivity. Please sign in again.</span>
            </div>
          )}

          {/* API Server Error */}
          {apiError && (
            <div
              className="rounded-md bg-brand-50 border border-brand-200 p-3 text-sm text-brand-800 flex items-center gap-2"
              role="alert"
              aria-live="assertive"
              data-testid="api-error"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-brand-600" />
              <span>{apiError}</span>
            </div>
          )}

          {/* Email field */}
          <Input
            ref={emailInputRef}
            id="email"
            name="email"
            type="email"
            label="Email address"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={handleEmailBlur}
            errorMessage={errors.email}
            placeholder="you@company.com"
            data-testid="email-input"
          />

          {/* Password field with toggle & caps-lock */}
          <Input
            id="password"
            name="password"
            type="password"
            label="Password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={handlePasswordBlur}
            errorMessage={errors.password}
            placeholder="••••••••"
            showPasswordToggle
            detectCapsLock
            rightSlot={
              <Link
                href="/forgot-password"
                className="text-[13px] font-medium text-brand-700 hover:underline"
                data-testid="forgot-password-link"
              >
                Forgot password?
              </Link>
            }
            data-testid="password-input"
          />

          {/* Submit CTA */}
          <Button
            type="submit"
            size="lg"
            variant="primary"
            className="w-full"
            isLoading={isLoading}
            data-testid="login-button"
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>

      {/* New account link below card (24px gap) */}
      <div className="mt-6 text-center text-sm text-ink-500">
        New to graphsign.ink?{' '}
        <Link href="/register" className="font-medium text-brand-700 hover:underline">
          Create an account
        </Link>
      </div>

      {/* Trust row below (32px gap) */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-ink-400">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-ink-400" aria-hidden="true" />
          <span>ESIGN &amp; eIDAS compliant</span>
        </div>
        <span className="h-1 w-1 rounded-full bg-ink-300" aria-hidden="true" />
        <div className="flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-ink-400" aria-hidden="true" />
          <span>AES-256 encryption</span>
        </div>
        <span className="h-1 w-1 rounded-full bg-ink-300" aria-hidden="true" />
        <div className="flex items-center gap-1.5">
          <FileClock className="w-3.5 h-3.5 text-ink-400" aria-hidden="true" />
          <span>Immutable audit trail</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <GuestGuard>
      <div className="min-h-[100dvh] grid place-items-center bg-ink-50 px-4 py-8">
        <Suspense
          fallback={
            <div className="text-center py-8 text-ink-400 text-sm">Loading sign in page...</div>
          }
        >
          <LoginContent />
        </Suspense>
      </div>
    </GuestGuard>
  );
}
