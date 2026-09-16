'use client';

import { useState, useEffect } from 'react';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { Footer } from '@/components/layout/Footer';
import { getApiUrl } from '@/lib/api';
import { formatDateTime } from '@/lib/date-utils';

type AdminTab = 'overview' | 'tenants' | 'maintenance' | 'flags' | 'limits' | 'users' | 'audit';

interface HealthData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: {
    status: 'connected' | 'disconnected';
    latencyMs: number;
    error?: string;
  };
  uptimeSeconds: number;
  memory: {
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
  };
  timestamp: string;
}

interface StatsData {
  totalUsers: number;
  totalOrgs: number;
  totalAgreements: number;
  totalStorageUsedBytes: string;
}

interface OrganisationItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  planType: string;
  storageQuotaBytes: string;
  storageUsedBytes: string;
  maxDocuments: number;
  documentCount: number;
  maxUsers: number;
  activeUsersCount: number;
  totalAgreements: number;
  sessionTimeoutMinutes: number;
  mfaRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MaintenanceState {
  isActive: boolean;
  message: string;
  scope: 'platform' | 'tenant';
  targetTenantId?: string | null;
  activatedBy?: string | null;
  activatedAt?: string | null;
  deactivatedAt?: string | null;
}

interface FeatureFlagItem {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isEnabled: boolean;
  tenantOverrides: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

interface ConfigItem {
  key: string;
  value: string;
  defaultValue: string;
  label: string;
  description: string;
}

interface UserItem {
  id: string;
  email: string;
  name?: string;
  role: string;
  status: string;
  organisation?: { id: string; name: string; slug: string };
  lastLoginAt?: string | null;
  createdAt: string;
  storageQuotaBytes: string;
  storageUsedBytes: string;
  agreementsSummary: {
    draft: number;
    active: number;
    archive: number;
    total: number;
  };
}

interface AuditLogItem {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  userId: string;
  user?: { email: string; name?: string | null };
  organisationId: string;
  organisation?: { name: string; slug: string };
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

function formatBytes(bytesStr?: string | number): string {
  if (!bytesStr) return '0 B';
  const bytes = typeof bytesStr === 'string' ? parseInt(bytesStr, 10) : bytesStr;
  if (isNaN(bytes) || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'Never';
  const formatted = formatDateTime(dateStr);
  return formatted || 'Invalid Date';
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Overview & Health
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [refreshingHealth, setRefreshingHealth] = useState(false);

  // Tenants
  const [organisations, setOrganisations] = useState<OrganisationItem[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [orgPage, setOrgPage] = useState(1);
  const [orgTotalPages, setOrgTotalPages] = useState(1);
  const [orgTotalCount, setOrgTotalCount] = useState(0);

  // Tenant Override / Suspend Modals
  const [selectedOrg, setSelectedOrg] = useState<OrganisationItem | null>(null);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideUsers, setOverrideUsers] = useState<number>(50);
  const [overrideDocs, setOverrideDocs] = useState<number>(100);
  const [overrideStorageMb, setOverrideStorageMb] = useState<number>(500);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [submittingOverride, setSubmittingOverride] = useState(false);

  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [submittingSuspend, setSubmittingSuspend] = useState(false);

  // Maintenance Mode
  const [maintenance, setMaintenance] = useState<MaintenanceState>({
    isActive: false,
    message: '',
    scope: 'platform',
  });
  const [maintenanceInputMessage, setMaintenanceInputMessage] = useState('');
  const [maintenanceScope, setMaintenanceScope] = useState<'platform' | 'tenant'>('platform');
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  // Feature Flags
  const [flags, setFlags] = useState<FeatureFlagItem[]>([]);
  const [loadingFlags, setLoadingFlags] = useState(false);
  const [newFlagKey, setNewFlagKey] = useState('');
  const [newFlagName, setNewFlagName] = useState('');
  const [newFlagDesc, setNewFlagDesc] = useState('');
  const [newFlagEnabled, setNewFlagEnabled] = useState(false);
  const [createFlagModalOpen, setCreateFlagModalOpen] = useState(false);
  const [submittingFlag, setSubmittingFlag] = useState(false);

  // Global Platform Configs
  const [configs, setConfigs] = useState<Record<string, ConfigItem>>({});
  const [editingConfigs, setEditingConfigs] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Users Directory
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [userTotalPages, setUserTotalPages] = useState(1);
  const [totalUsersCount, setTotalUsersCount] = useState(0);

  // Platform Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);

  // Notifications
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initial Load
  useEffect(() => {
    fetchHealth();
    fetchStats();
    fetchMaintenance();
  }, []);

  useEffect(() => {
    if (activeTab === 'tenants') {
      fetchOrganisations(orgPage, orgSearch);
    } else if (activeTab === 'flags') {
      fetchFeatureFlags();
    } else if (activeTab === 'limits') {
      fetchConfigs();
    } else if (activeTab === 'users') {
      fetchUsers(userPage, userSearch);
    } else if (activeTab === 'audit') {
      fetchAuditLogs(auditPage);
    }
  }, [activeTab, orgPage, orgSearch, userPage, userSearch, auditPage]);

  async function fetchHealth() {
    setRefreshingHealth(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/admin/health`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (err) {
      console.error('Failed to fetch platform health:', err);
    } finally {
      setRefreshingHealth(false);
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/admin/stats`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  async function fetchMaintenance() {
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/admin/maintenance`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMaintenance(data);
        setMaintenanceInputMessage(data.message || '');
        setMaintenanceScope(data.scope || 'platform');
      }
    } catch (err) {
      console.error('Failed to load maintenance status:', err);
    }
  }

  async function handleToggleMaintenance(nextActive: boolean) {
    setSavingMaintenance(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/admin/maintenance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          isActive: nextActive,
          message:
            maintenanceInputMessage || 'System maintenance in progress. Please check back shortly.',
          scope: maintenanceScope,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMaintenance(data);
        setMessage(
          nextActive
            ? 'Platform maintenance mode ACTIVATED. Non-superadmin writes are blocked.'
            : 'Platform maintenance mode DEACTIVATED. System operational.',
        );
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error?.message || 'Failed to update maintenance mode.');
      }
    } catch {
      setError('Network error while updating maintenance mode.');
    } finally {
      setSavingMaintenance(false);
    }
  }

  async function fetchOrganisations(pageNum: number, search: string) {
    setLoadingOrgs(true);
    try {
      let url = `${getApiUrl()}/api/v1/admin/organisations?page=${pageNum}&limit=10`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOrganisations(data.items || []);
        setOrgTotalPages(data.pagination?.totalPages || 1);
        setOrgTotalCount(data.pagination?.total || 0);
      }
    } catch (err) {
      console.error('Failed to load organisations:', err);
    } finally {
      setLoadingOrgs(false);
    }
  }

  async function handleSaveOverride() {
    if (!selectedOrg) return;
    setSubmittingOverride(true);
    setMessage(null);
    setError(null);
    try {
      const storageBytes = (BigInt(overrideStorageMb) * BigInt(1024 * 1024)).toString();
      const res = await fetch(
        `${getApiUrl()}/api/v1/admin/organisations/${selectedOrg.id}/override`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            maxUsers: overrideUsers,
            maxDocuments: overrideDocs,
            storageQuotaBytes: storageBytes,
            reason: overrideReason || 'Super admin custom limit adjustment',
          }),
        },
      );

      if (res.ok) {
        setMessage(`Custom limits for '${selectedOrg.name}' applied successfully.`);
        setOverrideModalOpen(false);
        fetchOrganisations(orgPage, orgSearch);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message || 'Failed to update tenant limits.');
      }
    } catch {
      setError('Network error while updating limits.');
    } finally {
      setSubmittingOverride(false);
    }
  }

  async function handleToggleSuspend() {
    if (!selectedOrg) return;
    const isCurrentlySuspended = selectedOrg.status === 'suspended';
    const endpoint = isCurrentlySuspended ? 'restore' : 'suspend';

    setSubmittingSuspend(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `${getApiUrl()}/api/v1/admin/organisations/${selectedOrg.id}/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            reason: suspendReason || 'Super admin action',
          }),
        },
      );

      if (res.ok) {
        setMessage(
          isCurrentlySuspended
            ? `Tenant '${selectedOrg.name}' restored to active status.`
            : `Tenant '${selectedOrg.name}' suspended.`,
        );
        setSuspendModalOpen(false);
        fetchOrganisations(orgPage, orgSearch);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message || `Failed to ${endpoint} tenant.`);
      }
    } catch {
      setError(`Network error while trying to ${endpoint} tenant.`);
    } finally {
      setSubmittingSuspend(false);
    }
  }

  async function fetchFeatureFlags() {
    setLoadingFlags(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/admin/feature-flags`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFlags(data.flags || []);
      }
    } catch (err) {
      console.error('Failed to load feature flags:', err);
    } finally {
      setLoadingFlags(false);
    }
  }

  async function handleCreateFeatureFlag() {
    if (!newFlagKey.trim() || !newFlagName.trim()) return;
    setSubmittingFlag(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/admin/feature-flags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          key: newFlagKey.trim(),
          name: newFlagName.trim(),
          description: newFlagDesc.trim() || undefined,
          isEnabled: newFlagEnabled,
        }),
      });

      if (res.ok) {
        setMessage(`Feature flag '${newFlagKey}' created successfully.`);
        setCreateFlagModalOpen(false);
        setNewFlagKey('');
        setNewFlagName('');
        setNewFlagDesc('');
        setNewFlagEnabled(false);
        fetchFeatureFlags();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message || 'Failed to create feature flag.');
      }
    } catch {
      setError('Network error while creating feature flag.');
    } finally {
      setSubmittingFlag(false);
    }
  }

  async function handleToggleFlag(key: string, currentEnabled: boolean) {
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `${getApiUrl()}/api/v1/admin/feature-flags/${encodeURIComponent(key)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ isEnabled: !currentEnabled }),
        },
      );

      if (res.ok) {
        setMessage(`Feature flag '${key}' updated to ${!currentEnabled ? 'ENABLED' : 'DISABLED'}.`);
        fetchFeatureFlags();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message || 'Failed to update feature flag.');
      }
    } catch {
      setError('Network error updating flag.');
    }
  }

  async function handleDeleteFlag(key: string) {
    if (!confirm(`Are you sure you want to delete feature flag '${key}'?`)) return;
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `${getApiUrl()}/api/v1/admin/feature-flags/${encodeURIComponent(key)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );

      if (res.ok) {
        setMessage(`Feature flag '${key}' deleted.`);
        fetchFeatureFlags();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message || 'Failed to delete feature flag.');
      }
    } catch {
      setError('Network error deleting flag.');
    }
  }

  async function fetchConfigs() {
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/admin/platform-config`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConfigs(data);
        const editMap: Record<string, string> = {};
        for (const [key, item] of Object.entries(data as Record<string, ConfigItem>)) {
          editMap[key] = item.value;
        }
        setEditingConfigs(editMap);
      }
    } catch (err) {
      console.error('Failed to load configs:', err);
    }
  }

  async function handleSaveConfig(key: string) {
    setSavingKey(key);
    setMessage(null);
    setError(null);
    try {
      const val = editingConfigs[key];
      const res = await fetch(
        `${getApiUrl()}/api/v1/admin/platform-config/${encodeURIComponent(key)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ value: val }),
        },
      );

      if (res.ok) {
        setMessage(`Limit for '${key}' updated successfully.`);
        fetchConfigs();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message || data.message || 'Failed to update configuration limit.');
      }
    } catch {
      setError('Network error while saving configuration limit.');
    } finally {
      setSavingKey(null);
    }
  }

  async function fetchUsers(pageNum: number, search: string) {
    setLoadingUsers(true);
    try {
      let url = `${getApiUrl()}/api/v1/admin/users?page=${pageNum}&limit=10`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.items || []);
        setUserTotalPages(data.pagination?.totalPages || 1);
        setTotalUsersCount(data.pagination?.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function fetchAuditLogs(pageNum: number) {
    setLoadingAuditLogs(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/admin/audit-logs?page=${pageNum}&limit=15`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.items || []);
        setAuditTotalPages(data.pagination?.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoadingAuditLogs(false);
    }
  }

  return (
    <SessionGuard>
      <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-900 font-sans">
        <HeaderNav />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-black text-neutral-900 tracking-tight">
                  Super Admin Control Plane
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-100 text-[#ba0000] border border-red-200">
                  Super Admin
                </span>
                {maintenance.isActive && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                    Maintenance Active
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-600 mt-1">
                Centralized platform governance: tenants directory, operational health, feature
                flags, maintenance controls, and privileged audit logs.
              </p>
            </div>

            {/* Quick Health Indicator Pill */}
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold shadow-sm ${
                  health?.status === 'healthy'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : health?.status === 'degraded'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    health?.status === 'healthy' ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'
                  }`}
                />
                <span>
                  {health?.status ? health.status.toUpperCase() : 'CHECKING'}
                  {health?.database.latencyMs !== undefined && ` (${health.database.latencyMs}ms)`}
                </span>
              </div>

              <button
                onClick={fetchHealth}
                disabled={refreshingHealth}
                className="p-1.5 text-neutral-500 hover:text-neutral-900 border border-neutral-200 rounded-lg hover:bg-neutral-100 transition-all text-xs"
                title="Refresh platform telemetry"
              >
                {refreshingHealth ? '⏳' : '🔄'}
              </button>
            </div>
          </div>

          {/* Feedback Messages */}
          {message && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center justify-between">
              <span>✓ {message}</span>
              <button
                onClick={() => setMessage(null)}
                className="text-emerald-600 hover:text-emerald-900"
              >
                ✕
              </button>
            </div>
          )}

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 text-xs font-semibold rounded-xl flex items-center justify-between">
              <span>⚠️ {error}</span>
              <button onClick={() => setError(null)} className="text-red-600 hover:text-red-900">
                ✕
              </button>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 border-b border-neutral-200 overflow-x-auto pb-px">
            {[
              { id: 'overview', label: 'Overview & Health' },
              { id: 'tenants', label: 'Tenants Directory' },
              { id: 'maintenance', label: 'Maintenance Mode' },
              { id: 'flags', label: 'Feature Flags' },
              { id: 'limits', label: 'Platform Limits' },
              { id: 'users', label: 'Users Directory' },
              { id: 'audit', label: 'Audit Logs' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as AdminTab)}
                className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all whitespace-nowrap border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'border-[#ba0000] text-[#ba0000] bg-white shadow-sm'
                    : 'border-transparent text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: OVERVIEW & OPERATIONAL HEALTH */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Platform Tenants
                  </span>
                  <div className="text-2xl font-black text-neutral-900 mt-1">
                    {stats?.totalOrgs ?? '—'}
                  </div>
                  <span className="text-[10px] text-neutral-400 font-medium mt-1 block">
                    Active workspaces
                  </span>
                </div>

                <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Total Registered Users
                  </span>
                  <div className="text-2xl font-black text-neutral-900 mt-1">
                    {stats?.totalUsers ?? '—'}
                  </div>
                  <span className="text-[10px] text-neutral-400 font-medium mt-1 block">
                    Across all organisations
                  </span>
                </div>

                <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Total Agreements
                  </span>
                  <div className="text-2xl font-black text-neutral-900 mt-1">
                    {stats?.totalAgreements ?? '—'}
                  </div>
                  <span className="text-[10px] text-neutral-400 font-medium mt-1 block">
                    Draft, active & sealed
                  </span>
                </div>

                <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                  <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                    Platform Storage Used
                  </span>
                  <div className="text-2xl font-black text-[#ba0000] mt-1">
                    {formatBytes(stats?.totalStorageUsedBytes)}
                  </div>
                  <span className="text-[10px] text-neutral-400 font-medium mt-1 block">
                    Total document payload
                  </span>
                </div>
              </div>

              {/* Health & Runtime Diagnostics Panel */}
              <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-neutral-900">
                      Platform Runtime Telemetry & Diagnostics
                    </h2>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Operational health status of core microservices, database connectivity, and
                      runtime metrics.
                    </p>
                  </div>
                  <span className="text-[11px] text-neutral-400 font-mono">
                    Last ping: {health?.timestamp ? formatDate(health.timestamp) : '—'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="p-4 border border-neutral-200 rounded-xl bg-neutral-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-800">
                        Database (Postgres)
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          health?.database.status === 'connected'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {health?.database.status || 'Checking'}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-600 font-mono">
                      Latency:{' '}
                      <span className="font-bold">{health?.database.latencyMs ?? '—'} ms</span>
                    </div>
                    {health?.database.error && (
                      <div className="text-[10px] text-red-600">{health.database.error}</div>
                    )}
                  </div>

                  <div className="p-4 border border-neutral-200 rounded-xl bg-neutral-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-800">Process Uptime</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800">
                        ONLINE
                      </span>
                    </div>
                    <div className="text-xs text-neutral-600 font-mono">
                      Uptime:{' '}
                      <span className="font-bold">
                        {health ? formatDuration(health.uptimeSeconds) : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 border border-neutral-200 rounded-xl bg-neutral-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-800">Memory Utilization</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-neutral-200 text-neutral-800">
                        V8 HEAP
                      </span>
                    </div>
                    <div className="text-xs text-neutral-600 font-mono">
                      RSS: <span className="font-bold">{formatBytes(health?.memory.rssBytes)}</span>{' '}
                      | Heap:{' '}
                      <span className="font-bold">{formatBytes(health?.memory.heapUsedBytes)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TENANTS DIRECTORY */}
          {activeTab === 'tenants' && (
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-neutral-900">
                    Workspace Tenants Directory
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Manage tenant workspaces, override user/storage quotas, or suspend non-compliant
                    tenants.
                  </p>
                </div>

                <input
                  type="text"
                  placeholder="Search tenant name or slug..."
                  value={orgSearch}
                  onChange={(e) => {
                    setOrgSearch(e.target.value);
                    setOrgPage(1);
                  }}
                  className="bg-neutral-50 border border-neutral-300 rounded-lg px-3.5 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000] w-full sm:w-64"
                />
              </div>

              {loadingOrgs ? (
                <div className="text-center py-12 text-xs text-neutral-500 font-medium">
                  Loading organisations...
                </div>
              ) : organisations.length === 0 ? (
                <div className="text-center py-12 text-xs text-neutral-500 font-medium border border-dashed rounded-xl">
                  No organisations found.
                </div>
              ) : (
                <div className="overflow-x-auto border border-neutral-200 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                        <th className="py-3 px-4">Organisation</th>
                        <th className="py-3 px-4">Plan & Status</th>
                        <th className="py-3 px-4">Users</th>
                        <th className="py-3 px-4">Documents</th>
                        <th className="py-3 px-4">Storage Used</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 text-xs">
                      {organisations.map((org) => {
                        const isSuspended = org.status === 'suspended';
                        return (
                          <tr key={org.id} className="hover:bg-neutral-50/80 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-bold text-neutral-900">{org.name}</div>
                              <div className="text-[11px] text-neutral-500 font-mono">
                                slug: {org.slug} | id: {org.id.slice(0, 8)}...
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-700 uppercase border">
                                  {org.planType}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                    isSuspended
                                      ? 'bg-red-100 text-red-800 border-red-200'
                                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  }`}
                                >
                                  {org.status}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-neutral-700">
                              {org.activeUsersCount} / {org.maxUsers}
                            </td>
                            <td className="py-3 px-4 font-mono text-neutral-700">
                              {org.documentCount} / {org.maxDocuments}
                            </td>
                            <td className="py-3 px-4 font-mono text-neutral-700">
                              {formatBytes(org.storageUsedBytes)} /{' '}
                              {formatBytes(org.storageQuotaBytes)}
                            </td>
                            <td className="py-3 px-4 text-right space-x-2">
                              <button
                                onClick={() => {
                                  setSelectedOrg(org);
                                  setOverrideUsers(org.maxUsers);
                                  setOverrideDocs(org.maxDocuments);
                                  setOverrideStorageMb(
                                    Math.round(
                                      parseInt(org.storageQuotaBytes || '0', 10) / (1024 * 1024),
                                    ),
                                  );
                                  setOverrideReason('');
                                  setOverrideModalOpen(true);
                                }}
                                className="px-2.5 py-1 text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-lg border border-neutral-300"
                              >
                                Override Limits
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedOrg(org);
                                  setSuspendReason('');
                                  setSuspendModalOpen(true);
                                }}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border ${
                                  isSuspended
                                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : 'bg-red-50 hover:bg-red-100 text-red-800 border-red-300'
                                }`}
                              >
                                {isSuspended ? 'Restore' : 'Suspend'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {orgTotalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-neutral-500">
                    Page {orgPage} of {orgTotalPages} ({orgTotalCount} total)
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={orgPage === 1}
                      onClick={() => setOrgPage(orgPage - 1)}
                      className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold hover:bg-neutral-100 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      disabled={orgPage === orgTotalPages}
                      onClick={() => setOrgPage(orgPage + 1)}
                      className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold hover:bg-neutral-100 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MAINTENANCE MODE */}
          {activeTab === 'maintenance' && (
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-base font-bold text-neutral-900">
                  Platform Maintenance Mode Control
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  When active, state-mutating requests (POST, PATCH, DELETE) return HTTP 503
                  Maintenance Mode. Read-only GET queries and Super Admin access remain fully
                  permitted.
                </p>
              </div>

              <div className="p-4 border rounded-xl bg-neutral-50/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-neutral-900">
                      Current Maintenance State:{' '}
                      <span
                        className={`font-black ${
                          maintenance.isActive ? 'text-amber-600' : 'text-emerald-600'
                        }`}
                      >
                        {maintenance.isActive ? 'ACTIVE (WRITES BLOCKED)' : 'NORMAL OPERATION'}
                      </span>
                    </div>
                    {maintenance.activatedAt && (
                      <div className="text-[11px] text-neutral-500">
                        Activated at: {formatDate(maintenance.activatedAt)} by{' '}
                        {maintenance.activatedBy || 'Super Admin'}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleToggleMaintenance(!maintenance.isActive)}
                    disabled={savingMaintenance}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                      maintenance.isActive
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    } disabled:opacity-50`}
                  >
                    {savingMaintenance
                      ? 'Updating...'
                      : maintenance.isActive
                        ? 'Deactivate Maintenance'
                        : 'Activate Maintenance'}
                  </button>
                </div>

                <div className="space-y-3 pt-2 border-t border-neutral-200">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Maintenance Notice Message (Public Banner)
                    </label>
                    <input
                      type="text"
                      value={maintenanceInputMessage}
                      onChange={(e) => setMaintenanceInputMessage(e.target.value)}
                      placeholder="e.g. Scheduled database maintenance in progress. Document creation is temporarily paused."
                      className="w-full bg-white border border-neutral-300 rounded-lg px-3.5 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1">
                      Maintenance Scope
                    </label>
                    <select
                      value={maintenanceScope}
                      onChange={(e) => setMaintenanceScope(e.target.value as 'platform' | 'tenant')}
                      className="bg-white border border-neutral-300 rounded-lg px-3 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                    >
                      <option value="platform">Entire Platform (All Tenants)</option>
                      <option value="tenant">Targeted Tenant Only</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FEATURE FLAGS */}
          {activeTab === 'flags' && (
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-neutral-900">
                    Platform Feature Flags & Progressive Rollouts
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Toggle capabilities dynamically without code deployments. Supports
                    tenant-specific overrides.
                  </p>
                </div>

                <button
                  onClick={() => setCreateFlagModalOpen(true)}
                  className="px-3.5 py-1.5 bg-[#ba0000] hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                >
                  + New Feature Flag
                </button>
              </div>

              {loadingFlags ? (
                <div className="text-center py-12 text-xs text-neutral-500 font-medium">
                  Loading feature flags...
                </div>
              ) : flags.length === 0 ? (
                <div className="text-center py-12 text-xs text-neutral-500 font-medium border border-dashed rounded-xl">
                  No feature flags configured yet.
                </div>
              ) : (
                <div className="overflow-x-auto border border-neutral-200 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                        <th className="py-3 px-4">Flag Key & Name</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4">Default Status</th>
                        <th className="py-3 px-4">Tenant Overrides</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 text-xs">
                      {flags.map((flag) => {
                        const overrideCount = Object.keys(flag.tenantOverrides || {}).length;
                        return (
                          <tr key={flag.id} className="hover:bg-neutral-50/80 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-bold text-neutral-900">{flag.name}</div>
                              <div className="text-[11px] text-neutral-500 font-mono">
                                {flag.key}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-neutral-600 text-xs max-w-md">
                              {flag.description || '—'}
                            </td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => handleToggleFlag(flag.key, flag.isEnabled)}
                                className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase transition-all ${
                                  flag.isEnabled
                                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 border border-neutral-300'
                                }`}
                              >
                                {flag.isEnabled ? 'ENABLED' : 'DISABLED'}
                              </button>
                            </td>
                            <td className="py-3 px-4 text-neutral-700 font-mono text-xs">
                              {overrideCount > 0 ? (
                                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-bold border border-blue-200">
                                  {overrideCount} override(s)
                                </span>
                              ) : (
                                <span className="text-neutral-400">None</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleDeleteFlag(flag.key)}
                                className="text-red-600 hover:text-red-900 font-semibold text-xs"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: PLATFORM LIMITS & STORAGE QUOTAS */}
          {activeTab === 'limits' && (
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div>
                <h2 className="text-base font-bold text-neutral-900">
                  Global Platform Limits & Quotas
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Update product limits dynamically. Changes take effect immediately across all
                  users and organisations.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.values(configs).map((cfg) => (
                  <div
                    key={cfg.key}
                    className="border border-neutral-200 rounded-xl p-4 bg-neutral-50/50 space-y-3"
                  >
                    <div>
                      <label className="text-xs font-bold text-neutral-800 block">
                        {cfg.label}
                      </label>
                      <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">
                        {cfg.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingConfigs[cfg.key] ?? cfg.value}
                        onChange={(e) =>
                          setEditingConfigs({ ...editingConfigs, [cfg.key]: e.target.value })
                        }
                        className="flex-1 bg-white border border-neutral-300 rounded-lg px-3 py-1.5 text-xs text-neutral-900 font-mono focus:outline-none focus:border-[#ba0000]"
                      />
                      <button
                        onClick={() => handleSaveConfig(cfg.key)}
                        disabled={savingKey === cfg.key}
                        className="px-3.5 py-1.5 bg-[#ba0000] hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                      >
                        {savingKey === cfg.key ? 'Saving...' : 'Update'}
                      </button>
                    </div>

                    <div className="text-[10px] text-neutral-400 flex items-center justify-between pt-1 border-t border-neutral-200/60">
                      <span>
                        Formatted:{' '}
                        {cfg.key.includes('bytes')
                          ? formatBytes(editingConfigs[cfg.key] ?? cfg.value)
                          : (editingConfigs[cfg.key] ?? cfg.value)}
                      </span>
                      <span>
                        Default:{' '}
                        {cfg.key.includes('bytes')
                          ? formatBytes(cfg.defaultValue)
                          : cfg.defaultValue}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: USERS DIRECTORY */}
          {activeTab === 'users' && (
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-neutral-900">
                    Registered Users Directory & Space Utilization
                  </h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Showing {totalUsersCount} registered users across all organisations.
                  </p>
                </div>

                <input
                  type="text"
                  placeholder="Search user name or email..."
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setUserPage(1);
                  }}
                  className="bg-neutral-50 border border-neutral-300 rounded-lg px-3.5 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000] w-full sm:w-64"
                />
              </div>

              {loadingUsers ? (
                <div className="text-center py-12 text-xs text-neutral-500 font-medium">
                  Loading registered users...
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-12 text-xs text-neutral-500 font-medium border border-dashed rounded-xl">
                  No users found.
                </div>
              ) : (
                <div className="overflow-x-auto border border-neutral-200 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                        <th className="py-3 px-4">User</th>
                        <th className="py-3 px-4">Organisation</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Agreements (D / A / Arc)</th>
                        <th className="py-3 px-4">Space Utilized</th>
                        <th className="py-3 px-4">Last Login</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 text-xs">
                      {users.map((u) => {
                        const usedBytes = parseInt(u.storageUsedBytes || '0', 10);
                        const quotaBytes = parseInt(u.storageQuotaBytes || '262144000', 10);
                        const usagePercent =
                          quotaBytes > 0
                            ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100))
                            : 0;

                        return (
                          <tr key={u.id} className="hover:bg-neutral-50/80 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-neutral-900">
                                {u.name || 'Unnamed User'}
                              </div>
                              <div className="text-[11px] text-neutral-500 font-mono">
                                {u.email}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-neutral-800">
                                {u.organisation?.name || '—'}
                              </div>
                              <div className="text-[10px] text-neutral-400 font-mono">
                                {u.organisation?.slug}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-700 uppercase border border-neutral-200">
                                {u.role}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
                                  title="Drafts"
                                >
                                  D: {u.agreementsSummary.draft}
                                </span>
                                <span
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200"
                                  title="Active Agreements"
                                >
                                  A: {u.agreementsSummary.active}
                                </span>
                                <span
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-600 border border-neutral-200"
                                  title="Archived"
                                >
                                  Arc: {u.agreementsSummary.archive}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 w-44">
                              <div className="flex items-center justify-between text-[10px] font-mono text-neutral-600 mb-1">
                                <span>{formatBytes(u.storageUsedBytes)}</span>
                                <span>/ {formatBytes(u.storageQuotaBytes)}</span>
                              </div>
                              <div className="w-full bg-neutral-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full transition-all ${
                                    usagePercent >= 90
                                      ? 'bg-red-600'
                                      : usagePercent >= 75
                                        ? 'bg-amber-500'
                                        : 'bg-[#ba0000]'
                                  }`}
                                  style={{ width: `${usagePercent}%` }}
                                />
                              </div>
                            </td>
                            <td className="py-3 px-4 text-neutral-600 text-[11px]">
                              {formatDate(u.lastLoginAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {userTotalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-neutral-500">
                    Page {userPage} of {userTotalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={userPage === 1}
                      onClick={() => setUserPage(userPage - 1)}
                      className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold hover:bg-neutral-100 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      disabled={userPage === userTotalPages}
                      onClick={() => setUserPage(userPage + 1)}
                      className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold hover:bg-neutral-100 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 7: PLATFORM AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-base font-bold text-neutral-900">
                  Privileged Super Admin Audit Logs
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Immutable forensic audit trail of all platform-level actions, maintenance mode
                  shifts, and quota adjustments.
                </p>
              </div>

              {loadingAuditLogs ? (
                <div className="text-center py-12 text-xs text-neutral-500 font-medium">
                  Loading audit logs...
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-12 text-xs text-neutral-500 font-medium border border-dashed rounded-xl">
                  No platform audit logs recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto border border-neutral-200 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-bold text-neutral-600 uppercase tracking-wider">
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Action</th>
                        <th className="py-3 px-4">Actor</th>
                        <th className="py-3 px-4">Target Resource</th>
                        <th className="py-3 px-4">Metadata</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 text-xs">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-neutral-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono text-[11px] text-neutral-500 whitespace-nowrap">
                            {formatDate(log.createdAt)}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-neutral-100 text-neutral-800 uppercase border border-neutral-200">
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-neutral-700">
                            <div className="font-semibold">{log.user?.email || log.userId}</div>
                          </td>
                          <td className="py-3 px-4 text-neutral-700 font-mono text-[11px]">
                            {log.resourceType}: {log.resourceId.slice(0, 8)}...
                          </td>
                          <td className="py-3 px-4 text-neutral-500 font-mono text-[10px] max-w-xs truncate">
                            {log.metadata ? JSON.stringify(log.metadata) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {auditTotalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-neutral-500">
                    Page {auditPage} of {auditTotalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={auditPage === 1}
                      onClick={() => setAuditPage(auditPage - 1)}
                      className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold hover:bg-neutral-100 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      disabled={auditPage === auditTotalPages}
                      onClick={() => setAuditPage(auditPage + 1)}
                      className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold hover:bg-neutral-100 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MODAL: OVERRIDE TENANT LIMITS */}
          {overrideModalOpen && selectedOrg && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <h3 className="text-base font-bold text-neutral-900">
                    Override Limits: {selectedOrg.name}
                  </h3>
                  <button
                    onClick={() => setOverrideModalOpen(false)}
                    className="text-neutral-400 hover:text-neutral-700"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold text-neutral-700 block mb-1">Max Users</label>
                    <input
                      type="number"
                      value={overrideUsers}
                      onChange={(e) => setOverrideUsers(parseInt(e.target.value, 10) || 1)}
                      className="w-full border rounded-lg px-3 py-1.5 font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-neutral-700 block mb-1">Max Documents</label>
                    <input
                      type="number"
                      value={overrideDocs}
                      onChange={(e) => setOverrideDocs(parseInt(e.target.value, 10) || 1)}
                      className="w-full border rounded-lg px-3 py-1.5 font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-neutral-700 block mb-1">
                      Storage Quota (MB)
                    </label>
                    <input
                      type="number"
                      value={overrideStorageMb}
                      onChange={(e) => setOverrideStorageMb(parseInt(e.target.value, 10) || 100)}
                      className="w-full border rounded-lg px-3 py-1.5 font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-neutral-700 block mb-1">Audit Reason</label>
                    <input
                      type="text"
                      placeholder="e.g. Enterprise pilot expansion"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="w-full border rounded-lg px-3 py-1.5"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    onClick={() => setOverrideModalOpen(false)}
                    className="px-4 py-2 border rounded-lg font-semibold text-xs text-neutral-700 hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveOverride}
                    disabled={submittingOverride}
                    className="px-4 py-2 bg-[#ba0000] text-white rounded-lg font-bold text-xs hover:bg-red-700 disabled:opacity-50"
                  >
                    {submittingOverride ? 'Saving...' : 'Save Limits'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODAL: SUSPEND / RESTORE TENANT */}
          {suspendModalOpen && selectedOrg && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <h3 className="text-base font-bold text-neutral-900">
                    {selectedOrg.status === 'suspended' ? 'Restore Tenant' : 'Suspend Tenant'}:{' '}
                    {selectedOrg.name}
                  </h3>
                  <button
                    onClick={() => setSuspendModalOpen(false)}
                    className="text-neutral-400 hover:text-neutral-700"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <p className="text-neutral-600">
                    {selectedOrg.status === 'suspended'
                      ? `Are you sure you want to restore tenant '${selectedOrg.name}' to active status? Users will regain access immediately.`
                      : `Suspending '${selectedOrg.name}' will revoke workspace access for all users in this tenant.`}
                  </p>

                  <div>
                    <label className="font-bold text-neutral-700 block mb-1">Audit Reason</label>
                    <input
                      type="text"
                      placeholder="e.g. Terms of Service violation / Billing dispute"
                      value={suspendReason}
                      onChange={(e) => setSuspendReason(e.target.value)}
                      className="w-full border rounded-lg px-3 py-1.5"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    onClick={() => setSuspendModalOpen(false)}
                    className="px-4 py-2 border rounded-lg font-semibold text-xs text-neutral-700 hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleToggleSuspend}
                    disabled={submittingSuspend}
                    className={`px-4 py-2 rounded-lg font-bold text-xs text-white ${
                      selectedOrg.status === 'suspended'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-red-600 hover:bg-red-700'
                    } disabled:opacity-50`}
                  >
                    {submittingSuspend
                      ? 'Processing...'
                      : selectedOrg.status === 'suspended'
                        ? 'Restore Tenant'
                        : 'Suspend Tenant'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODAL: CREATE FEATURE FLAG */}
          {createFlagModalOpen && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <h3 className="text-base font-bold text-neutral-900">Create Feature Flag</h3>
                  <button
                    onClick={() => setCreateFlagModalOpen(false)}
                    className="text-neutral-400 hover:text-neutral-700"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold text-neutral-700 block mb-1">
                      Flag Key (lowercase alphanumeric, _, -)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. qes_signatures"
                      value={newFlagKey}
                      onChange={(e) => setNewFlagKey(e.target.value.toLowerCase())}
                      className="w-full border rounded-lg px-3 py-1.5 font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-neutral-700 block mb-1">Flag Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Qualified Electronic Signatures"
                      value={newFlagName}
                      onChange={(e) => setNewFlagName(e.target.value)}
                      className="w-full border rounded-lg px-3 py-1.5"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-neutral-700 block mb-1">Description</label>
                    <textarea
                      placeholder="Optional details regarding flag functionality..."
                      value={newFlagDesc}
                      onChange={(e) => setNewFlagDesc(e.target.value)}
                      rows={2}
                      className="w-full border rounded-lg px-3 py-1.5"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="newFlagEnabled"
                      checked={newFlagEnabled}
                      onChange={(e) => setNewFlagEnabled(e.target.checked)}
                      className="rounded text-[#ba0000]"
                    />
                    <label htmlFor="newFlagEnabled" className="font-bold text-neutral-800">
                      Enable globally by default
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button
                    onClick={() => setCreateFlagModalOpen(false)}
                    className="px-4 py-2 border rounded-lg font-semibold text-xs text-neutral-700 hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateFeatureFlag}
                    disabled={submittingFlag || !newFlagKey.trim() || !newFlagName.trim()}
                    className="px-4 py-2 bg-[#ba0000] text-white rounded-lg font-bold text-xs hover:bg-red-700 disabled:opacity-50"
                  >
                    {submittingFlag ? 'Creating...' : 'Create Flag'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        <Footer />
      </div>
    </SessionGuard>
  );
}
