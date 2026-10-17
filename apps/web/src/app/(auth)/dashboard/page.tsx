'use client';

import { useState, useEffect, Suspense, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { PageHeaderCard } from '@/components/layout/PageHeaderCard';
import { Footer } from '@/components/layout/Footer';
import { getApiUrl } from '@/lib/api';
import { fetchRead } from '@/lib/fetch-read';
import { formatDate, formatStatus } from '@/lib/date-utils';

interface AgreementRecipient {
  id?: string;
  name?: string;
  email: string;
  role?: string;
  status: string;
  routingOrder?: number;
}

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
  recipients?: AgreementRecipient[];
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
  const [hasNoCertificate, setHasNoCertificate] = useState(false);
  const [hasExpiredCertificate, setHasExpiredCertificate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadDashboardData() {
      setLoading(true);
      setError(null);
      try {
        const token = getToken();
        const [agreementsRes, certsRes] = await Promise.all([
          fetchRead(`${getApiUrl()}/api/v1/agreements?limit=100`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }),
          fetchRead(`${getApiUrl()}/api/v1/certificates`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'x-user-id': localStorage.getItem('graphsign_user_id') ?? '',
              'x-organisation-id': localStorage.getItem('graphsign_org_id') ?? '',
            },
            signal: controller.signal,
          }).catch(() => null),
        ]);

        if (agreementsRes.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('graphsign_session_token');
          localStorage.removeItem('graphsign_user_email');
          localStorage.removeItem('graphsign_org_id');
          localStorage.removeItem('graphsign_user_id');
          window.location.href = '/login?reason=session_expired';
          return;
        }

        if (agreementsRes.ok) {
          const data = await agreementsRes.json();
          if (!controller.signal.aborted) {
            setAgreements(Array.isArray(data) ? data : (data.items ?? data.agreements ?? []));
          }
        } else {
          const errData = await agreementsRes.json().catch(() => null);
          const errMsg =
            errData?.error?.message ||
            errData?.message ||
            'Failed to load dashboard workspace data.';
          if (!controller.signal.aborted) {
            setError(errMsg);
          }
        }

        if (certsRes && certsRes.ok) {
          const certs = await certsRes.json().catch(() => []);
          if (!controller.signal.aborted) {
            const certList = Array.isArray(certs) ? certs : (certs.items ?? []);
            const now = Date.now();
            const activeValidCerts = certList.filter(
              (c: { status?: string; validTo?: string }) =>
                c.status === 'ACTIVE' && (!c.validTo || new Date(c.validTo).getTime() > now),
            );
            setHasNoCertificate(certList.length === 0);
            setHasExpiredCertificate(certList.length > 0 && activeValidCerts.length === 0);
          }
        }
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Network error loading dashboard');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadDashboardData();
    return () => {
      controller.abort();
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
  const pendingSignatureCount = agreements.filter((a) => {
    const isPendingSigStatus =
      a.status === 'SENT' || a.status === 'PARTIALLY_SIGNED' || a.status === 'PENDING';
    if (!isPendingSigStatus) return false;
    if (a.recipients && a.recipients.length > 0 && currentUserEmail) {
      const isSignerForUser = a.recipients.some(
        (r) =>
          r.email?.trim().toLowerCase() === currentUserEmail.trim().toLowerCase() &&
          (r.status === 'PENDING' || r.status === 'INVITED'),
      );
      if (isSignerForUser) return true;
      const isAuthorWithPendingSigners =
        a.author?.email?.trim().toLowerCase() === currentUserEmail.trim().toLowerCase() &&
        a.recipients.some((r) => r.status === 'PENDING' || r.status === 'INVITED');
      if (isAuthorWithPendingSigners) return true;
      return false;
    }
    return true;
  }).length;
  const completedCount = agreements.filter(
    (a) => a.status === 'COMPLETED' || a.status === 'SEALED',
  ).length;
  const totalCount = agreements.length;

  return (
    <div className="min-h-screen mesh-dashboard-bg flex flex-col font-sans text-slate-900">
      <HeaderNav />

      <main className="flex-1 py-8 px-6 lg:px-8 max-w-[1440px] mx-auto w-full space-y-6">
        {/* Certificate Setup Callout Banner (Issue 2) */}
        {!loading && hasExpiredCertificate && (
          <div className="rounded-2xl bg-red-50/90 border border-red-300 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-red-100 border border-red-300 text-red-800 flex items-center justify-center font-bold text-lg shrink-0">
                🚨
              </div>
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-red-950">
                  Action Required: Signing Certificate Expired
                </h3>
                <p className="text-xs text-red-800 leading-relaxed">
                  Your organisation&apos;s X.509 digital signing certificate has expired. Documents
                  sealed with an expired certificate will fail cryptographic PAdES verification.
                  Create or upload a new certificate to maintain document validity.
                </p>
              </div>
            </div>
            <Link
              href="/settings/certificates?action=create"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-sm shrink-0 self-start sm:self-auto"
            >
              Renew Certificate →
            </Link>
          </div>
        )}

        {!loading && !hasExpiredCertificate && hasNoCertificate && (
          <div className="rounded-2xl bg-amber-50/90 border border-amber-300 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center font-bold text-lg shrink-0">
                ⚠️
              </div>
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-amber-950">
                  Complete Setup: Create or Upload Your Signing Certificate
                </h3>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Your organisation does not have an active X.509 signing certificate yet. Generate
                  a self-signed certificate or upload an enterprise PKI certificate to enable
                  cryptographic sealing and PAdES digital signatures.
                </p>
              </div>
            </div>
            <Link
              href="/settings/certificates?action=create"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm shrink-0 self-start sm:self-auto"
            >
              Complete Setup →
            </Link>
          </div>
        )}

        {/* Onboard Page Header Card */}
        <PageHeaderCard
          title={
            <>
              Welcome back,{' '}
              <span className="gradient-brand-text font-black" suppressHydrationWarning>
                {displayName}
              </span>
            </>
          }
          subtitle="Manage e-signatures, templates, permissions, and cryptographic audit logs."
          actions={
            reviewCount > 0 || pendingSignatureCount > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                {reviewCount > 0 && (
                  <Link
                    href="/agreements?tab=review_required"
                    className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                  >
                    <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                    Pending Review ({reviewCount})
                  </Link>
                )}
                {pendingSignatureCount > 0 && (
                  <Link
                    href="/agreements?tab=waiting_for_me"
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                  >
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                    Pending Signature ({pendingSignatureCount})
                  </Link>
                )}
              </div>
            ) : null
          }
        />

        {/* Quick Search Omnibar */}
        <div className="glass-panel border border-slate-200/90 rounded-2xl p-2.5 shadow-sm flex items-center gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search across all agreements, templates, signers, or tags..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  window.location.href = `/agreements?q=${encodeURIComponent(e.currentTarget.value.trim())}`;
                }
              }}
              className="w-full pl-10 pr-4 py-2 bg-slate-50/80 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-red-500 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/15 transition-all"
            />
          </div>
          <Link
            href="/agreements"
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors shrink-0"
          >
            Advanced Search &rarr;
          </Link>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        {/* Live Workspace Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="glass-panel card-hover border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Pending Actions
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-3xl font-black text-slate-900">{pendingCount}</span>
              <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200">
                Drafts &amp; Active
              </span>
            </div>
          </div>

          <div className="glass-panel card-hover border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Requiring My Review
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-3xl font-black text-slate-900">{reviewCount}</span>
              <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-lg border border-purple-200">
                In Review
              </span>
            </div>
          </div>

          <div className="glass-panel card-hover border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Completed Agreements
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-3xl font-black text-slate-900">{completedCount}</span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                Sealed &amp; Valid
              </span>
            </div>
          </div>

          <div className="glass-panel card-hover border border-slate-200/90 rounded-2xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Total Workspace Contracts
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-3xl font-black text-slate-900">{totalCount}</span>
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200">
                Active Vault
              </span>
            </div>
          </div>
        </div>

        {/* Recent Agreements Section */}
        <div className="glass-panel border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200/80 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Workspace Agreements</h2>
              <p className="text-xs text-slate-500">Live agreement pipeline</p>
            </div>
            <Link
              href="/agreements"
              className="text-xs font-bold text-[#e11d2e] hover:underline flex items-center gap-1"
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
                  className="px-4 py-2 gradient-brand-btn text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  Create Agreement from Scratch
                </Link>
                <Link
                  href="/agreements?action=upload"
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-800 text-xs font-bold rounded-xl shadow-xs hover:bg-slate-50 transition-colors"
                >
                  Upload Agreement
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-bold border-b border-slate-200/80">
                  <tr>
                    <th className="px-5 py-3.5">Document Title</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Author</th>
                    <th className="px-5 py-3.5">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agreements.slice(0, 5).map((agreement) => (
                    <tr key={agreement.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-900">
                        {agreement.title}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                            agreement.status === 'COMPLETED' || agreement.status === 'SEALED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : agreement.status === 'IN_REVIEW'
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              agreement.status === 'COMPLETED' || agreement.status === 'SEALED'
                                ? 'bg-emerald-500'
                                : agreement.status === 'IN_REVIEW'
                                  ? 'bg-purple-500'
                                  : 'bg-amber-500'
                            }`}
                          />
                          {formatStatus(agreement.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 font-medium">
                        {agreement.author?.email || 'System User'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 font-medium">
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
