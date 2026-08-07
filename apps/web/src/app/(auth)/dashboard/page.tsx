'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { ProfileDropdown } from '@/components/features/auth/ProfileDropdown';
import { getApiUrl } from '@/lib/api';

interface UserSession {
  email: string;
  token: string;
  organisationId: string;
}

interface AgreementItem {
  id: string;
  title: string;
  description?: string;
  status: string;
  fileName?: string;
  createdAt: string;
  updatedAt: string;
  author?: { name?: string; email: string };
}

function DashboardContent() {
  const [user] = useState<UserSession | null>(() => {
    if (typeof window === 'undefined') return null;
    return {
      email: localStorage.getItem('graphsign_user_email') ?? 'user@graphsign.ink',
      token: localStorage.getItem('graphsign_session_token') ?? '',
      organisationId: localStorage.getItem('graphsign_org_id') ?? '',
    };
  });

  const [agreements, setAgreements] = useState<AgreementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function loadAgreements() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${getApiUrl()}/api/v1/agreements`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          },
        });

        if (!res.ok) throw new Error('Failed to load dashboard workspace data');
        const data = await res.json();
        if (!ignore) {
          setAgreements(data.items || []);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError((err as Error).message);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    loadAgreements();
    return () => {
      ignore = true;
    };
  }, []);

  const pendingCount = agreements.filter(
    (a) => a.status === 'DRAFT' || a.status === 'PENDING' || a.status === 'pending',
  ).length;

  const completedCount = agreements.filter(
    (a) => a.status === 'COMPLETED' || a.status === 'SEALED' || a.status === 'completed',
  ).length;

  const totalCount = agreements.length;

  return (
    <div
      className="min-h-screen bg-slate-950 flex flex-col font-sans text-slate-100"
      data-testid="dashboard-container"
    >
      {/* Header Navigation */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-xl font-extrabold tracking-tight text-white">
                graphsign<span className="text-red-500">.ink</span>
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-4 text-sm font-medium text-slate-400">
              <Link
                href="/dashboard"
                className="text-white hover:text-white transition-colors py-1 px-2 rounded-md bg-slate-800"
              >
                Dashboard
              </Link>
              <Link
                href="/agreements"
                className="hover:text-white transition-colors py-1 px-2 rounded-md"
              >
                Agreements
              </Link>
              <Link
                href="/templates"
                className="hover:text-white transition-colors py-1 px-2 rounded-md"
              >
                Templates
              </Link>
              <Link
                href="/settings/organisation"
                className="hover:text-white transition-colors py-1 px-2 rounded-md"
              >
                Settings
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <ProfileDropdown email={user?.email} token={user?.token} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-8">
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-850 to-red-950/80 p-8 border border-slate-800 shadow-xl">
          <div className="relative z-10 space-y-2 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Welcome back to your workspace
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Create cryptographically verifiable PDF agreements, manage signing workflows, and
              track tamper-proof audit trails in real-time.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/agreements?action=upload"
              className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-600/20 hover:bg-red-500 transition-all flex items-center gap-2"
            >
              <span>📄</span> Upload Agreement
            </Link>
            <Link
              href="/agreements?action=scratch"
              className="rounded-xl border border-slate-700 bg-slate-800/80 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all backdrop-blur-sm flex items-center gap-2"
            >
              <span>✏️</span> Create from Scratch
            </Link>
            <Link
              href="/templates?action=create"
              className="rounded-xl border border-slate-700 bg-slate-800/80 px-5 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-all backdrop-blur-sm flex items-center gap-2"
            >
              <span>📋</span> Upload Template
            </Link>
          </div>
        </div>

        {/* Live Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm space-y-2 backdrop-blur-md">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Pending / Drafts
            </p>
            <p className="text-3xl font-extrabold text-white">{loading ? '-' : pendingCount}</p>
            <p className="text-xs text-amber-400 font-medium">Active agreement drafts</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm space-y-2 backdrop-blur-md">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Completed Agreements
            </p>
            <p className="text-3xl font-extrabold text-white">{loading ? '-' : completedCount}</p>
            <p className="text-xs text-emerald-400 font-medium">All signatures verified & sealed</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm space-y-2 backdrop-blur-md">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Workspace Documents
            </p>
            <p className="text-3xl font-extrabold text-white">{loading ? '-' : totalCount}</p>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-400 font-medium">Audit chain active</span>
            </div>
          </div>
        </div>

        {/* Recent Agreements Table */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 shadow-sm overflow-hidden space-y-4 p-6 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Recent Agreements</h2>
            <Link
              href="/agreements"
              className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
            >
              View All →
            </Link>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Loading workspace agreements...
            </div>
          ) : agreements.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-950/40 space-y-3">
              <p className="text-sm font-medium text-slate-400">No agreements created yet.</p>
              <div className="flex justify-center gap-3">
                <Link
                  href="/agreements?action=upload"
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-red-600/20"
                >
                  Upload First Agreement
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-slate-800 bg-slate-950 text-xs uppercase font-semibold text-slate-400">
                  <tr>
                    <th scope="col" className="py-3 px-4">
                      Document Name
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Author
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Status
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Created Date
                    </th>
                    <th scope="col" className="py-3 px-4 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {agreements.slice(0, 5).map((agreement) => (
                    <tr key={agreement.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-white">{agreement.title}</td>
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {agreement.author?.email || 'Workspace Author'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-semibold ${
                            agreement.status === 'COMPLETED' || agreement.status === 'SEALED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {agreement.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {new Date(agreement.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href="/agreements"
                          className="text-xs font-semibold text-red-400 hover:text-red-300"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <SessionGuard>
      <Suspense
        fallback={<div className="p-12 text-center text-slate-400">Loading workspace...</div>}
      >
        <DashboardContent />
      </Suspense>
    </SessionGuard>
  );
}
