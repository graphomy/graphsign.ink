'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SessionGuard } from '@/components/features/auth/SessionGuard';

interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  timezone?: string | null;
  status: string;
  pendingEmail?: string | null;
  createdAt?: string;
}

function ProfileContent() {
  const searchParams = useSearchParams();
  const verifyToken = searchParams.get('verifyToken');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('UTC');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Handle email verification token if present in URL
  useEffect(() => {
    if (!verifyToken) return;

    async function handleVerifyEmailChange() {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
        const res = await fetch(`${apiUrl}/api/v1/auth/profile/verify-email-change`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: verifyToken }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          setError(data?.error?.message ?? 'Email change verification failed.');
          return;
        }

        setMessage(data.message ?? 'Email address updated successfully!');
      } catch {
        setError('Failed to verify email change.');
      }
    }

    handleVerifyEmailChange();
  }, [verifyToken]);

  // Load user profile
  useEffect(() => {
    async function loadProfile() {
      try {
        setIsLoading(true);
        const token = localStorage.getItem('graphsign_session_token') ?? '';
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

        const res = await fetch(`${apiUrl}/api/v1/auth/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-user-id': localStorage.getItem('graphsign_user_id') ?? '',
          },
        });

        if (res.ok) {
          const data = await res.json();
          setProfile(data);
          setName(data.name ?? '');
          setEmail(data.email ?? '');
          setTimezone(data.timezone ?? 'UTC');
        }
      } catch {
        setError('Failed to load user profile.');
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

      const payload: { name?: string; timezone?: string; email?: string } = {
        name,
        timezone,
      };

      if (email && email !== profile?.email) {
        payload.email = email;
      }

      const res = await fetch(`${apiUrl}/api/v1/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-user-id': localStorage.getItem('graphsign_user_id') ?? '',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message ?? 'Failed to update profile.');
        return;
      }

      setProfile(data);
      if (data.email) {
        localStorage.setItem('graphsign_user_email', data.email);
      }
      setMessage(data.message ?? 'Profile updated successfully.');
    } catch {
      setError('Unable to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  const commonTimezones = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Asia/Kolkata',
    'Asia/Tokyo',
    'Australia/Sydney',
  ];

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col font-sans" data-testid="profile-settings-container">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-neutral-900">
                graphsign<span className="text-[#ba0000]">.ink</span>
              </span>
            </Link>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
              Profile Settings
            </span>
          </div>
          <Link
            href="/dashboard"
            className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            ← Back to Workspace
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Account Profile</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Manage your personal details, email preferences, and display settings.
          </p>
        </div>

        {/* Feedback Alerts */}
        {message && (
          <div
            className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
            role="status"
            data-testid="success-message"
          >
            {message}
          </div>
        )}

        {error && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            role="alert"
            data-testid="error-message"
          >
            {error}
          </div>
        )}

        {/* Pending Email Notice Banner */}
        {profile?.pendingEmail && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Email Change Pending Verification
            </div>
            <p className="text-xs text-amber-800">
              A verification link was sent to <strong className="font-medium">{profile.pendingEmail}</strong>. Please check your inbox to confirm this email update.
            </p>
          </div>
        )}

        {/* Form Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm">
          {isLoading ? (
            <div className="py-12 text-center text-neutral-500 text-sm animate-pulse">
              Loading profile details...
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-6" data-testid="profile-form">
              {/* Full Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-neutral-700">
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                  placeholder="e.g. Alice Vance"
                  data-testid="name-input"
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                  placeholder="you@company.com"
                  data-testid="email-input"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Changing your email address requires clicking a verification link sent to your new email.
                </p>
              </div>

              {/* Timezone */}
              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-neutral-700">
                  Preferred Timezone
                </label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20 bg-white"
                  data-testid="timezone-select"
                >
                  {commonTimezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-neutral-500">
                  Timestamps on agreements and audit logs will be displayed in this timezone.
                </p>
              </div>

              {/* Save Button */}
              <div className="pt-4 border-t border-neutral-100 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-[#ba0000] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] focus:outline-none focus:ring-2 focus:ring-[#ba0000] disabled:opacity-60 transition-colors"
                  data-testid="save-profile-button"
                >
                  {isSaving ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <SessionGuard>
      <Suspense fallback={<div className="p-8 text-center text-neutral-500">Loading page...</div>}>
        <ProfileContent />
      </Suspense>
    </SessionGuard>
  );
}
