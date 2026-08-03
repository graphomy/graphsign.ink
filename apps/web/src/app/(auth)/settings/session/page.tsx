'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { getApiUrl } from '@/lib/api';

function SessionSettingsContent() {
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState<number>(15);
  const [customMinutes, setCustomMinutes] = useState<string>('15');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    async function loadSettings() {
      try {
        setIsLoading(true);
        const token = localStorage.getItem('graphsign_session_token') ?? '';
        const apiUrl = getApiUrl();

        const res = await fetch(`${apiUrl}/api/v1/auth/session-settings`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.sessionTimeoutMinutes) {
            setSessionTimeoutMinutes(data.sessionTimeoutMinutes);
            setCustomMinutes(data.sessionTimeoutMinutes.toString());
          }
        }
      } catch {
        setError('Failed to load session settings.');
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, []);

  async function handleSaveSettings(newTimeout: number) {
    if (newTimeout < 1 || newTimeout > 1440 || !Number.isInteger(newTimeout)) {
      setError('Session timeout must be an integer between 1 and 1440 minutes (24 hours).');
      return;
    }

    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const orgId = localStorage.getItem('graphsign_org_id') ?? '';
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/auth/session-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-organisation-id': orgId,
        },
        body: JSON.stringify({ sessionTimeoutMinutes: newTimeout }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message ?? 'Failed to update session settings.');
        return;
      }

      setSessionTimeoutMinutes(data.sessionTimeoutMinutes);
      setCustomMinutes(data.sessionTimeoutMinutes.toString());
      setMessage(
        'Session timeout updated successfully. All users in your organisation will now be subject to this inactivity timeout.',
      );
    } catch {
      setError('Unable to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  const presets = [5, 15, 30, 60, 120];

  return (
    <div
      className="min-h-screen bg-neutral-50 flex flex-col font-sans"
      data-testid="session-settings-container"
    >
      {/* Navigation Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-neutral-900">
                graphsign<span className="text-[#ba0000]">.ink</span>
              </span>
            </Link>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
              Admin Settings
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
      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            Session Timeout Settings
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            Configure automated session expiration and re-authentication requirements after user
            inactivity.
          </p>
        </div>

        {/* Feedback Messages */}
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

        {/* Settings Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          {isLoading ? (
            <div className="py-12 text-center text-neutral-500 text-sm animate-pulse">
              Loading session configuration...
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-base font-semibold text-neutral-900">
                  Inactivity Timeout Duration
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Users will be automatically logged out and asked to re-authenticate after
                  remaining idle for this period.
                </p>
              </div>

              {/* Current Active Value Banner */}
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase font-semibold text-neutral-500 tracking-wider block">
                    Current Organisation Setting
                  </span>
                  <span className="text-2xl font-bold text-neutral-900">
                    {sessionTimeoutMinutes} {sessionTimeoutMinutes === 1 ? 'minute' : 'minutes'}
                  </span>
                </div>
                <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 border border-green-200">
                  Enforced
                </span>
              </div>

              {/* Presets */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Quick Presets
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {presets.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => handleSaveSettings(mins)}
                      disabled={isSaving}
                      className={`rounded-lg px-4 py-2.5 text-sm font-semibold border transition-colors shadow-sm ${
                        sessionTimeoutMinutes === mins
                          ? 'bg-[#ba0000] text-white border-[#ba0000]'
                          : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                      } disabled:opacity-50`}
                      data-testid={`preset-${mins}`}
                    >
                      {mins} mins
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Input */}
              <div className="space-y-2 pt-2 border-t border-neutral-100">
                <label
                  htmlFor="custom-timeout"
                  className="block text-xs font-semibold uppercase tracking-wider text-neutral-500"
                >
                  Custom Timeout (1 to 1440 minutes)
                </label>
                <div className="flex items-center gap-3 max-w-sm">
                  <input
                    id="custom-timeout"
                    type="number"
                    min={1}
                    max={1440}
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    className="block w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                    placeholder="Enter minutes"
                    data-testid="custom-timeout-input"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveSettings(parseInt(customMinutes, 10))}
                    disabled={isSaving || !customMinutes}
                    className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                    data-testid="save-custom-timeout-button"
                  >
                    {isSaving ? 'Saving...' : 'Apply'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default function SessionSettingsPage() {
  return (
    <SessionGuard>
      <SessionSettingsContent />
    </SessionGuard>
  );
}
