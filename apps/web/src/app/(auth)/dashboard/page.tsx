'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SessionGuard } from '@/components/features/auth/SessionGuard';

interface UserSession {
  email: string;
  token: string;
  organisationId: string;
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

  async function handleSignOut() {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';
      await fetch(`${apiUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token ?? ''}`,
        },
      }).catch(() => null);
    } finally {
      localStorage.removeItem('graphsign_session_token');
      localStorage.removeItem('graphsign_user_email');
      localStorage.removeItem('graphsign_org_id');
      window.location.href = '/login';
    }
  }

  return (
    <div
      className="min-h-screen bg-neutral-50 flex flex-col font-sans"
      data-testid="dashboard-container"
    >
      {/* Header Navigation */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-neutral-900">
                graphsign<span className="text-[#ba0000]">.ink</span>
              </span>
            </Link>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
              Workspace
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden sm:inline-block text-sm text-neutral-600">
              Signed in as <strong className="text-neutral-900 font-medium">{user?.email}</strong>
            </span>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 hover:text-neutral-900 transition-colors"
              data-testid="sign-out-button"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-8">
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-neutral-900 via-neutral-800 to-[#700000] p-8 text-white shadow-md">
          <div className="relative z-10 space-y-2 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Welcome back to your workspace
            </h1>
            <p className="text-sm text-neutral-300 leading-relaxed">
              Create cryptographically verifiable PDF agreements, manage signing workflows, and
              track tamper-proof audit trails in real-time.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="rounded-lg bg-[#ba0000] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a00000] transition-colors">
              + New Agreement
            </button>
            <button className="rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition-colors backdrop-blur-sm">
              Upload Template
            </button>
          </div>
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-2">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              Pending Signature
            </p>
            <p className="text-3xl font-bold text-neutral-900">3</p>
            <p className="text-xs text-amber-600 font-medium">Requires action from 2 recipients</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-2">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              Completed Agreements
            </p>
            <p className="text-3xl font-bold text-neutral-900">12</p>
            <p className="text-xs text-green-600 font-medium">All signatures verified & sealed</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-2">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              Audit Chain Status
            </p>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-semibold text-neutral-900">100% Immutable</span>
            </div>
            <p className="text-xs text-neutral-500">Hash chain height: #148</p>
          </div>
        </div>

        {/* Recent Agreements Table */}
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">Recent Agreements</h2>
            <span className="text-xs text-neutral-500">Showing last 4 agreements</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-600">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase font-semibold text-neutral-500">
                <tr>
                  <th scope="col" className="py-3 px-4">
                    Document Name
                  </th>
                  <th scope="col" className="py-3 px-4">
                    Recipients
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
              <tbody className="divide-y divide-neutral-100">
                <tr className="hover:bg-neutral-50/50 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-neutral-900">
                    Master Services Agreement 2026.pdf
                  </td>
                  <td className="py-3.5 px-4 text-xs text-neutral-500">
                    alice@company.com, bob@client.org
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 border border-amber-200">
                      Pending Signature
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-neutral-500">Aug 01, 2026</td>
                  <td className="py-3.5 px-4 text-right">
                    <button className="text-xs font-semibold text-[#ba0000] hover:text-[#a00000]">
                      View
                    </button>
                  </td>
                </tr>
                <tr className="hover:bg-neutral-50/50 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-neutral-900">Mutual NDA v2.pdf</td>
                  <td className="py-3.5 px-4 text-xs text-neutral-500">legal@vendor.com</td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 border border-green-200">
                      Sealed & Completed
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-neutral-500">Jul 28, 2026</td>
                  <td className="py-3.5 px-4 text-right">
                    <button className="text-xs font-semibold text-[#ba0000] hover:text-[#a00000]">
                      Download
                    </button>
                  </td>
                </tr>
                <tr className="hover:bg-neutral-50/50 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-neutral-900">
                    Software License Contract.pdf
                  </td>
                  <td className="py-3.5 px-4 text-xs text-neutral-500">cto@enterprise.io</td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 border border-green-200">
                      Sealed & Completed
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-neutral-500">Jul 25, 2026</td>
                  <td className="py-3.5 px-4 text-right">
                    <button className="text-xs font-semibold text-[#ba0000] hover:text-[#a00000]">
                      Download
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <SessionGuard>
      <DashboardContent />
    </SessionGuard>
  );
}

