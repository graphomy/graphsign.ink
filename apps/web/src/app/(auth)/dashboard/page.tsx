'use client';

import { useState, useEffect, Suspense, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { Footer } from '@/components/layout/Footer';
import { getApiUrl } from '@/lib/api';
import { formatDate, formatStatus } from '@/lib/date-utils';

interface AgreementItem {
  id: string;
  title: string;
  description?: string;
  status: string;
  reviewerId?: string | null;
  fileName?: string;
  createdAt: string;
  updatedAt: string;
  author?: { name?: string; email: string };
}

const emptySubscribe = () => () => {};
function getStoredEmail() {
  return localStorage.getItem('graphsign_user_email') || 'user@graphsign.ink';
}
function getServerEmail() {
  return 'user@graphsign.ink';
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

function DashboardContent() {
  const userEmail = useSyncExternalStore(emptySubscribe, getStoredEmail, getServerEmail);
  const displayName = (userEmail || 'user').split('@')[0];

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
          headers: { Authorization: `Bearer ${getToken()}` },
        });

        if (res.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('graphsign_session_token');
          localStorage.removeItem('graphsign_user_email');
          localStorage.removeItem('graphsign_org_id');
          localStorage.removeItem('graphsign_user_id');
          window.location.href = '/login?reason=session_expired';
          return;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(
            errData?.error?.message ||
              errData?.message ||
              'Failed to load dashboard workspace data.',
          );
        }

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

  const currentUserId =
    typeof window !== 'undefined' ? localStorage.getItem('graphsign_user_id') || '' : '';
  const currentUserEmail =
    typeof window !== 'undefined' ? localStorage.getItem('graphsign_user_email') || '' : '';

  const pendingCount = agreements.filter(
    (a) => a.status === 'DRAFT' || a.status === 'PENDING' || a.status === 'SENT',
  ).length;
  const reviewCount = agreements.filter(
    (a) =>
      a.status === 'IN_REVIEW' &&
      (!a.reviewerId ||
        a.reviewerId === currentUserId ||
        (currentUserEmail && a.author?.email !== currentUserEmail)),
  ).length;
  const completedCount = agreements.filter(
    (a) => a.status === 'COMPLETED' || a.status === 'SEALED',
  ).length;
  const totalCount = agreements.length;

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col font-sans text-neutral-900">
      <HeaderNav />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Workspace Banner */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
              Welcome back,{' '}
              <span className="text-[#ba0000]" suppressHydrationWarning>
                {displayName}
              </span>
            </h1>
            <p className="text-xs text-neutral-600">
              Manage e-signatures, document templates, custom permissions, and audit logs.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/agreements?action=upload"
              className="px-4 py-2.5 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>📄</span> Upload Agreement
            </Link>
            <Link
              href="/agreements?action=scratch"
              className="px-4 py-2.5 bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-800 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>✏️</span> Create from Scratch
            </Link>
            <Link
              href="/templates?action=create"
              className="px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>📐</span> Upload Template
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        {/* Live Workspace Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block">
              Pending Actions
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-neutral-900">{pendingCount}</span>
              <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Requires Signature
              </span>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block">
              Requiring My Review
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-neutral-900">{reviewCount}</span>
              <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                In Review
              </span>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block">
              Completed Agreements
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-neutral-900">{completedCount}</span>
              <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200">
                Sealed & Valid
              </span>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm space-y-1">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider block">
              Total Workspace Contracts
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-neutral-900">{totalCount}</span>
              <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Active Vault
              </span>
            </div>
          </div>
        </div>

        {/* Recent Agreements Section */}
        <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-neutral-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-neutral-900">Recent Workspace Agreements</h2>
              <p className="text-xs text-neutral-500">Live agreement pipeline</p>
            </div>
            <Link
              href="/agreements"
              className="text-xs font-semibold text-[#ba0000] hover:underline"
            >
              View All Agreements →
            </Link>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs font-medium text-neutral-500">
              Loading recent agreements...
            </div>
          ) : agreements.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="h-10 w-10 rounded-full bg-neutral-100 text-neutral-400 mx-auto flex items-center justify-center text-lg">
                📑
              </div>
              <p className="text-xs font-semibold text-neutral-700">
                No agreements found in workspace yet.
              </p>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                There is currently no agreement data to display. Upload a PDF/DOCX or create a new
                contract from scratch to get started.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <Link
                  href="/agreements?action=scratch"
                  className="px-3.5 py-2 bg-[#ba0000] text-white text-xs font-semibold rounded-lg shadow-sm hover:bg-red-700 transition-colors"
                >
                  Create Agreement from Scratch
                </Link>
                <Link
                  href="/agreements?action=upload"
                  className="px-3.5 py-2 bg-white border border-neutral-300 text-neutral-800 text-xs font-semibold rounded-lg shadow-sm hover:bg-neutral-100 transition-colors"
                >
                  Upload Agreement
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-semibold border-b border-neutral-200">
                  <tr>
                    <th className="px-5 py-3">Document Title</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Author</th>
                    <th className="px-5 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {agreements.slice(0, 5).map((agreement) => (
                    <tr key={agreement.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-neutral-900">
                        {agreement.title}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            agreement.status === 'COMPLETED' || agreement.status === 'SEALED'
                              ? 'bg-green-100 text-green-800 border border-green-200'
                              : agreement.status === 'IN_REVIEW'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {formatStatus(agreement.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-neutral-600">
                        {agreement.author?.email || 'System User'}
                      </td>
                      <td className="px-5 py-3.5 text-neutral-500 font-medium">
                        {formatDate(agreement.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <SessionGuard>
      <Suspense
        fallback={<div className="p-12 text-center text-xs text-neutral-500">Loading...</div>}
      >
        <DashboardContent />
      </Suspense>
    </SessionGuard>
  );
}
