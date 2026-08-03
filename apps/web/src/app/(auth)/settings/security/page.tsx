'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { getApiUrl } from '@/lib/api';

interface ProfileData {
  id: string;
  email: string;
  mfaEnabled?: boolean;
  role?: string;
}

interface EnforcementSettings {
  mfaRequired: boolean;
  mfaRequiredRoles: string[];
}

function SecuritySettingsContent() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [setupStep, setSetupStep] = useState<'idle' | 'setup' | 'activated'>('idle');
  const [secret, setSecret] = useState<string>('');
  const [qrCode, setQrCode] = useState<string>('');
  const [totpCode, setTotpCode] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Admin MFA Enforcement state
  const [enforcement, setEnforcement] = useState<EnforcementSettings>({
    mfaRequired: false,
    mfaRequiredRoles: ['*'],
  });
  const [isSavingEnforcement, setIsSavingEnforcement] = useState<boolean>(false);

  useEffect(() => {
    async function loadSecurityData() {
      try {
        setIsLoading(true);
        const token = localStorage.getItem('graphsign_session_token') ?? '';
        const apiUrl = getApiUrl();

        // Load profile
        const profileRes = await fetch(`${apiUrl}/api/v1/auth/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-user-id': localStorage.getItem('graphsign_user_id') ?? '',
          },
        });

        if (profileRes.ok) {
          const data = await profileRes.json();
          setProfile(data);
        }

        // Load organisation MFA enforcement
        const enforcementRes = await fetch(`${apiUrl}/api/v1/auth/mfa-enforcement`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (enforcementRes.ok) {
          const enfData = await enforcementRes.json();
          setEnforcement({
            mfaRequired: enfData.mfaRequired ?? false,
            mfaRequiredRoles: Array.isArray(enfData.mfaRequiredRoles)
              ? enfData.mfaRequiredRoles
              : ['*'],
          });
        }
      } catch {
        setError('Failed to load security settings.');
      } finally {
        setIsLoading(false);
      }
    }

    loadSecurityData();
  }, []);

  async function handleStartSetup() {
    setIsSubmitting(true);
    setError('');
    setMessage('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/auth/mfa/setup`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-user-id': localStorage.getItem('graphsign_user_id') ?? '',
        },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message ?? 'Failed to initiate MFA setup.');
        return;
      }

      setSecret(data.secret);
      setQrCode(data.qrCode);
      setSetupStep('setup');
    } catch {
      setError('Unable to reach server to setup MFA.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifySetup(e: React.FormEvent) {
    e.preventDefault();
    if (totpCode.length !== 6) {
      setError('Please enter a 6-digit TOTP verification code.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setMessage('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/auth/mfa/verify-setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-user-id': localStorage.getItem('graphsign_user_id') ?? '',
        },
        body: JSON.stringify({ code: totpCode }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message ?? 'Invalid TOTP code.');
        return;
      }

      setBackupCodes(data.backupCodes ?? []);
      setSetupStep('activated');
      setMessage('Multi-Factor Authentication (MFA) is now enabled for your account.');
      if (profile) {
        setProfile({ ...profile, mfaEnabled: true });
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDisableMfa() {
    if (
      !confirm(
        'Are you sure you want to disable Multi-Factor Authentication? Your account will be less secure.',
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    setError('');
    setMessage('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/auth/mfa/disable`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-user-id': localStorage.getItem('graphsign_user_id') ?? '',
        },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message ?? 'Failed to disable MFA.');
        return;
      }

      setSetupStep('idle');
      setMessage('MFA has been disabled.');
      if (profile) {
        setProfile({ ...profile, mfaEnabled: false });
      }
    } catch {
      setError('Failed to disable MFA.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveEnforcement(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingEnforcement(true);
    setError('');
    setMessage('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/auth/mfa-enforcement`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mfaRequired: enforcement.mfaRequired,
          mfaRequiredRoles: enforcement.mfaRequiredRoles,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message ?? 'Failed to update MFA enforcement.');
        return;
      }

      setMessage(data.message ?? 'Organisation MFA enforcement policy updated.');
    } catch {
      setError('Unable to save MFA enforcement policy.');
    } finally {
      setIsSavingEnforcement(false);
    }
  }

  function handleRoleToggle(roleName: string) {
    setEnforcement((prev) => {
      const current = prev.mfaRequiredRoles;
      if (current.includes('*')) {
        return { ...prev, mfaRequiredRoles: [roleName] };
      }
      if (current.includes(roleName)) {
        const next = current.filter((r) => r !== roleName);
        return { ...prev, mfaRequiredRoles: next.length === 0 ? ['*'] : next };
      } else {
        return { ...prev, mfaRequiredRoles: [...current, roleName] };
      }
    });
  }

  return (
    <div
      className="min-h-screen bg-neutral-50 flex flex-col font-sans"
      data-testid="security-settings-container"
    >
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
              Security Settings
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
            Security & Multi-Factor Authentication
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            Configure TOTP Multi-Factor Authentication and manage organisation security policies.
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

        {/* User Personal MFA Status Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          {isLoading ? (
            <div className="py-8 text-center text-neutral-500 text-sm animate-pulse">
              Loading security status...
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900">
                    Your Authenticator App (TOTP)
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Use a mobile authenticator app (Google Authenticator, Authy, 1Password) for
                    2-step verification.
                  </p>
                </div>
                <div>
                  {profile?.mfaEnabled ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 border border-green-200"
                      data-testid="mfa-enabled-badge"
                    >
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      MFA Enabled
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600 border border-neutral-200"
                      data-testid="mfa-disabled-badge"
                    >
                      Disabled
                    </span>
                  )}
                </div>
              </div>

              {/* MFA Enabled View */}
              {profile?.mfaEnabled && setupStep !== 'setup' && (
                <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-5 space-y-4">
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    MFA is active. Every login attempt will require entering a 6-digit code from
                    your authenticator app.
                  </p>

                  {backupCodes.length > 0 && (
                    <div className="rounded-lg bg-white border border-neutral-200 p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider">
                        Recovery Backup Codes
                      </h3>
                      <p className="text-xs text-neutral-500">
                        Store these single-use recovery codes in a safe place. You can use them if
                        you lose access to your authenticator app.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                        {backupCodes.map((code, idx) => (
                          <span
                            key={idx}
                            className="font-mono text-xs bg-neutral-100 p-2 rounded text-center font-bold text-neutral-800"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleDisableMfa}
                      disabled={isSubmitting}
                      className="rounded-lg border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50 transition-colors"
                      data-testid="disable-mfa-button"
                    >
                      Disable Multi-Factor Authentication
                    </button>
                  </div>
                </div>
              )}

              {/* Setup Wizard */}
              {(!profile?.mfaEnabled || setupStep === 'setup') && (
                <div className="space-y-6">
                  {setupStep === 'idle' && (
                    <div>
                      <button
                        type="button"
                        onClick={handleStartSetup}
                        disabled={isSubmitting}
                        className="rounded-lg bg-[#ba0000] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] disabled:opacity-60 transition-colors"
                        data-testid="start-mfa-setup-button"
                      >
                        {isSubmitting ? 'Generating Setup...' : 'Setup Authenticator App'}
                      </button>
                    </div>
                  )}

                  {setupStep === 'setup' && (
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 space-y-6">
                      <h3 className="text-sm font-semibold text-neutral-900">
                        Step 1: Scan QR Code
                      </h3>
                      <p className="text-xs text-neutral-600">
                        Scan this QR code using Google Authenticator, Authy, or 1Password.
                      </p>

                      <div className="flex flex-col sm:flex-row items-center gap-6">
                        {qrCode && (
                          <div className="bg-white p-3 border border-neutral-200 rounded-xl shadow-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={qrCode}
                              alt="TOTP QR Code"
                              className="h-40 w-40"
                              data-testid="mfa-qr-code"
                            />
                          </div>
                        )}
                        <div className="space-y-2 text-xs">
                          <span className="font-semibold text-neutral-700 block">
                            Manual Key Entry:
                          </span>
                          <code className="block font-mono bg-white p-2.5 rounded border border-neutral-200 text-neutral-900 font-bold select-all tracking-wider text-sm">
                            {secret}
                          </code>
                          <span className="text-neutral-500 block">Account: {profile?.email}</span>
                          <span className="text-neutral-500 block">Issuer: graphsign.ink</span>
                        </div>
                      </div>

                      <form
                        onSubmit={handleVerifySetup}
                        className="space-y-4 pt-4 border-t border-neutral-200"
                      >
                        <h3 className="text-sm font-semibold text-neutral-900">
                          Step 2: Enter 6-Digit Code
                        </h3>
                        <div className="max-w-xs space-y-2">
                          <input
                            type="text"
                            maxLength={6}
                            required
                            value={totpCode}
                            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                            className="block w-full text-center tracking-[0.5em] font-mono text-xl rounded-lg border border-neutral-300 px-3.5 py-2.5 shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                            placeholder="123456"
                            data-testid="mfa-code-input"
                          />
                          <button
                            type="submit"
                            disabled={isSubmitting || totpCode.length !== 6}
                            className="w-full rounded-lg bg-[#ba0000] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] disabled:opacity-50 transition-colors"
                            data-testid="verify-mfa-code-button"
                          >
                            {isSubmitting ? 'Verifying...' : 'Verify Code & Enable MFA'}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Organisation Admin Enforcement Card */}
        <div
          className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm space-y-6"
          data-testid="mfa-enforcement-card"
        >
          <div>
            <h2 className="text-base font-semibold text-neutral-900">
              Organisation Security Policy
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Enforce mandatory Multi-Factor Authentication (MFA) for members of your organisation.
            </p>
          </div>

          <form
            onSubmit={handleSaveEnforcement}
            className="space-y-6"
            data-testid="mfa-enforcement-form"
          >
            {/* Toggle switch */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-neutral-50 border border-neutral-200">
              <div>
                <span className="text-sm font-medium text-neutral-900 block">
                  Require MFA for Sign-In
                </span>
                <span className="text-xs text-neutral-500 block">
                  When enabled, users without MFA configured will be blocked at sign-in until they
                  complete MFA setup.
                </span>
              </div>
              <input
                type="checkbox"
                checked={enforcement.mfaRequired}
                onChange={(e) => setEnforcement({ ...enforcement, mfaRequired: e.target.checked })}
                className="h-5 w-5 rounded border-neutral-300 text-[#ba0000] focus:ring-[#ba0000]"
                data-testid="enforce-mfa-toggle"
              />
            </div>

            {/* Role Selection */}
            {enforcement.mfaRequired && (
              <div className="space-y-3 pt-2">
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                  Target Roles for Enforcement
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'admin', label: 'Admins' },
                    { id: 'signer', label: 'Signers' },
                    { id: 'user', label: 'Standard Users' },
                  ].map((roleItem) => {
                    const isChecked =
                      enforcement.mfaRequiredRoles.includes('*') ||
                      enforcement.mfaRequiredRoles.includes(roleItem.id);
                    return (
                      <label
                        key={roleItem.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                          isChecked
                            ? 'border-[#ba0000] bg-[#ba0000]/5 text-neutral-900'
                            : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleRoleToggle(roleItem.id)}
                          className="h-4 w-4 rounded border-neutral-300 text-[#ba0000] focus:ring-[#ba0000]"
                        />
                        {roleItem.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-neutral-100">
              <button
                type="submit"
                disabled={isSavingEnforcement}
                className="rounded-lg bg-[#ba0000] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] disabled:opacity-60 transition-colors"
                data-testid="save-enforcement-button"
              >
                {isSavingEnforcement ? 'Saving Policy...' : 'Save Enforcement Policy'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

export default function SecurityPage() {
  return (
    <SessionGuard>
      <SecuritySettingsContent />
    </SessionGuard>
  );
}
