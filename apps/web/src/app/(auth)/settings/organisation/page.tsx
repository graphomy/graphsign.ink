'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { Footer } from '@/components/layout/Footer';
import { getApiUrl } from '@/lib/api';
import { formatDateTime } from '@/lib/date-utils';

interface OrganisationProfile {
  id: string;
  name: string;
  slug: string;
  status: string;
  planType?: string;
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

type OrgTab =
  | 'general'
  | 'branding'
  | 'notifications'
  | 'members'
  | 'teams'
  | 'roles'
  | 'domains'
  | 'audit'
  | 'usage'
  | 'compliance';

function OrganisationSettingsContent() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<OrgTab>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const validTabs: OrgTab[] = [
        'general',
        'branding',
        'notifications',
        'members',
        'teams',
        'roles',
        'domains',
        'audit',
        'usage',
        'compliance',
      ];
      if (tabParam && validTabs.includes(tabParam as OrgTab)) {
        return tabParam as OrgTab;
      }
    }
    return 'general';
  });

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

  // Notification Preferences & Triggers (INK-114)
  const [notificationSettings, setNotificationSettings] = useState<{
    sendReminders: boolean;
    reminderFrequencyDays: number;
    sendExpiryWarnings: boolean;
    sendCompletionEmails: boolean;
    customFooterText: string;
  }>({
    sendReminders: true,
    reminderFrequencyDays: 3,
    sendExpiryWarnings: true,
    sendCompletionEmails: true,
    customFooterText: '',
  });
  const [isSavingNotifications, setIsSavingNotifications] = useState<boolean>(false);

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
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditTotal, setAuditTotal] = useState<number>(0);
  const [auditTotalPages, setAuditTotalPages] = useState<number>(1);
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);

  const [complianceRetentionDays, setComplianceRetentionDays] = useState<number>(30);
  const [complianceStandards, setComplianceStandards] = useState<string[]>(['ESIGN']);
  const [requireReauth, setRequireReauth] = useState<boolean>(false);
  const [signatureReason, setSignatureReason] = useState<boolean>(false);

  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState<boolean>(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState<string>('');
  const [deleteAccountError, setDeleteAccountError] = useState<string>('');
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);

  const [userOrgs, setUserOrgs] = useState<{ id: string; name: string; role: string }[]>([]);
  const [upgradeCompanyName, setUpgradeCompanyName] = useState<string>('');
  const [isUpgrading, setIsUpgrading] = useState<boolean>(false);

  async function handleUpgradeToTeams(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setIsUpgrading(true);
    setError('');
    setMessage('');
    try {
      const token =
        localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/v1/organisations/me/upgrade-to-teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ companyName: upgradeCompanyName || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.message || 'Upgrade failed.');
      }

      if (data.token) {
        localStorage.setItem('graphsign_session_token', data.token);
        localStorage.setItem('graphsign_plan_type', 'teams');
        localStorage.setItem('graphsign_user_role', data.role || 'org_admin');
      }

      setOrg((prev) =>
        prev ? { ...prev, planType: 'teams', name: data.organisationName || prev.name } : null,
      );
      setMessage(
        '🎉 Workspace successfully upgraded to Teams Plan! Role management and collaboration features are now unlocked.',
      );
    } catch (err: unknown) {
      const errObj = err as Error;
      setError(errObj.message ?? 'Failed to upgrade workspace.');
    } finally {
      setIsUpgrading(false);
    }
  }

  // Auto-dismiss banners after timeout (UI-02)
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 8000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleTabSwitch = (tabId: typeof activeTab) => {
    setActiveTab(tabId);
    setMessage('');
    setError('');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tabId);
      window.history.replaceState({}, '', url.toString());
    }
  };

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
          resNotifs,
        ] = await Promise.all([
          fetch(`${apiUrl}/api/v1/organisations/me`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/me/branding`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/me/usage`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/me/compliance`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/invitations`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/teams`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/roles`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/domains`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/me/audit-logs?page=1&limit=10`, { headers }).catch(
            () => null,
          ),
          fetch(`${apiUrl}/api/v1/organisations/my-organisations`, { headers }).catch(() => null),
          fetch(`${apiUrl}/api/v1/organisations/me/notifications`, { headers }).catch(() => null),
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

        if (resNotifs?.ok) {
          const data = await resNotifs.json();
          setNotificationSettings({
            sendReminders: data.sendReminders ?? true,
            reminderFrequencyDays: data.reminderFrequencyDays ?? 3,
            sendExpiryWarnings: data.sendExpiryWarnings ?? true,
            sendCompletionEmails: data.sendCompletionEmails ?? true,
            customFooterText: data.customFooterText ?? '',
          });
        }

        if (resUsage?.ok) setUsage(await resUsage.json());
        if (resComp?.ok) {
          const compData = await resComp.json();
          setCompliance(compData);
          setComplianceRetentionDays(compData.documentRetentionDays ?? 30);
          setComplianceStandards(compData.allowedEsignStandards ?? ['ESIGN']);
          setRequireReauth(compData.requireReauthBeforeSigning ?? false);
          setSignatureReason(compData.signatureReasonRequired ?? false);
        }
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
          setAuditTotal(data.total ?? 0);
          setAuditPage(data.page ?? 1);
          setAuditTotalPages(data.totalPages ?? 1);
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

  // Fetch Paginated Audit Logs (10 per page)
  async function fetchAuditLogs(page: number) {
    setIsLoadingAudit(true);
    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const userId = localStorage.getItem('graphsign_user_id') ?? '';
      const apiUrl = getApiUrl();
      const res = await fetch(
        `${apiUrl}/api/v1/organisations/me/audit-logs?page=${page}&limit=10`,
        {
          headers: { Authorization: `Bearer ${token}`, 'x-user-id': userId },
        },
      );
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs ?? []);
        setAuditTotal(data.total ?? 0);
        setAuditPage(data.page ?? page);
        setAuditTotalPages(data.totalPages ?? 1);
      }
    } catch {
      setError('Failed to fetch audit logs.');
    } finally {
      setIsLoadingAudit(false);
    }
  }

  // Save Compliance Settings (Retention 1-365 days)
  async function handleSaveCompliance(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setMessage('');
    setError('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/organisations/me/compliance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          documentRetentionDays: Number(complianceRetentionDays),
          allowedEsignStandards: complianceStandards,
          requireReauthBeforeSigning: requireReauth,
          signatureReasonRequired: signatureReason,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.error?.message || data?.message || 'Failed to save compliance settings.',
        );
      }

      setMessage(data.message ?? 'Compliance settings updated successfully.');
      setCompliance((prev) => ({
        ...prev,
        documentRetentionDays: Number(complianceRetentionDays),
        allowedEsignStandards: complianceStandards,
        requireReauthBeforeSigning: requireReauth,
        signatureReasonRequired: signatureReason,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update compliance settings.';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  }

  // Permanent Account Deletion (GDPR Right to Erasure)
  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!deleteAccountPassword) return;

    setIsDeletingAccount(true);
    setDeleteAccountError('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/auth/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: deleteAccountPassword }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.error?.message ||
            data?.message ||
            'Failed to delete account. Please verify your password and try again.',
        );
      }

      localStorage.clear();
      router.push('/login?notice=account_deleted');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete account.';
      setDeleteAccountError(msg);
      setIsDeletingAccount(false);
    }
  }

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

  // Save Notification Trigger Preferences (INK-114)
  async function handleSaveNotifications(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingNotifications(true);
    setMessage('');
    setError('');

    try {
      const token = localStorage.getItem('graphsign_session_token') ?? '';
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/v1/organisations/me/notifications`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(notificationSettings),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? 'Save notification settings failed.');
      setMessage('Organisation notification trigger settings updated successfully.');
    } catch (err: unknown) {
      const errObj = err as Error;
      setError(errObj.message ?? 'Unable to save notification settings.');
    } finally {
      setIsSavingNotifications(false);
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

  // Resend Invitation
  async function handleResendInvitation(invId: string) {
    try {
      const token =
        localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/v1/organisations/invitations/${invId}/resend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMessage('Member invitation resent successfully via email.');
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? 'Failed to resend invitation.');
      }
    } catch {
      setError('Failed to resend invitation.');
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
      className="min-h-screen bg-neutral-50 flex flex-col font-sans text-neutral-900"
      data-testid="organisation-settings-container"
    >
      <HeaderNav />

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
            className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 shadow-xs"
            role="status"
            data-testid="success-message"
          >
            <span>{message}</span>
            <button
              type="button"
              onClick={() => setMessage('')}
              className="text-green-600 hover:text-green-800 font-bold ml-4 p-1 text-sm leading-none"
              aria-label="Dismiss message"
            >
              ✕
            </button>
          </div>
        )}

        {error && (
          <div
            className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-xs"
            role="alert"
            data-testid="error-message"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              className="text-red-600 hover:text-red-800 font-bold ml-4 p-1 text-sm leading-none"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-neutral-200 flex gap-2 sm:gap-6 overflow-x-auto">
          {[
            { id: 'general', label: 'General' },
            { id: 'branding', label: 'Branding' },
            { id: 'notifications', label: 'Notifications' },
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
              onClick={() => handleTabSwitch(tab.id as typeof activeTab)}
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
                {/* Plan Badge Card */}
                <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Current Workspace Plan
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-neutral-900">
                        {org?.planType === 'teams' ? 'Teams Plan' : 'Individual Workspace'}
                      </span>
                      {org?.planType === 'teams' ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-[#ba0000] border border-[#ba0000]/20">
                          🏢 Multi-user Active
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-700">
                          👤 Solo Workspace
                        </span>
                      )}
                    </div>
                  </div>
                  {org?.planType === 'individual' && (
                    <button
                      type="button"
                      onClick={() => handleUpgradeToTeams()}
                      disabled={isUpgrading}
                      className="px-4 py-2 bg-[#ba0000] text-white text-xs font-bold rounded-lg shadow-sm hover:bg-[#a00000] disabled:opacity-60 transition-colors"
                      data-testid="upgrade-general-button"
                    >
                      {isUpgrading ? 'Upgrading...' : '✨ Upgrade to Teams'}
                    </button>
                  )}
                </div>

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

            {/* NOTIFICATIONS TAB (INK-114) */}
            {activeTab === 'notifications' && (
              <form
                onSubmit={handleSaveNotifications}
                className="space-y-6"
                data-testid="notifications-section"
              >
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Automated Notification Triggers & Policies
                  </h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    Configure automated lifecycle notifications, signature reminder intervals,
                    expiration alerts, and default email footer notices across your organisation.
                  </p>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-5 shadow-xs">
                  {/* Automated Reminders Switch */}
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900">Automated Reminders</h4>
                      <p className="text-xs text-neutral-500">
                        Automatically dispatch reminder emails to pending signers based on your
                        schedule.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationSettings.sendReminders}
                        onChange={(e) =>
                          setNotificationSettings((prev) => ({
                            ...prev,
                            sendReminders: e.target.checked,
                          }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ba0000]"></div>
                    </label>
                  </div>

                  {/* Reminder Frequency */}
                  {notificationSettings.sendReminders && (
                    <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-4">
                      <div>
                        <label
                          htmlFor="reminderFrequency"
                          className="block text-xs font-semibold text-neutral-700"
                        >
                          Reminder Frequency
                        </label>
                        <p className="text-xs text-neutral-400">
                          Number of days between automated reminder notices.
                        </p>
                      </div>
                      <select
                        id="reminderFrequency"
                        value={notificationSettings.reminderFrequencyDays}
                        onChange={(e) =>
                          setNotificationSettings((prev) => ({
                            ...prev,
                            reminderFrequencyDays: Number(e.target.value),
                          }))
                        }
                        className="rounded-lg border border-neutral-300 px-3.5 py-2 text-xs font-medium bg-white text-neutral-800 focus:outline-none focus:border-[#ba0000]"
                      >
                        <option value={1}>Every 1 Day (Daily)</option>
                        <option value={2}>Every 2 Days</option>
                        <option value={3}>Every 3 Days (Recommended)</option>
                        <option value={5}>Every 5 Days</option>
                        <option value={7}>Every 7 Days (Weekly)</option>
                        <option value={14}>Every 14 Days (Bi-weekly)</option>
                      </select>
                    </div>
                  )}

                  {/* Expiration Warnings Switch */}
                  <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900">
                        24-Hour Expiration Warnings
                      </h4>
                      <p className="text-xs text-neutral-500">
                        Alert pending signers and authors 24 hours prior to document expiration.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationSettings.sendExpiryWarnings}
                        onChange={(e) =>
                          setNotificationSettings((prev) => ({
                            ...prev,
                            sendExpiryWarnings: e.target.checked,
                          }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ba0000]"></div>
                    </label>
                  </div>

                  {/* Completion Copy Switch */}
                  <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900">Completion Notices</h4>
                      <p className="text-xs text-neutral-500">
                        Send a final executed completion copy & download link to all signing
                        participants.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationSettings.sendCompletionEmails}
                        onChange={(e) =>
                          setNotificationSettings((prev) => ({
                            ...prev,
                            sendCompletionEmails: e.target.checked,
                          }))
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ba0000]"></div>
                    </label>
                  </div>

                  {/* Custom Notification Footer Text */}
                  <div className="pt-2 border-t border-neutral-100">
                    <label
                      htmlFor="customFooterText"
                      className="block text-xs font-semibold text-neutral-700"
                    >
                      Custom Notification Email Footer
                    </label>
                    <p className="text-xs text-neutral-400 mb-2">
                      Appended to all automated invitation, reminder, and completion emails
                      dispatched by this organisation.
                    </p>
                    <textarea
                      id="customFooterText"
                      rows={3}
                      value={notificationSettings.customFooterText}
                      onChange={(e) =>
                        setNotificationSettings((prev) => ({
                          ...prev,
                          customFooterText: e.target.value,
                        }))
                      }
                      placeholder="e.g., Confidential document dispatched by Acme Legal Department. For support, contact legal@acme.com."
                      className="mt-1 block w-full rounded-lg border border-neutral-300 px-3.5 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSavingNotifications}
                  className="rounded-lg bg-[#ba0000] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#a00000] disabled:opacity-50 transition"
                >
                  {isSavingNotifications ? 'Saving...' : 'Save Notification Preferences'}
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
                      data-testid="role-select-dropdown"
                    >
                      <option value="user">User</option>
                      <option value="sender">Sender / Author</option>
                      <option value="reviewer">Reviewer</option>
                      <option value="approver">Approver</option>
                      <option value="signer">Signer</option>
                      <option value="auditor">Auditor</option>
                      <option value="org_admin">Organisation Admin</option>
                      <option value="super_admin">
                        Super Admin (Restricted to kunal@graphomy.com)
                      </option>
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
                  {invitations.length > 0 ? (
                    invitations.map((inv) => (
                      <div key={inv.id} className="p-4 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-sm text-neutral-900">{inv.email}</span>
                          <p className="text-xs text-neutral-500">Role: {inv.role}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                            {inv.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleResendInvitation(inv.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded border border-neutral-300 transition-colors"
                            data-testid="reinvite-button"
                          >
                            Reinvite ✉️
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-xs text-neutral-400">
                      No invitations sent yet. Use the form above to invite team members.
                    </div>
                  )}
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
                  {teams.length > 0 ? (
                    teams.map((team) => (
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
                    ))
                  ) : (
                    <div className="p-8 text-center text-xs text-neutral-400">
                      No teams created yet. Create your first team using the form above.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CUSTOM ROLES TAB (INK-54 & INK-55) */}
            {activeTab === 'roles' && (
              <div className="space-y-8" data-testid="roles-section">
                {/* Individual Plan Upgrade Banner if on Individual */}
                {org?.planType === 'individual' && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                          Teams Feature
                        </span>
                        <h4 className="text-sm font-bold text-neutral-900 mt-1.5">
                          Role Management is available on the Teams Plan
                        </h4>
                        <p className="text-xs text-neutral-600 mt-0.5">
                          Upgrade your workspace to assign roles, delegate admin privileges, and
                          create custom permission matrices.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUpgradeToTeams()}
                        disabled={isUpgrading}
                        className="px-4 py-2 bg-[#ba0000] text-white text-xs font-bold rounded-lg shadow-sm hover:bg-[#a00000] disabled:opacity-60 transition-colors shrink-0"
                        data-testid="upgrade-roles-button"
                      >
                        {isUpgrading ? 'Upgrading...' : '✨ Upgrade to Teams'}
                      </button>
                    </div>
                  </div>
                )}

                {/* System Default Roles Overview */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">Default System Roles</h3>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Overview of built-in roles and their capabilities across the workspace.
                      </p>
                    </div>
                    <span className="text-xs text-neutral-500 font-medium bg-neutral-100 px-2.5 py-1 rounded-full">
                      7 Standard Roles
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                          <span>👑</span> Organisation Admin
                        </span>
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-red-100 text-red-800">
                          org_admin
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600">
                        Full workspace administration, member invitations, compliance settings,
                        session timeout, audit logs, and role delegation (can assign other admins).
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                          <span>✉️</span> Sender / Author
                        </span>
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                          sender
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600">
                        Can draft, create, upload, activate, and dispatch agreements for electronic
                        signature. Can also create and manage workspace templates.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                          <span>✅</span> Workflow Approver
                        </span>
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800">
                          approver
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600">
                        Authorized to review and formally approve or reject agreements during
                        multi-stage approval workflows prior to external dispatch.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                          <span>🔍</span> Document Reviewer
                        </span>
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                          reviewer
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600">
                        Can inspect draft agreements and submit feedback notes, comments, or
                        modification requests before signing.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                          <span>✍️</span> Document Signer
                        </span>
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-teal-100 text-teal-800">
                          signer
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600">
                        Dedicated participant role with access to view and execute signature,
                        initial, and date fields assigned to their account.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                          <span>📊</span> Compliance Auditor
                        </span>
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                          auditor
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600">
                        Read-only access to view immutable audit trails, completion certificates,
                        and verify ESIGN/eIDAS compliance.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-1 md:col-span-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5">
                          <span>👤</span> Standard User
                        </span>
                        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-neutral-200 text-neutral-800">
                          user
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600">
                        Base team member role with self-service agreement management and personal
                        workspace access.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2">
                    <span className="text-base shrink-0">💡</span>
                    <span>
                      <strong>Admin Delegation:</strong> Organisation Admins have full permissions
                      to assign the <code>Organisation Admin</code> (<code>org_admin</code>) role to
                      add more admins to the workspace. Super Admin is strictly reserved for
                      designated system maintainers.
                    </span>
                  </div>
                </div>

                {/* Custom Role Creation Section */}
                <div className="space-y-4 pt-4 border-t border-neutral-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-neutral-900">Custom Role Builder</h3>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Define custom roles with granular access controls for specialized team
                        workflows.
                      </p>
                    </div>
                  </div>

                  <form
                    onSubmit={handleCreateCustomRole}
                    className="rounded-xl border p-4 bg-neutral-50 space-y-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-neutral-700 mb-1">
                          Role Name
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Legal Counsel"
                          value={roleName}
                          onChange={(e) => setRoleName(e.target.value)}
                          className="w-full rounded-lg border px-3 py-1.5 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-neutral-700 mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Can review and archive agreements"
                          value={roleDesc}
                          onChange={(e) => setRoleDesc(e.target.value)}
                          className="w-full rounded-lg border px-3 py-1.5 text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-2">
                        Granted Permissions Matrix
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
                        {[
                          'document:read',
                          'document:write',
                          'document:send',
                          'document:sign',
                          'document:archive',
                          'document:delete',
                          'template:read',
                          'template:write',
                          'template:publish',
                          'template:archive',
                          'organisation:read',
                          'organisation:manage',
                          'roles:manage',
                        ].map((perm) => (
                          <label
                            key={perm}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                              selectedPerms.includes(perm)
                                ? 'bg-red-50/70 border-[#ba0000]/40 text-[#ba0000] font-semibold'
                                : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedPerms.includes(perm)}
                              onChange={(e) =>
                                e.target.checked
                                  ? setSelectedPerms([...selectedPerms, perm])
                                  : setSelectedPerms(selectedPerms.filter((p) => p !== perm))
                              }
                              className="rounded text-[#ba0000] focus:ring-[#ba0000]"
                            />
                            <span className="truncate">{perm}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#ba0000] text-white text-xs font-bold rounded-lg shadow-sm hover:bg-[#a00000] transition-colors"
                      data-testid="create-custom-role-button"
                    >
                      + Create Custom Role
                    </button>
                  </form>

                  <div className="divide-y border rounded-xl">
                    {roles.length > 0 ? (
                      roles.map((r) => (
                        <div key={r.id} className="p-4 flex justify-between items-center">
                          <div>
                            <span className="font-bold text-sm text-neutral-900">{r.name}</span>
                            <p className="text-xs text-neutral-500">
                              {r.description || 'Custom defined role'}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1 max-w-xs justify-end">
                            {r.permissions?.map((p) => (
                              <span
                                key={p}
                                className="text-[10px] font-mono bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-700 border border-neutral-200"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-xs text-neutral-400">
                        No custom roles defined yet. Use the builder above to configure tailored
                        roles.
                      </div>
                    )}
                  </div>
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
                  {domains.length > 0 ? (
                    domains.map((d) => (
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
                    ))
                  ) : (
                    <div className="p-8 text-center text-xs text-neutral-400">
                      No custom domains added yet. Add a domain above to configure custom branding.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AUDIT LOGS TAB (INK-58) */}
            {activeTab === 'audit' && (
              <div className="space-y-4" data-testid="audit-section">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase text-neutral-900">
                    Organisation Audit Logs
                  </h3>
                  <span className="text-xs text-neutral-500 font-medium">
                    Showing 10 records per page • Total {auditTotal} events
                  </span>
                </div>

                <div className="overflow-x-auto border rounded-xl bg-white shadow-xs">
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
                      {auditLogs.length > 0 ? (
                        auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-neutral-50">
                            <td className="p-3 text-neutral-500 font-medium whitespace-nowrap">
                              {formatDateTime(log.createdAt)}
                            </td>
                            <td className="p-3 font-bold text-neutral-900">{log.action}</td>
                            <td className="p-3 text-neutral-600">{log.resourceType}</td>
                            <td className="p-3 text-neutral-600">{log.user?.email || 'System'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-neutral-400">
                            {isLoadingAudit
                              ? 'Loading audit records...'
                              : 'No audit log records found.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* PAGINATION CONTROLS */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t text-xs text-neutral-600">
                  <span>
                    Showing {auditLogs.length > 0 ? (auditPage - 1) * 10 + 1 : 0} to{' '}
                    {Math.min(auditPage * 10, auditTotal)} of {auditTotal} records
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={auditPage <= 1 || isLoadingAudit}
                      onClick={() => fetchAuditLogs(auditPage - 1)}
                      className="px-3 py-1.5 border rounded-lg hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                    >
                      ← Previous
                    </button>
                    <span className="font-semibold text-neutral-800 px-1">
                      Page {auditPage} of {Math.max(1, auditTotalPages)}
                    </span>
                    <button
                      type="button"
                      disabled={auditPage >= auditTotalPages || isLoadingAudit}
                      onClick={() => fetchAuditLogs(auditPage + 1)}
                      className="px-3 py-1.5 border rounded-lg hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition-colors"
                    >
                      Next →
                    </button>
                  </div>
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
              <div className="space-y-6" data-testid="compliance-form">
                <form onSubmit={handleSaveCompliance} className="space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">
                      Compliance & Data Lifecycle Settings
                    </h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Configure legal e-signature standards and document retention policies.
                    </p>
                  </div>

                  <div className="border rounded-xl p-4 bg-neutral-50 space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-900 mb-1">
                        Document Retention Period (Days) *
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min={1}
                          max={365}
                          required
                          value={complianceRetentionDays}
                          onChange={(e) => setComplianceRetentionDays(Number(e.target.value))}
                          className="w-32 rounded-lg border px-3 py-1.5 text-xs bg-white font-medium"
                        />
                        <span className="text-xs text-neutral-500">
                          (Default: 30 days, Maximum: 365 days / 1 year)
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-1">
                        Documents will be retained for this duration before automatic compliance
                        archiving.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-900 mb-1">
                        Allowed E-Signature Standards
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs pt-1">
                        {['ESIGN', 'UETA', 'eIDAS_SES', 'eIDAS_AES', 'eIDAS_QES', 'PART_11'].map(
                          (std) => (
                            <label
                              key={std}
                              className="flex items-center gap-2 bg-white p-2 rounded-lg border cursor-pointer hover:bg-neutral-100/50"
                            >
                              <input
                                type="checkbox"
                                checked={complianceStandards.includes(std)}
                                onChange={(e) =>
                                  e.target.checked
                                    ? setComplianceStandards([...complianceStandards, std])
                                    : setComplianceStandards(
                                        complianceStandards.filter((s) => s !== std),
                                      )
                                }
                                className="rounded text-[#ba0000]"
                              />
                              <span className="font-semibold text-neutral-800">{std}</span>
                            </label>
                          ),
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t">
                      <label className="flex items-center gap-2 text-xs font-semibold text-neutral-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={requireReauth}
                          onChange={(e) => setRequireReauth(e.target.checked)}
                          className="rounded text-[#ba0000]"
                        />
                        Require re-authentication before signing documents
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-neutral-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={signatureReason}
                          onChange={(e) => setSignatureReason(e.target.checked)}
                          className="rounded text-[#ba0000]"
                        />
                        Require signer to provide signature intent / reason
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 bg-[#ba0000] text-white text-xs font-bold rounded-lg shadow-xs hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Compliance Settings'}
                  </button>
                </form>

                {/* DANGER ZONE: PERMANENT ACCOUNT DELETION */}
                <div className="border border-red-200 bg-red-50/50 rounded-xl p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-bold text-red-700 uppercase tracking-wide flex items-center gap-1.5">
                        <span>⚠️</span> Delete Account (Right to Erasure)
                      </h4>
                      <p className="text-xs text-neutral-600 mt-1">
                        Permanently delete your user account and all personal data from the
                        database. This action is irreversible. You can create a new account in the
                        future with a new email.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteAccountPassword('');
                        setDeleteAccountError('');
                        setShowDeleteAccountModal(true);
                      }}
                      className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors shrink-0 shadow-xs"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Permanent Account Deletion Modal */}
      {showDeleteAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="space-y-2">
              <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
                <span>⚠️</span> Confirm Permanent Account Deletion
              </h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                This action is <strong>permanent and cannot be undone</strong>. Your user record,
                active sessions, and access credentials will be completely deleted from the
                database.
              </p>
            </div>

            {deleteAccountError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-semibold">
                {deleteAccountError}
              </div>
            )}

            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-800 mb-1">
                  Enter your password to confirm:
                </label>
                <input
                  type="password"
                  required
                  placeholder="Your account password..."
                  value={deleteAccountPassword}
                  onChange={(e) => setDeleteAccountPassword(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-red-500 bg-white"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isDeletingAccount}
                  onClick={() => setShowDeleteAccountModal(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeletingAccount || !deleteAccountPassword}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors disabled:opacity-50"
                >
                  {isDeletingAccount ? 'Deleting Account...' : 'Permanently Delete My Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
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
