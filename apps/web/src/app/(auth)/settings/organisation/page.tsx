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
  createdAt: string;
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

interface TeamItem {
  id: string;
  name: string;
  description?: string;
  lead?: { name?: string; email: string };
  members?: { user: { id: string; name?: string; email: string } }[];
}

interface CustomRoleItem {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
}

interface DomainItem {
  id: string;
  domain: string;
  verificationToken: string;
  status: string;
  verifiedAt?: string;
}

interface AuditLogItem {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  user?: { name?: string; email: string };
  createdAt: string;
}

function OrganisationSettingsContent() {
  const [activeTab, setActiveTab] = useState<
    | 'general'
    | 'branding'
    | 'members'
    | 'teams'
    | 'roles'
    | 'domains'
    | 'audit'
    | 'usage'
    | 'compliance'
  >('general');

  // Loading & Feedback
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  // General & Branding State
  const [org, setOrg] = useState<OrganisationProfile | null>(null);
  const [name, setName] = useState<string>('');
  const [sessionTimeout, setSessionTimeout] = useState<number>(15);
  const [mfaRequired, setMfaRequired] = useState<boolean>(false);

  const [logoUrl, setLogoUrl] = useState<string>('');
  const [primaryColor, setPrimaryColor] = useState<string>('#ba0000');
  const [secondaryColor, setSecondaryColor] = useState<string>('#1e293b');
  const [companyAddress, setCompanyAddress] = useState<string>('');
  const [defaultSenderName, setDefaultSenderName] = useState<string>('');
  const [emailFooterText, setEmailFooterText] = useState<string>('');

  // Sub-story Features Data
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [compliance, setCompliance] = useState<ComplianceSettings>({
    allowedEsignStandards: ['ESIGN', 'eIDAS_SES'],
    requireReauthBeforeSigning: false,
    signatureReasonRequired: false,
    documentRetentionDays: 365,
  });

  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<string>('user');

  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [teamName, setTeamName] = useState<string>('');
  const [teamDesc, setTeamDesc] = useState<string>('');

  const [roles, setRoles] = useState<CustomRoleItem[]>([]);
  const [roleName, setRoleName] = useState<string>('');
  const [roleDesc, setRoleDesc] = useState<string>('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>(['document:read']);

  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [newDomain, setNewDomain] = useState<string>('');

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [userOrgs, setUserOrgs] = useState<{ id: string; name: string; role: string }[]>([]);

  // Fetch Organisation Data
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const token = localStorage.getItem('graphsign_session_token') ?? '';
        const userId = localStorage.getItem('graphsign_user_id') ?? '';
        const apiUrl = getApiUrl();
        const headers = { Authorization: `Bearer ${token}`, 'x-user-id': userId };

        const [
          resOrg,
          resBranding,
          resUsage,
          resComp,
          resInv,
          resTeams,
          resRoles,
          resDom,
          resAudit,
          resUserOrgs,
        ] = await Promise.all([
          fetch(`${apiUrl}/api/v1/organisations/me`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/me/branding`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/me/usage`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/me/compliance`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/invitations`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/teams`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/roles`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/domains`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/me/audit-logs`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/my-organisations`, { headers }).catch(() => null),
        ]);

        if (resOrg?.ok) {
          const data = await resOrg.json();
          setOrg(data);
          setName(data.name ?? '');
          setSessionTimeout(data.sessionTimeoutMinutes ?? 15);
          setMfaRequired(data.mfaRequired ?? false);
        }

        if (resBranding?.ok) {
          const data = await resBranding.json();
          setLogoUrl(data.logoUrl ?? '');
          setPrimaryColor(data.primaryColor ?? '#ba0000');
          setSecondaryColor(data.secondaryColor ?? '#1e293b');
          setCompanyAddress(data.companyAddress ?? '');
          setDefaultSenderName(data.defaultSenderName ?? '');
          setEmailFooterText(data.emailFooterText ?? '');
        }

        if (resUsage?.ok) setUsage(await resUsage.json());
        if (resComp?.ok) setCompliance(await resComp.json());
        if (resInv?.ok) {
          const data = await resInv.json();
          setInvitations(Array.isArray(data) ? data : []);
        }
        if (resTeams?.ok) setTeams(await resTeams.json());
        if (resRoles?.ok) setRoles(await resRoles.json());
        if (resDom?.ok) setDomains(await resDom.json());
        if (resAudit?.ok) {
          const data = await resAudit.json();
          setAuditLogs(data.logs ?? []);
        }
        if (resUserOrgs?.ok) setUserOrgs(await resUserOrgs.json());
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
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/organisations/me/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, sessionTimeoutMinutes: Number(sessionTimeout), mfaRequired }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? 'Save failed.');
      setMessage(data.message ?? 'Settings saved.');
    } catch (err: unknown) {
      const errObj = err as Error;
      setError(errObj.message ?? 'Unable to save settings.');
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
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/organisations/me/branding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          logoUrl: logoUrl || null,
          primaryColor: primaryColor || null,
          secondaryColor: secondaryColor || null,
          companyAddress: companyAddress || null,
          defaultSenderName: defaultSenderName || null,
          emailFooterText: emailFooterText || null,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? 'Save branding failed.');
      setMessage('Organisation branding saved successfully.');
    } catch (err: unknown) {
      const errObj = err as Error;
      setError(errObj.message ?? 'Unable to save branding.');
    } finally {
      setIsSaving(false);
    }
  }

  // Send Invitation (INK-56)
  async function handleInviteMember(e: React.FormEvent) {
    e.preventDefault();
    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/v1/organisations/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setInvitations([data, ...invitations]);
        setInviteEmail('');
        setMessage('Member invitation sent via email.');
      } else {
        setError(data?.error?.message ?? 'Failed to send invitation.');
      }
    } catch {
      setError('Failed to send invitation.');
    }
  }

  // Soft Delete Org (INK-51)
  async function handleDeleteOrg() {
    if (
      !confirm(
        'Are you sure you want to delete this organisation? It will be retained for 30 days before permanent deletion.',
      )
    )
      return;

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/v1/organisations/me`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setMessage('Organisation soft-deleted. Retained for 30 days.');
        setTimeout(() => (window.location.href = '/login'), 2000);
      }
    } catch {
      setError('Failed to delete organisation.');
    }
  }

  // Create Team (INK-52)
  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/v1/organisations/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: teamName, description: teamDesc }),
      });
      const data = await res.json();
      if (res.ok) {
        setTeams([...teams, data]);
        setTeamName('');
        setTeamDesc('');
        setMessage('Team created successfully.');
      } else {
        setError(data?.error?.message ?? 'Failed to create team.');
      }
    } catch {
      setError('Failed to create team.');
    }
  }

  // Create Custom Role (INK-55)
  async function handleCreateCustomRole(e: React.FormEvent) {
    e.preventDefault();
    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/v1/organisations/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: roleName, description: roleDesc, permissions: selectedPerms }),
      });
      const data = await res.json();
      if (res.ok) {
        setRoles([...roles, data]);
        setRoleName('');
        setRoleDesc('');
        setMessage('Custom role created successfully.');
      } else {
        setError(data?.error?.message ?? 'Failed to create role.');
      }
    } catch {
      setError('Failed to create custom role.');
    }
  }

  // Add Domain (INK-60)
  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/v1/organisations/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ domain: newDomain }),
      });
      const data = await res.json();
      if (res.ok) {
        setDomains([data, ...domains]);
        setNewDomain('');
        setMessage('Domain added. Please add the DNS TXT record to verify.');
      } else {
        setError(data?.error?.message ?? 'Failed to add domain.');
      }
    } catch {
      setError('Failed to add domain.');
    }
  }

  // Switch Org (INK-59)
  async function handleSwitchOrg(targetOrgId: string) {
    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/v1/organisations/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetOrganisationId: targetOrgId }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('graphsign_session_token', data.token);
        setMessage(data.message);
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch {
      setError('Failed to switch organisation.');
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

          {/* Org Switcher Dropdown (INK-59) */}
          {userOrgs.length > 1 && (
            <select
              value={org?.id ?? ''}
              onChange={(e) => handleSwitchOrg(e.target.value)}
              className="text-xs font-bold text-neutral-700 border border-neutral-300 rounded-lg px-2.5 py-1 bg-white focus:border-[#ba0000]"
              data-testid="org-switcher"
            >
              {userOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  Switch to: {o.name}
                </option>
              ))}
            </select>
          )}

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
            Manage workspace settings, teams, roles, domains, quotas, branding, and audit logs.
          </p>
        </div>

        {/* Global Banners */}
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

        {/* Tab Navigation */}
        <div className="border-b border-neutral-200 flex gap-2 sm:gap-6 overflow-x-auto">
          {[
            { id: 'general', label: 'General' },
            { id: 'branding', label: 'Branding' },
            { id: 'members', label: 'Members' },
            { id: 'teams', label: 'Teams' },
            { id: 'roles', label: 'Custom Roles' },
            { id: 'domains', label: 'Domains' },
            { id: 'audit', label: 'Audit Logs' },
            { id: 'usage', label: 'Usage & Quotas' },
            { id: 'compliance', label: 'Compliance' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as typeof activeTab);
                setMessage('');
                setError('');
              }}
              className={`pb-3 text-xs font-bold border-b-2 whitespace-nowrap uppercase tracking-wider transition-colors ${
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
            {/* GENERAL TAB */}
            {activeTab === 'general' && (
              <form onSubmit={handleSaveGeneral} className="space-y-6" data-testid="general-form">
                <div>
                  <label htmlFor="orgName" className="block text-xs font-semibold text-neutral-700">
                    Workspace Name
                  </label>
                  <input
                    id="orgName"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm shadow-sm focus:border-[#ba0000]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="sessionTimeout"
                    className="block text-xs font-semibold text-neutral-700"
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
                    className="mt-1 block w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm shadow-sm focus:border-[#ba0000]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="mfaRequired"
                    type="checkbox"
                    checked={mfaRequired}
                    onChange={(e) => setMfaRequired(e.target.checked)}
                    className="rounded border-neutral-300 text-[#ba0000]"
                  />
                  <label htmlFor="mfaRequired" className="text-xs font-semibold text-neutral-700">
                    Require MFA for all organisation members
                  </label>
                </div>

                <div className="pt-4 border-t flex justify-between items-center">
                  <button
                    type="button"
                    onClick={handleDeleteOrg}
                    className="px-4 py-2 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                  >
                    Delete Organisation (30-day Soft Delete)
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-lg bg-[#ba0000] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#a00000]"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            )}

            {/* BRANDING TAB (INK-57) */}
            {activeTab === 'branding' && (
              <form onSubmit={handleSaveBranding} className="space-y-6" data-testid="branding-form">
                <div>
                  <label htmlFor="logoUrl" className="block text-xs font-semibold text-neutral-700">
                    Logo Image URL
                  </label>
                  <input
                    id="logoUrl"
                    type="url"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm"
                    placeholder="https://acme.com/logo.png"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="primaryColor"
                      className="block text-xs font-semibold text-neutral-700"
                    >
                      Primary Accent Color
                    </label>
                    <input
                      id="primaryColor"
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border cursor-pointer p-1"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="secondaryColor"
                      className="block text-xs font-semibold text-neutral-700"
                    >
                      Secondary Color
                    </label>
                    <input
                      id="secondaryColor"
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="mt-1 h-10 w-full rounded-lg border cursor-pointer p-1"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="senderName"
                    className="block text-xs font-semibold text-neutral-700"
                  >
                    Default Email Sender Name
                  </label>
                  <input
                    id="senderName"
                    type="text"
                    value={defaultSenderName}
                    onChange={(e) => setDefaultSenderName(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="companyAddress"
                    className="block text-xs font-semibold text-neutral-700"
                  >
                    Company Address
                  </label>
                  <input
                    id="companyAddress"
                    type="text"
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="emailFooter"
                    className="block text-xs font-semibold text-neutral-700"
                  >
                    Email Footer Text
                  </label>
                  <textarea
                    id="emailFooter"
                    rows={2}
                    value={emailFooterText}
                    onChange={(e) => setEmailFooterText(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-[#ba0000] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#a00000]"
                >
                  Save Branding
                </button>
              </form>
            )}

            {/* MEMBERS TAB (INK-56) */}
            {activeTab === 'members' && (
              <div className="space-y-6" data-testid="members-section">
                <form
                  onSubmit={handleInviteMember}
                  className="rounded-xl border p-4 bg-neutral-50 space-y-3"
                >
                  <h4 className="text-xs font-bold text-neutral-900 uppercase">
                    Invite Workspace Member
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="email"
                      required
                      placeholder="user@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="rounded-lg border px-3 py-1.5 text-xs bg-white col-span-2"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="rounded-lg border px-3 py-1.5 text-xs bg-white"
                    >
                      <option value="user">User</option>
                      <option value="author">Author</option>
                      <option value="reviewer">Reviewer</option>
                      <option value="signer">Signer</option>
                      <option value="org_admin">Org Admin</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-[#ba0000] text-white text-xs font-bold rounded-lg"
                  >
                    Send Email Invitation
                  </button>
                </form>

                <div className="divide-y border rounded-xl">
                  {invitations.map((inv) => (
                    <div key={inv.id} className="p-4 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-sm text-neutral-900">{inv.email}</span>
                        <p className="text-xs text-neutral-500">Role: {inv.role}</p>
                      </div>
                      <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                        {inv.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TEAMS TAB (INK-52 & INK-53) */}
            {activeTab === 'teams' && (
              <div className="space-y-6" data-testid="teams-section">
                <form
                  onSubmit={handleCreateTeam}
                  className="rounded-xl border p-4 bg-neutral-50 space-y-3"
                >
                  <h4 className="text-xs font-bold text-neutral-900 uppercase">Create New Team</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="Team Name (e.g. Finance)"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      className="rounded-lg border px-3 py-1.5 text-xs bg-white"
                    />
                    <input
                      type="text"
                      placeholder="Description"
                      value={teamDesc}
                      onChange={(e) => setTeamDesc(e.target.value)}
                      className="rounded-lg border px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-[#ba0000] text-white text-xs font-bold rounded-lg"
                  >
                    + Create Team
                  </button>
                </form>

                <div className="divide-y border rounded-xl">
                  {teams.map((team) => (
                    <div key={team.id} className="p-4 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-sm text-neutral-900">{team.name}</span>
                        <p className="text-xs text-neutral-500">
                          {team.description || 'No description'}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-neutral-600 bg-neutral-100 px-2.5 py-1 rounded-full">
                        {team.members?.length || 0} Members
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CUSTOM ROLES TAB (INK-54 & INK-55) */}
            {activeTab === 'roles' && (
              <div className="space-y-6" data-testid="roles-section">
                <form
                  onSubmit={handleCreateCustomRole}
                  className="rounded-xl border p-4 bg-neutral-50 space-y-3"
                >
                  <h4 className="text-xs font-bold text-neutral-900 uppercase">
                    Create Custom Role
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="Role Name (e.g. Template Editor)"
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                      className="rounded-lg border px-3 py-1.5 text-xs bg-white"
                    />
                    <input
                      type="text"
                      placeholder="Description"
                      value={roleDesc}
                      onChange={(e) => setRoleDesc(e.target.value)}
                      className="rounded-lg border px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <div className="flex gap-4 text-xs">
                    {['document:read', 'document:write', 'template:read', 'template:write'].map(
                      (perm) => (
                        <label key={perm} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={selectedPerms.includes(perm)}
                            onChange={(e) =>
                              e.target.checked
                                ? setSelectedPerms([...selectedPerms, perm])
                                : setSelectedPerms(selectedPerms.filter((p) => p !== perm))
                            }
                          />
                          {perm}
                        </label>
                      ),
                    )}
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-[#ba0000] text-white text-xs font-bold rounded-lg"
                  >
                    + Create Custom Role
                  </button>
                </form>

                <div className="divide-y border rounded-xl">
                  {roles.map((r) => (
                    <div key={r.id} className="p-4 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-sm text-neutral-900">{r.name}</span>
                        <p className="text-xs text-neutral-500">{r.description}</p>
                      </div>
                      <span className="text-xs font-mono bg-neutral-100 px-2 py-0.5 rounded text-neutral-600">
                        {r.permissions?.length || 0} permissions
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DOMAINS TAB (INK-60) */}
            {activeTab === 'domains' && (
              <div className="space-y-6" data-testid="domains-section">
                <form
                  onSubmit={handleAddDomain}
                  className="rounded-xl border p-4 bg-neutral-50 space-y-3"
                >
                  <h4 className="text-xs font-bold text-neutral-900 uppercase">
                    Add Custom Domain
                  </h4>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      required
                      placeholder="mycompany.graphomy.com"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      className="flex-1 rounded-lg border px-3 py-1.5 text-xs bg-white"
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-[#ba0000] text-white text-xs font-bold rounded-lg"
                    >
                      Add Domain
                    </button>
                  </div>
                </form>

                <div className="divide-y border rounded-xl">
                  {domains.map((d) => (
                    <div key={d.id} className="p-4 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-sm text-neutral-900">{d.domain}</span>
                        <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                          {d.status}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-neutral-500">
                        DNS TXT:{' '}
                        <code className="bg-neutral-100 px-1 rounded">{d.verificationToken}</code>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AUDIT LOGS TAB (INK-58) */}
            {activeTab === 'audit' && (
              <div className="space-y-4" data-testid="audit-section">
                <h3 className="text-xs font-bold uppercase text-neutral-900">
                  Organisation Audit Logs
                </h3>
                <div className="overflow-x-auto border rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-50 border-b font-bold text-neutral-700">
                      <tr>
                        <th className="p-3">Timestamp</th>
                        <th className="p-3">Action</th>
                        <th className="p-3">Resource</th>
                        <th className="p-3">Actor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-neutral-50">
                          <td className="p-3 text-neutral-500">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="p-3 font-bold text-neutral-900">{log.action}</td>
                          <td className="p-3 text-neutral-600">{log.resourceType}</td>
                          <td className="p-3 text-neutral-600">{log.user?.email || 'System'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* USAGE TAB */}
            {activeTab === 'usage' && (
              <div className="space-y-4" data-testid="usage-section">
                <h3 className="text-xs font-bold uppercase text-neutral-900">Usage & Quotas</h3>
                <p className="text-xs text-neutral-500">
                  Storage quota: {formatBytes(usage?.storageUsedBytes)} /{' '}
                  {formatBytes(usage?.storageQuotaBytes)}
                </p>
              </div>
            )}

            {/* COMPLIANCE TAB */}
            {activeTab === 'compliance' && (
              <div className="space-y-4" data-testid="compliance-form">
                <h3 className="text-xs font-bold uppercase text-neutral-900">
                  Compliance Settings
                </h3>
                <p className="text-xs text-neutral-500">
                  Standards: {compliance.allowedEsignStandards?.join(', ') || 'ESIGN'} | Retention:{' '}
                  {compliance.documentRetentionDays} days
                </p>
              </div>
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
