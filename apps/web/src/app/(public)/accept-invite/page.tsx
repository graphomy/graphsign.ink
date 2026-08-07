'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api';

interface InvitationDetails {
  email: string;
  organisationName: string;
  role: string;
  expiresAt: string;
}

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [details, setDetails] = useState<InvitationDetails | null>(null);
  const [name, setName] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setError('Missing invitation token.');
      setIsLoading(false);
      return;
    }

    async function loadInvitationDetails() {
      try {
        setIsLoading(true);
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}/api/v1/organisations/invitations/details/${token}`);
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          setError(data?.error?.message ?? 'Invalid or expired invitation token.');
          return;
        }

        setDetails(data);
      } catch {
        setError('Failed to fetch invitation details.');
      } finally {
        setIsLoading(false);
      }
    }

    loadInvitationDetails();
  }, [token]);

  async function handleAcceptInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    setIsSubmitting(true);
    setError('');

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/v1/organisations/invitations/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name: name || undefined,
          password: password || undefined,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message ?? 'Failed to accept invitation.');
        return;
      }

      setSuccessMessage(data.message ?? 'Invitation accepted! Redirecting to login...');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch {
      setError('An unexpected error occurred while accepting the invitation.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-neutral-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans"
      data-testid="accept-invite-container"
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <Link href="/" className="inline-block text-2xl font-bold tracking-tight text-neutral-900">
          graphsign<span className="text-[#ba0000]">.ink</span>
        </Link>
        <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
          Join Organisation Workspace
        </h2>
        <p className="text-xs text-neutral-500">
          Complete your account setup to collaborate and sign agreements.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          {error && (
            <div
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700"
              role="alert"
              data-testid="error-message"
            >
              {error}
            </div>
          )}

          {successMessage && (
            <div
              className="rounded-xl border border-green-200 bg-green-50 p-4 text-xs text-green-800 font-semibold"
              role="status"
              data-testid="success-message"
            >
              {successMessage}
            </div>
          )}

          {isLoading ? (
            <div className="py-8 text-center text-xs text-neutral-500 animate-pulse">
              Verifying invitation link...
            </div>
          ) : details ? (
            <form onSubmit={handleAcceptInvite} className="space-y-5" data-testid="accept-invite-form">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-2 text-xs text-neutral-700">
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-500">Organisation:</span>
                  <span className="font-bold text-neutral-900">{details.organisationName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-500">Invited Email:</span>
                  <span className="font-medium text-neutral-800">{details.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-500">Assigned Role:</span>
                  <span className="font-bold uppercase tracking-wider text-[#ba0000]">
                    {details.role}
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="name" className="block text-xs font-semibold text-neutral-700">
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                  placeholder="e.g. Alex Morgan"
                  data-testid="name-input"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-semibold text-neutral-700">
                  Account Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                  placeholder="At least 8 characters"
                  data-testid="password-input"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-[#ba0000] py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#a00000] disabled:opacity-60 transition-colors"
                data-testid="accept-invite-button"
              >
                {isSubmitting ? 'Accepting Invitation...' : 'Accept Invitation & Join Workspace'}
              </button>
            </form>
          ) : (
            <div className="text-center text-xs text-neutral-500">
              Please request a new invitation link from your workspace administrator.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage(_props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-neutral-500">Loading page...</div>}>
      <AcceptInviteContent />
    </Suspense>
  );
}
