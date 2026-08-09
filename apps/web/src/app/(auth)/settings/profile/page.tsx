'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { Footer } from '@/components/layout/Footer';
import { getApiUrl } from '@/lib/api';

interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  username?: string | null;
  timezone?: string | null;
  status: string;
  pendingEmail?: string | null;
  createdAt?: string;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

function ProfileContent() {
  const searchParams = useSearchParams();
  const verifyToken = searchParams.get('verifyToken');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('UTC');

  // Password Change state
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isChangingPassword, setIsChangingPassword] = useState<boolean>(false);

  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [passwordMessage, setPasswordMessage] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');

  // Handle email verification token if present in URL
  useEffect(() => {
    if (!verifyToken) return;

    async function handleVerifyEmailChange() {
      try {
        const apiUrl = getApiUrl();
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
        const token = getToken();
        const apiUrl = getApiUrl();

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
          const initialEmail = data.email ?? '';
          setEmail(initialEmail);
          setUsername(data.username ?? (initialEmail ? initialEmail.split('@')[0] : ''));
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
      const token = getToken();
      const apiUrl = getApiUrl();

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

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMessage('');
    setPasswordError('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const token = getToken();
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/auth/profile/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-user-id': localStorage.getItem('graphsign_user_id') ?? '',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setPasswordError(data?.error?.message ?? 'Failed to update password.');
        return;
      }

      setPasswordMessage(data.message ?? 'Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPasswordError('Unable to update password. Please try again.');
    } finally {
      setIsChangingPassword(false);
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
    <div
      className="min-h-screen bg-neutral-50 flex flex-col font-sans text-neutral-900"
      data-testid="profile-settings-container"
    >
      <HeaderNav />

      {/* Main Content */}
      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            User Profile & Account
          </h1>
          <p className="text-xs text-neutral-600 mt-1">
            Manage your personal profile details, email address, timezone, and account password.
          </p>
        </div>

        {/* Feedback Alerts */}
        {message && (
          <div
            className="rounded-xl border border-green-200 bg-green-50 p-4 text-xs font-semibold text-green-800"
            role="status"
            data-testid="success-message"
          >
            {message}
          </div>
        )}

        {error && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700"
            role="alert"
            data-testid="error-message"
          >
            {error}
          </div>
        )}

        {/* Pending Email Notice Banner */}
        {profile?.pendingEmail && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Email Change Pending Verification
            </div>
            <p className="text-xs text-amber-800">
              A verification link was sent to{' '}
              <strong className="font-medium">{profile.pendingEmail}</strong>. Please check your
              inbox to confirm this email update. If user changes the Email ID, it needs to be
              reverified again.
            </p>
          </div>
        )}

        {/* Personal Details Form Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          <div className="border-b border-neutral-100 pb-4">
            <h2 className="text-base font-bold text-neutral-900">Personal Information</h2>
            <p className="text-xs text-neutral-500">
              Update your account name, username, and email address.
            </p>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-neutral-500 text-xs animate-pulse">
              Loading profile details...
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-5" data-testid="profile-form">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Full Name */}
                <div>
                  <label
                    htmlFor="name"
                    className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider"
                  >
                    Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-xs shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                    placeholder="e.g. John Doe"
                    data-testid="name-input"
                  />
                </div>

                {/* Username */}
                <div>
                  <label
                    htmlFor="username"
                    className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider"
                  >
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-xs shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                    placeholder="e.g. johndoe"
                    data-testid="username-input"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider"
                >
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-xs shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                  placeholder="you@company.com"
                  data-testid="email-input"
                />
                <p className="mt-1 text-[11px] text-neutral-500">
                  Changing your email address requires reverifying through a link sent to your new
                  email ID.
                </p>
              </div>

              {/* Timezone */}
              <div>
                <label
                  htmlFor="timezone"
                  className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider"
                >
                  Preferred Timezone
                </label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-xs shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20 bg-white"
                  data-testid="timezone-select"
                >
                  {commonTimezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              {/* Save Button */}
              <div className="pt-3 border-t border-neutral-100 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-[#ba0000] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#a00000] focus:outline-none focus:ring-2 focus:ring-[#ba0000] disabled:opacity-60 transition-colors"
                  data-testid="save-profile-button"
                >
                  {isSaving ? 'Saving Profile...' : 'Save Details'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Change Password Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm space-y-5">
          <div className="border-b border-neutral-100 pb-4">
            <h2 className="text-base font-bold text-neutral-900">Change Password</h2>
            <p className="text-xs text-neutral-500">
              Ensure your account is using a strong, unique password.
            </p>
          </div>

          {passwordMessage && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-xs font-semibold text-green-800">
              {passwordMessage}
            </div>
          )}

          {passwordError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
              {passwordError}
            </div>
          )}

          <form
            onSubmit={handleChangePassword}
            className="space-y-4"
            data-testid="change-password-form"
          >
            <div>
              <label
                htmlFor="currentPassword"
                className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider"
              >
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-xs shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                placeholder="••••••••"
                data-testid="current-password-input"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="newPassword"
                  className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider"
                >
                  New Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-xs shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                  placeholder="••••••••"
                  data-testid="new-password-input"
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider"
                >
                  Confirm New Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-xs shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                  placeholder="••••••••"
                  data-testid="confirm-password-input"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-100 flex justify-end">
              <button
                type="submit"
                disabled={isChangingPassword}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:opacity-60 transition-colors"
                data-testid="change-password-button"
              >
                {isChangingPassword ? 'Updating Password...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <SessionGuard>
      <Suspense
        fallback={
          <div className="p-8 text-center text-neutral-500 text-xs">
            Loading profile settings...
          </div>
        }
      >
        <ProfileContent />
      </Suspense>
    </SessionGuard>
  );
}
