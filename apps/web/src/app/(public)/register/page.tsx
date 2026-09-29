'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { registerFormSchema, getPasswordRequirements } from '@/lib/validators/auth';
import { getApiUrl } from '@/lib/api';
import { GuestGuard } from '@/components/features/auth/GuestGuard';

/**
 * Registration page — creates a new user account.
 *
 * Acceptance criteria (INK-38):
 * - Valid email + password → account created
 * - Invalid email format → error displayed
 * - Weak password → error displayed
 * - Duplicate email → error displayed
 */
function RegisterContent() {
  const [planType, setPlanType] = useState<'individual' | 'teams'>('individual');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const passwordRequirements = getPasswordRequirements(password);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setApiError('');

    // Client-side validation
    const parsed = registerFormSchema.safeParse({
      email,
      password,
      confirmPassword,
      planType,
      companyName: planType === 'teams' ? companyName : undefined,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const err of parsed.error.issues) {
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
      const res = await fetch(`${apiUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: parsed.data.email,
          password: parsed.data.password,
          planType: parsed.data.planType,
          companyName: parsed.data.companyName,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setApiError(data?.error?.message ?? 'Something went wrong. Please try again.');
        return;
      }

      setIsSuccess(true);
    } catch {
      setApiError('Unable to connect to the server. Please try again later.');
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
        data-testid="registration-success"
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
          <h2 className="text-xl font-semibold text-neutral-900">Check your email</h2>
          <p className="text-neutral-600">
            We&apos;ve sent a verification link to{' '}
            <strong className="text-neutral-900">{email}</strong>. Please click the link to activate
            your account.
          </p>
          <p className="text-sm text-neutral-500">
            The link expires in 24 hours. Didn&apos;t receive the email? Check your spam folder.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Brand Lockup */}
      <div className="flex items-center justify-center gap-2.5">
        <div className="h-10 w-10 rounded-xl bg-brand-600 text-white font-black text-xl flex items-center justify-center shadow-md shadow-brand-600/20">
          g
        </div>
        <h2 className="text-xl font-bold tracking-tight text-ink-900">
          graphsign<span className="text-brand-600">.ink</span>
        </h2>
      </div>

      <div>
        <h2 className="text-center text-2xl font-bold tracking-tight text-ink-900">
          Create your account
        </h2>
        <p className="mt-1 text-center text-sm text-ink-500">
          Start managing your agreements securely.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-ink-200 bg-white p-6 sm:p-8 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_1px_3px_rgb(16_24_40/0.06)] space-y-5"
        noValidate
        data-testid="register-form"
      >
        {/* Plan Selection */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            Choose your workspace type
          </label>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Workspace Type">
            <button
              type="button"
              role="radio"
              aria-checked={planType === 'individual'}
              onClick={() => {
                setPlanType('individual');
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.email;
                  return next;
                });
              }}
              className={`flex flex-col text-left p-3.5 rounded-lg border text-sm transition-all duration-150 ${
                planType === 'individual'
                  ? 'border-[#ba0000] bg-red-50/50 ring-1 ring-[#ba0000]'
                  : 'border-neutral-200 hover:border-neutral-300 bg-neutral-50/40'
              }`}
              data-testid="plan-individual-button"
            >
              <span className="font-semibold text-neutral-900 flex items-center justify-between">
                Individual
                <span className="text-[11px] font-normal px-1.5 py-0.5 rounded bg-neutral-200/80 text-neutral-700">
                  Solo
                </span>
              </span>
              <span className="text-xs text-neutral-500 mt-1">
                Personal use, works with any email (Gmail, etc.)
              </span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={planType === 'teams'}
              onClick={() => setPlanType('teams')}
              className={`flex flex-col text-left p-3.5 rounded-lg border text-sm transition-all duration-150 ${
                planType === 'teams'
                  ? 'border-[#ba0000] bg-red-50/50 ring-1 ring-[#ba0000]'
                  : 'border-neutral-200 hover:border-neutral-300 bg-neutral-50/40'
              }`}
              data-testid="plan-teams-button"
            >
              <span className="font-semibold text-neutral-900 flex items-center justify-between">
                Teams
                <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-[#ba0000]/10 text-[#ba0000]">
                  Company
                </span>
              </span>
              <span className="text-xs text-neutral-500 mt-1">
                Role management, team invites, custom domains
              </span>
            </button>
          </div>
        </div>

        {/* Company Name (for Teams plan) */}
        {planType === 'teams' && (
          <div>
            <label htmlFor="companyName" className="block text-sm font-medium text-neutral-700">
              Company or organization name
            </label>
            <input
              id="companyName"
              name="companyName"
              type="text"
              required={planType === 'teams'}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm shadow-sm
                placeholder:text-neutral-400
                focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20 focus:border-[#ba0000]
                ${errors.companyName ? 'border-red-500' : 'border-neutral-300'}`}
              placeholder="Acme Corporation"
              data-testid="company-name-input"
            />
            {errors.companyName && (
              <p className="mt-1.5 text-sm text-red-600" role="alert">
                {errors.companyName}
              </p>
            )}
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
          <div className="flex items-center justify-between">
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
              Email address
            </label>
            {planType === 'teams' && (
              <span className="text-xs text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded">
                Business email required
              </span>
            )}
          </div>
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
            placeholder={planType === 'teams' ? 'alex@company.com' : 'you@example.com'}
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
          <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm shadow-sm
              placeholder:text-neutral-400
              focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20 focus:border-[#ba0000]
              ${errors.password ? 'border-red-500' : 'border-neutral-300'}`}
            placeholder="••••••••"
            aria-invalid={!!errors.password}
            aria-describedby="password-requirements"
            data-testid="password-input"
          />
          {errors.password && (
            <p className="mt-1.5 text-sm text-red-600" role="alert">
              {errors.password}
            </p>
          )}

          {/* Password strength indicator */}
          {password.length > 0 && (
            <div
              className="mt-3 space-y-1.5"
              id="password-requirements"
              aria-label="Password requirements"
            >
              {passwordRequirements.map((req) => (
                <div key={req.label} className="flex items-center gap-2 text-xs">
                  {req.met ? (
                    <svg
                      className="h-3.5 w-3.5 text-green-500 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-3.5 w-3.5 text-neutral-400 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={req.met ? 'text-green-700' : 'text-neutral-500'}>
                    {req.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-700">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={`mt-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-sm shadow-sm
              placeholder:text-neutral-400
              focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20 focus:border-[#ba0000]
              ${errors.confirmPassword ? 'border-red-500' : 'border-neutral-300'}`}
            placeholder="••••••••"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
            data-testid="confirm-password-input"
          />
          {errors.confirmPassword && (
            <p id="confirm-password-error" className="mt-1.5 text-sm text-red-600" role="alert">
              {errors.confirmPassword}
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
          data-testid="register-button"
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
              Creating account...
            </span>
          ) : (
            'Create account'
          )}
        </button>
      </form>

      <p className="text-center text-sm text-neutral-600">
        Already have an account?{' '}
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

export default function RegisterPage() {
  return (
    <GuestGuard>
      <div className="min-h-[100dvh] flex flex-col justify-center items-center bg-ink-50 px-4 py-8 sm:px-6">
        <div className="w-full max-w-[480px]">
          <RegisterContent />
        </div>
      </div>
    </GuestGuard>
  );
}
