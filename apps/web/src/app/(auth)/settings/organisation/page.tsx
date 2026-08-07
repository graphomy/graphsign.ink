'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { getApiUrl } from '@/lib/api';

interface OrganisationProfile {
  id: string;
  name: string;
  slug: string;
  status: string;
  sessionTimeoutMinutes: number;
  mfaRequired: boolean;
  mfaRequiredRoles?: string[];
  createdAt: string;
}

interface BrandingSettings {
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  companyAddress?: string | null;
  defaultSenderName?: string | null;
  emailFooterText?: string | null;
}

interface UsageSummary {
  organisationId: string;
  organisationName: string;
  storageQuotaBytes: string;
  storageUsedBytes: string;
  storageUsagePercent: number;
  maxDocuments: number;
  documentCount: number;
  documentUsagePercent: number;
  maxUsers: number;
  activeUsersCount: number;
  pendingInvitationsCount: number;
  isStorageNearLimit: boolean;
  isStorageLimitReached: boolean;
  isDocumentLimitReached: boolean;
}

interface ComplianceSettings {
  allowedEsignStandards?: string[];
  requireReauthBeforeSigning: boolean;
  signatureReasonRequired: boolean;
  documentRetentionDays: number;
}

interface InvitationItem {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

function OrganisationSettingsContent() {
  const [activeTab, setActiveTab] = useState<
    'general' | 'branding' | 'members' | 'usage' | 'compliance'
  >('general');

  // Loading & State
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Form States
  const [org, setOrg] = useState<OrganisationProfile | null>(null);
  const [name, setName] = useState<string>('');
  const [sessionTimeout, setSessionTimeout] = useState<number>(15);
  const [mfaRequired, setMfaRequired] = useState<boolean>(false);

  // Branding Form States
  const [branding, setBranding] = useState<BrandingSettings>({});
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [primaryColor, setPrimaryColor] = useState<string>('#ba0000');
  const [secondaryColor, setSecondaryColor] = useState<string>('#1e293b');
  const [companyAddress, setCompanyAddress] = useState<string>('');
  const [defaultSenderName, setDefaultSenderName] = useState<string>('');
  const [emailFooterText, setEmailFooterText] = useState<string>('');

  // Usage State
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  // Compliance Form States
  const [compliance, setCompliance] = useState<ComplianceSettings>({
    allowedEsignStandards: ['ESIGN', 'eIDAS_SES'],
    requireReauthBeforeSigning: false,
    signatureReasonRequired: false,
    documentRetentionDays: 365,
  });

  // Invitations State
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<string>('user');
  const [isInviting, setIsInviting] = useState<boolean>(false);

  // Fetch Organisation Data
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const token = localStorage.getItem('graphsign_session_token') ?? '';
        const userId = localStorage.getItem('graphsign_user_id') ?? '';
        const apiUrl = getApiUrl();

        const headers = {
          Authorization: `Bearer ${token}`,
          'x-user-id': userId,
        };

        // Fetch profile
        const resOrg = await fetch(`${apiUrl}/api/v1/organisations/me`, { headers });
        if (resOrg.ok) {
          const dataOrg = await resOrg.json();
          setOrg(dataOrg);
          setName(dataOrg.name ?? '');
          setSessionTimeout(dataOrg.sessionTimeoutMinutes ?? 15);
          setMfaRequired(dataOrg.mfaRequired ?? false);
        }

        // Fetch branding
        const resBranding = await fetch(`${apiUrl}/api/v1/organisations/me/branding`, { headers });
        if (resBranding.ok) {
          const dataBranding = await resBranding.json();
          setBranding(dataBranding);
          setLogoUrl(dataBranding.logoUrl ?? '');
          setPrimaryColor(dataBranding.primaryColor ?? '#ba0000');
          setSecondaryColor(dataBranding.secondaryColor ?? '#1e293b');
          setCompanyAddress(dataBranding.companyAddress ?? '');
          setDefaultSenderName(dataBranding.defaultSenderName ?? '');
          setEmailFooterText(dataBranding.emailFooterText ?? '');
        }

        // Fetch usage
        const resUsage = await fetch(`${apiUrl}/api/v1/organisations/me/usage`, { headers });
        if (resUsage.ok) {
          const dataUsage = await resUsage.json();
          setUsage(dataUsage);
        }

        // Fetch compliance
        const resCompliance = await fetch(`${apiUrl}/api/v1/organisations/me/compliance`, {
          headers,
        });
        if (resCompliance.ok) {
          const dataCompliance = await resCompliance.json();
          setCompliance(dataCompliance);
        }

        // Fetch invitations
        const resInv = await fetch(`${apiUrl}/api/v1/organisations/invitations`, { headers });
        if (resInv.ok) {
          const dataInv = await resInv.json();
          setInvitations(Array.isArray(dataInv) ? dataInv : []);
        }
      } catch {
        setError('Failed to load organisation settings.');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  // Save General Settings
  async function handleSaveGeneral(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const userId = localStorage.getItem('graphsign_user_id') ?? '';
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/organisations/me/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-user-id': userId,
        },
        body: JSON.stringify({
          name,
          sessionTimeoutMinutes: Number(sessionTimeout),
          mfaRequired,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message ?? 'Failed to update settings.');
        return;
      }

      setMessage(data.message ?? 'Settings saved successfully.');
    } catch {
      setError('Unable to save settings.');
    } finally {
      setIsSaving(false);
    }
  }

  // Save Branding
  async function handleSaveBranding(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const userId = localStorage.getItem('graphsign_user_id') ?? '';
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/organisations/me/branding`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-user-id': userId,
        },
        body: JSON.stringify({
          logoUrl: logoUrl || null,
          primaryColor,
          secondaryColor,
          companyAddress: companyAddress || null,
          defaultSenderName: defaultSenderName || null,
          emailFooterText: emailFooterText || null,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message ?? 'Failed to update branding.');
        return;
      }

      setMessage(data.message ?? 'Branding updated successfully.');
    } catch {
      setError('Unable to save branding.');
    } finally {
      setIsSaving(false);
    }
  }

  // Save Compliance
  async function handleSaveCompliance(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const userId = localStorage.getItem('graphsign_user_id') ?? '';
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/organisations/me/compliance`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-user-id': userId,
        },
        body: JSON.stringify(compliance),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message ?? 'Failed to update compliance settings.');
        return;
      }

      setMessage(data.message ?? 'Compliance settings updated successfully.');
    } catch {
      setError('Unable to save compliance settings.');
    } finally {
      setIsSaving(false);
    }
  }

  // Send Member Invitation
  async function handleSendInvitation(e: React.FormEvent) {
    e.preventDefault();
    setIsInviting(true);
    setError('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const userId = localStorage.getItem('graphsign_user_id') ?? '';
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/organisations/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-user-id': userId,
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error?.message ?? 'Failed to send invitation.');
        return;
      }

      setInvitations([data, ...invitations]);
      setInviteEmail('');
      setShowInviteModal(false);
      setMessage(data.message ?? 'Invitation sent successfully.');
    } catch {
      setError('Failed to dispatch invitation email.');
    } finally {
      setIsInviting(false);
    }
  }

  // Revoke Invitation
  async function handleRevokeInvitation(id: string) {
    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const userId = localStorage.getItem('graphsign_user_id') ?? '';
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/organisations/invitations/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-user-id': userId,
        },
      });

      if (res.ok) {
        setInvitations(invitations.map((i) => (i.id === id ? { ...i, status: 'revoked' } : i)));
        setMessage('Invitation revoked.');
      }
    } catch {
      setError('Failed to revoke invitation.');
    }
  }

  const formatBytes = (bytesStr?: string) => {
    if (!bytesStr) return '0 B';
    const bytes = Number(bytesStr);
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div
      className="min-h-screen bg-neutral-50 flex flex-col font-sans"
      data-testid="organisation-settings-container"
    >
      {/* Top Header */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-neutral-900">
                graphsign<span className="text-[#ba0000]">.ink</span>
              </span>
            </Link>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
              Organisation Admin
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

      {/* Main Content Area */}
      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
            Organisation Management
          </h1>
          <p className="text-sm text-neutral-600 mt-1">
            Manage customer settings, team members, custom branding, storage quotas, and compliance.
          </p>
        </div>

        {/* Global Feedback Banners */}
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

        {/* Storage Quota Warning Banner */}
        {usage?.isStorageNearLimit && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-1">
            <div className="flex items-center gap-2 font-semibold">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
              Storage Quota Warning
            </div>
            <p className="text-xs text-amber-800">
              Your organisation has consumed{' '}
              <strong>{usage.storageUsagePercent}%</strong> of allocated storage. Consider cleaning up old documents or expanding storage capacity.
            </p>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-neutral-200 flex gap-2 sm:gap-6 overflow-x-auto">
          {[
            { id: 'general', label: 'General Settings' },
            { id: 'branding', label: 'Custom Branding' },
            { id: 'members', label: 'Members & Invitations' },
            { id: 'usage', label: 'Usage & Quotas' },
            { id: 'compliance', label: 'Compliance Policy' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setMessage('');
                setError('');
              }}
              className={`pb-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-[#ba0000] text-[#ba0000]'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
              data-testid={`tab-${tab.id}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        {isLoading ? (
          <div className="py-12 text-center text-neutral-500 text-sm animate-pulse">
            Loading organisation details...
          </div>
        ) : (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm">
            {/* TAB 1: GENERAL SETTINGS */}
            {activeTab === 'general' && (
              <form onSubmit={handleSaveGeneral} className="space-y-6" data-testid="general-form">
                <div>
                  <label htmlFor="orgName" className="block text-sm font-medium text-neutral-700">
                    Organisation Workspace Name
                  </label>
                  <input
                    id="orgName"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                    placeholder="Acme Legal Workspace"
                    data-testid="org-name-input"
                  />
                </div>

                <div>
                  <label htmlFor="slug" className="block text-sm font-medium text-neutral-700">
                    Tenant Slug Keyword
                  </label>
                  <input
                    id="slug"
                    type="text"
                    disabled
                    value={org?.slug ?? ''}
                    className="mt-1.5 block w-full rounded-lg border border-neutral-200 bg-neutral-100 px-3.5 py-2.5 text-sm text-neutral-500 cursor-not-allowed"
                  />
                  <p className="mt-1 text-xs text-neutral-400">
                    Tenant slug defines your isolated workspace boundary and URL identifier.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-neutral-100">
                  <div>
                    <label
                      htmlFor="sessionTimeout"
                      className="block text-sm font-medium text-neutral-700"
                    >
                      Session Timeout (Minutes)
                    </label>
                    <input
                      id="sessionTimeout"
                      type="number"
                      min={5}
                      max={1440}
                      value={sessionTimeout}
                      onChange={(e) => setSessionTimeout(Number(e.target.value))}
                      className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                      data-testid="session-timeout-input"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Inactivity threshold before user sessions automatically expire.
                    </p>
                  </div>

                  <div className="flex flex-col justify-center">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mfaRequired}
                        onChange={(e) => setMfaRequired(e.target.checked)}
                        className="h-4 w-4 rounded border-neutral-300 text-[#ba0000] focus:ring-[#ba0000]"
                        data-testid="mfa-required-checkbox"
                      />
                      <span className="text-sm font-medium text-neutral-800">
                        Enforce Mandatory MFA for All Members
                      </span>
                    </label>
                    <p className="mt-1 text-xs text-neutral-500 pl-7">
                      Require 2-factor TOTP authentication before accessing agreements.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-lg bg-[#ba0000] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] focus:outline-none focus:ring-2 focus:ring-[#ba0000] disabled:opacity-60 transition-colors"
                    data-testid="save-general-button"
                  >
                    {isSaving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: BRANDING */}
            {activeTab === 'branding' && (
              <form onSubmit={handleSaveBranding} className="space-y-6" data-testid="branding-form">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="logoUrl" className="block text-sm font-medium text-neutral-700">
                      Company Logo URL
                    </label>
                    <input
                      id="logoUrl"
                      type="url"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                      placeholder="https://company.com/logo.png"
                      data-testid="logo-url-input"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="defaultSenderName"
                      className="block text-sm font-medium text-neutral-700"
                    >
                      Default Sender Identity Name
                    </label>
                    <input
                      id="defaultSenderName"
                      type="text"
                      value={defaultSenderName}
                      onChange={(e) => setDefaultSenderName(e.target.value)}
                      className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                      placeholder="Acme Legal Team"
                      data-testid="sender-name-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label
                      htmlFor="primaryColor"
                      className="block text-sm font-medium text-neutral-700"
                    >
                      Primary Brand Color
                    </label>
                    <div className="mt-1.5 flex items-center gap-3">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-10 w-12 rounded border border-neutral-300 p-0.5 cursor-pointer"
                      />
                      <input
                        id="primaryColor"
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm uppercase shadow-sm focus:border-[#ba0000]"
                        data-testid="primary-color-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="secondaryColor"
                      className="block text-sm font-medium text-neutral-700"
                    >
                      Secondary Accent Color
                    </label>
                    <div className="mt-1.5 flex items-center gap-3">
                      <input
                        type="color"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="h-10 w-12 rounded border border-neutral-300 p-0.5 cursor-pointer"
                      />
                      <input
                        id="secondaryColor"
                        type="text"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm uppercase shadow-sm focus:border-[#ba0000]"
                        data-testid="secondary-color-input"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="companyAddress"
                    className="block text-sm font-medium text-neutral-700"
                  >
                    Company Registered Address
                  </label>
                  <textarea
                    id="companyAddress"
                    rows={2}
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                    placeholder="100 Innovation Way, Suite 400, San Francisco, CA"
                    data-testid="company-address-input"
                  />
                </div>

                <div>
                  <label
                    htmlFor="emailFooterText"
                    className="block text-sm font-medium text-neutral-700"
                  >
                    Custom Email Footer Text
                  </label>
                  <textarea
                    id="emailFooterText"
                    rows={2}
                    value={emailFooterText}
                    onChange={(e) => setEmailFooterText(e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-[#ba0000] focus:ring-2 focus:ring-[#ba0000]/20"
                    placeholder="Confidential document disclosure notice..."
                    data-testid="email-footer-input"
                  />
                </div>

                {/* Interactive Live Email Preview */}
                <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Live Email Signature Header Preview
                  </span>
                  <div
                    className="rounded-lg p-4 shadow-sm text-white"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-lg">
                        {defaultSenderName || 'Your Organisation Name'}
                      </span>
                      {logoUrl && (
                        <img
                          src={logoUrl}
                          alt="Logo Preview"
                          className="h-8 object-contain bg-white/20 p-1 rounded"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-lg bg-[#ba0000] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] focus:outline-none focus:ring-2 focus:ring-[#ba0000] disabled:opacity-60 transition-colors"
                    data-testid="save-branding-button"
                  >
                    {isSaving ? 'Saving...' : 'Save Branding Changes'}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 3: MEMBERS & INVITATIONS */}
            {activeTab === 'members' && (
              <div className="space-y-6" data-testid="members-section">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-base font-semibold text-neutral-900">Team Members</h3>
                    <p className="text-xs text-neutral-500">
                      Manage team roles and invite users to join your workspace.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="rounded-lg bg-[#ba0000] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#a00000] transition-colors"
                    data-testid="open-invite-modal-button"
                  >
                    + Invite Team Member
                  </button>
                </div>

                {/* Invitations Table */}
                <div className="overflow-x-auto rounded-xl border border-neutral-200">
                  <table className="w-full text-left text-xs text-neutral-600">
                    <thead className="bg-neutral-50 text-neutral-700 font-semibold border-b border-neutral-200">
                      <tr>
                        <th className="px-4 py-3">Invited Email</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Sent At</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {invitations.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                            No team invitations sent yet.
                          </td>
                        </tr>
                      ) : (
                        invitations.map((inv) => (
                          <tr key={inv.id} className="hover:bg-neutral-50/50">
                            <td className="px-4 py-3 font-medium text-neutral-900">{inv.email}</td>
                            <td className="px-4 py-3 uppercase text-[10px] font-bold tracking-wider text-neutral-600">
                              {inv.role}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  inv.status === 'pending'
                                    ? 'bg-amber-100 text-amber-800'
                                    : inv.status === 'accepted'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-neutral-100 text-neutral-500'
                                }`}
                              >
                                {inv.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-neutral-400">
                              {new Date(inv.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {inv.status === 'pending' && (
                                <button
                                  onClick={() => handleRevokeInvitation(inv.id)}
                                  className="text-red-600 hover:underline font-semibold"
                                  data-testid={`revoke-invitation-${inv.id}`}
                                >
                                  Revoke
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Invite Modal */}
                {showInviteModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
                      <div className="flex justify-between items-center border-b pb-3">
                        <h3 className="text-lg font-bold text-neutral-900">Invite Team Member</h3>
                        <button
                          onClick={() => setShowInviteModal(false)}
                          className="text-neutral-400 hover:text-neutral-600 text-lg font-bold"
                        >
                          ✕
                        </button>
                      </div>

                      <form onSubmit={handleSendInvitation} className="space-y-4">
                        <div>
                          <label
                            htmlFor="inviteEmail"
                            className="block text-xs font-semibold text-neutral-700"
                          >
                            Member Email Address
                          </label>
                          <input
                            id="inviteEmail"
                            type="email"
                            required
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[#ba0000]"
                            placeholder="colleague@company.com"
                            data-testid="invite-email-input"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="inviteRole"
                            className="block text-xs font-semibold text-neutral-700"
                          >
                            Assigned Workspace Role
                          </label>
                          <select
                            id="inviteRole"
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[#ba0000] bg-white"
                            data-testid="invite-role-select"
                          >
                            <option value="user">User (Standard Member)</option>
                            <option value="author">Author (Create & Send Documents)</option>
                            <option value="reviewer">Reviewer (Review Agreements)</option>
                            <option value="signer">Signer (Sign Agreements)</option>
                            <option value="org_admin">Organisation Admin</option>
                          </select>
                        </div>

                        <div className="pt-3 border-t flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setShowInviteModal(false)}
                            className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isInviting}
                            className="px-4 py-2 text-xs font-semibold text-white bg-[#ba0000] rounded-lg hover:bg-[#a00000] disabled:opacity-60"
                            data-testid="submit-invitation-button"
                          >
                            {isInviting ? 'Sending...' : 'Send Invitation'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: USAGE & QUOTAS */}
            {activeTab === 'usage' && (
              <div className="space-y-6" data-testid="usage-section">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">Resource Usage & Quotas</h3>
                  <p className="text-xs text-neutral-500">
                    Real-time metering of storage space, active envelopes, and seat allocations.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {/* Storage Quota Card */}
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-5 space-y-3">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                      Storage Quota
                    </span>
                    <div>
                      <span className="text-2xl font-bold text-neutral-900">
                        {formatBytes(usage?.storageUsedBytes)}
                      </span>
                      <span className="text-xs text-neutral-500 ml-1">
                        / {formatBytes(usage?.storageQuotaBytes)}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          (usage?.storageUsagePercent ?? 0) >= 80 ? 'bg-amber-500' : 'bg-[#ba0000]'
                        }`}
                        style={{ width: `${Math.min(usage?.storageUsagePercent ?? 0, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-neutral-600 block">
                      {usage?.storageUsagePercent}% consumed
                    </span>
                  </div>

                  {/* Documents Limit Card */}
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-5 space-y-3">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                      Agreements & Envelopes
                    </span>
                    <div>
                      <span className="text-2xl font-bold text-neutral-900">
                        {usage?.documentCount ?? 0}
                      </span>
                      <span className="text-xs text-neutral-500 ml-1">
                        / {usage?.maxDocuments ?? 0}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
                      <div
                        className="h-full bg-neutral-800 rounded-full transition-all"
                        style={{ width: `${Math.min(usage?.documentUsagePercent ?? 0, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-neutral-600 block">
                      {usage?.documentUsagePercent}% limit used
                    </span>
                  </div>

                  {/* User Seats Card */}
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-5 space-y-3">
                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                      Active Member Seats
                    </span>
                    <div>
                      <span className="text-2xl font-bold text-neutral-900">
                        {usage?.activeUsersCount ?? 0}
                      </span>
                      <span className="text-xs text-neutral-500 ml-1">
                        / {usage?.maxUsers ?? 0}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-neutral-600 block">
                      {usage?.pendingInvitationsCount ?? 0} pending invitations
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: COMPLIANCE */}
            {activeTab === 'compliance' && (
              <form onSubmit={handleSaveCompliance} className="space-y-6" data-testid="compliance-form">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">
                    Compliance & E-Signature Policy
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Configure organisation compliance standards (ESIGN, eIDAS) and verification rules.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={compliance.signatureReasonRequired}
                      onChange={(e) =>
                        setCompliance({ ...compliance, signatureReasonRequired: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-neutral-300 text-[#ba0000] focus:ring-[#ba0000]"
                      data-testid="signature-reason-checkbox"
                    />
                    <div>
                      <span className="text-sm font-medium text-neutral-800 block">
                        Require Explicit Signature Reason Statement
                      </span>
                      <span className="text-xs text-neutral-500 block">
                        Signers must select or enter a legal reason for signing (e.g. &quot;I approve this document&quot;).
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={compliance.requireReauthBeforeSigning}
                      onChange={(e) =>
                        setCompliance({
                          ...compliance,
                          requireReauthBeforeSigning: e.target.checked,
                        })
                      }
                      className="h-4 w-4 rounded border-neutral-300 text-[#ba0000] focus:ring-[#ba0000]"
                      data-testid="reauth-checkbox"
                    />
                    <div>
                      <span className="text-sm font-medium text-neutral-800 block">
                        Require Re-Authentication Prior to Signing
                      </span>
                      <span className="text-xs text-neutral-500 block">
                        Re-verify password or MFA code immediately before placing an electronic signature seal.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="pt-4 border-t border-neutral-100 grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label
                      htmlFor="retentionDays"
                      className="block text-sm font-medium text-neutral-700"
                    >
                      Document Retention Window (Days)
                    </label>
                    <input
                      id="retentionDays"
                      type="number"
                      min={1}
                      max={3650}
                      value={compliance.documentRetentionDays}
                      onChange={(e) =>
                        setCompliance({
                          ...compliance,
                          documentRetentionDays: Number(e.target.value),
                        })
                      }
                      className="mt-1.5 block w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-[#ba0000]"
                      data-testid="retention-days-input"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Days before sealed agreements are moved to secondary archival storage.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-100 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-lg bg-[#ba0000] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] focus:outline-none focus:ring-2 focus:ring-[#ba0000] disabled:opacity-60 transition-colors"
                    data-testid="save-compliance-button"
                  >
                    {isSaving ? 'Saving...' : 'Save Compliance Settings'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function OrganisationSettingsPage() {
  return (
    <SessionGuard>
      <Suspense fallback={<div className="p-8 text-center text-neutral-500">Loading page...</div>}>
        <OrganisationSettingsContent />
      </Suspense>
    </SessionGuard>
  );
}
