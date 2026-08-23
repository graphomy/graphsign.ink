'use client';

import { useState, useEffect } from 'react';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { Footer } from '@/components/layout/Footer';
import { getApiUrl } from '@/lib/api';
import { formatDateTime } from '@/lib/date-utils';

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

interface StatsData {
  totalUsers: number;
  totalOrgs: number;
  totalAgreements: number;
  totalStorageUsedBytes: string;
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

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [configs, setConfigs] = useState<Record<string, ConfigItem>>({});
  const [editingConfigs, setEditingConfigs] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsersCount, setTotalUsersCount] = useState(0);

  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
    fetchConfigs();
  }, []);

  useEffect(() => {
    fetchUsers(page, searchQuery);
  }, [page, searchQuery]);

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
      console.error('Failed to load platform configs:', err);
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
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalUsersCount(data.pagination?.total || 0);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(
          errData.error?.message ||
            errData.message ||
            'Failed to load registered users. Super Admin access required.',
        );
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoadingUsers(false);
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
    } catch (err) {
      console.error('Error saving config:', err);
      setError('Network error while saving configuration limit.');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <SessionGuard>
      <div className="min-h-screen flex flex-col bg-neutral-50 text-neutral-900 font-sans">
        <HeaderNav />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {/* Header & Status Alert */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-black text-neutral-900 tracking-tight">
                  Super Admin Dashboard
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-100 text-[#ba0000] border border-red-200">
                  Super Admin
                </span>
              </div>
              <p className="text-xs text-neutral-600 mt-1">
                Manage global platform limits, user storage quotas, and inspect registered users
                across all organisations.
              </p>
            </div>
          </div>

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

          {/* Overview Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                Registered Users
              </span>
              <div className="text-2xl font-black text-neutral-900 mt-1">
                {stats?.totalUsers ?? '—'}
              </div>
              <span className="text-[10px] text-neutral-400 font-medium mt-1 block">
                Platform-wide total
              </span>
            </div>

            <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                Organisations
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
                Agreements Created
              </span>
              <div className="text-2xl font-black text-neutral-900 mt-1">
                {stats?.totalAgreements ?? '—'}
              </div>
              <span className="text-[10px] text-neutral-400 font-medium mt-1 block">
                Draft, active & archived
              </span>
            </div>

            <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
              <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                Storage Utilized
              </span>
              <div className="text-2xl font-black text-[#ba0000] mt-1">
                {formatBytes(stats?.totalStorageUsedBytes)}
              </div>
              <span className="text-[10px] text-neutral-400 font-medium mt-1 block">
                Total document bytes
              </span>
            </div>
          </div>

          {/* Platform Limits Management Panel */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-base font-bold text-neutral-900">
                Platform Limits & Storage Quotas
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Update product limits dynamically. Changes take effect immediately across all users
                and organisations.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.values(configs).map((cfg) => (
                <div
                  key={cfg.key}
                  className="border border-neutral-200 rounded-xl p-4 bg-neutral-50/50 space-y-3"
                >
                  <div>
                    <label className="text-xs font-bold text-neutral-800 block">{cfg.label}</label>
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
                      {cfg.key.includes('bytes') ? formatBytes(cfg.defaultValue) : cfg.defaultValue}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Registered Users & Metadata Table */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-neutral-900">
                  Registered Users & Storage Usage
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Showing {totalUsersCount} registered users with agreement counts, last login, and
                  space utilized.
                </p>
              </div>

              <input
                type="text"
                placeholder="Search user name or email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
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
                            <div className="text-[11px] text-neutral-500 font-mono">{u.email}</div>
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

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-neutral-500">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                    className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold hover:bg-neutral-100 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                    className="px-3 py-1.5 border border-neutral-300 rounded-lg text-xs font-semibold hover:bg-neutral-100 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </SessionGuard>
  );
}
