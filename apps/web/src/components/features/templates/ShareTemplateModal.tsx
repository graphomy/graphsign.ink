'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api';

interface ShareItem {
  id: string;
  targetType: string;
  targetId: string;
  accessLevel: string;
  createdAt?: string;
}

interface OrgMember {
  id: string;
  userId: string;
  user?: {
    id: string;
    name?: string | null;
    email: string;
  };
}

interface ShareTemplateModalProps {
  templateId: string;
  templateTitle: string;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

export function ShareTemplateModal({
  templateId,
  templateTitle,
  onClose,
  onSuccess,
}: ShareTemplateModalProps) {
  const [planType, setPlanType] = useState<string | null>(null);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [isLoadingShares, setIsLoadingShares] = useState(false);

  // Form state
  const [targetType, setTargetType] = useState<'team' | 'user'>('team');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [accessLevel, setAccessLevel] = useState<'READ' | 'EDIT'>('READ');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 1. Fetch organization details to check plan type & load members
  useEffect(() => {
    let ignore = false;
    async function loadOrg() {
      setIsLoadingOrg(true);
      try {
        const res = await fetch(`${getApiUrl()}/api/v1/organisations/me`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (!ignore && data) {
            const orgPlan = data.planType || 'individual';
            setPlanType(orgPlan);
            if (Array.isArray(data.members)) {
              setMembers(data.members);
              if (data.members[0]?.userId) {
                setSelectedUserId(data.members[0].userId);
              }
            }
          }
        } else {
          if (!ignore) setPlanType('individual');
        }
      } catch (_err) {
        if (!ignore) setPlanType('individual');
      } finally {
        if (!ignore) setIsLoadingOrg(false);
      }
    }
    loadOrg();
    return () => {
      ignore = true;
    };
  }, []);

  // 2. Fetch existing shares
  useEffect(() => {
    let ignore = false;
    async function loadShares() {
      setIsLoadingShares(true);
      try {
        const res = await fetch(`${getApiUrl()}/api/v1/templates/${templateId}/shares`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (!ignore && Array.isArray(data)) {
            setShares(data);
          }
        }
      } catch (_err) {
        // Ignore
      } finally {
        if (!ignore) setIsLoadingShares(false);
      }
    }
    if (planType && (planType === 'teams' || planType === 'team' || planType === 'enterprise')) {
      loadShares();
    }
    return () => {
      ignore = true;
    };
  }, [templateId, planType]);

  const isTeamsPlan =
    planType === 'teams' || planType === 'team' || planType === 'enterprise';

  // Add share
  async function handleAddShare(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const targetId = targetType === 'team' ? 'org-team' : selectedUserId;
    if (!targetId) {
      setErrorMessage('Please select a team member.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates/${templateId}/shares`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          targetType,
          targetId,
          accessLevel,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || data?.message || 'Failed to share template.');
      }

      const newShare = await res.json();
      setShares((prev) => [
        ...prev.filter((s) => !(s.targetType === targetType && s.targetId === targetId)),
        newShare,
      ]);
      setSuccessMessage('Template shared successfully.');
      if (onSuccess) onSuccess('Template shared successfully.');
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Revoke share
  async function handleRevokeShare(shareId: string) {
    setErrorMessage(null);
    try {
      const res = await fetch(
        `${getApiUrl()}/api/v1/templates/${templateId}/shares/${shareId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );

      if (!res.ok) throw new Error('Failed to revoke template share.');
      setShares((prev) => prev.filter((s) => s.id !== shareId));
      setSuccessMessage('Share access revoked.');
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-neutral-900 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <div>
            <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <span>👥</span> Share Template
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5 truncate max-w-sm font-medium">
              {templateTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 text-lg font-bold p-1"
          >
            ×
          </button>
        </div>

        {/* Loading State */}
        {isLoadingOrg ? (
          <div className="py-8 text-center text-xs text-neutral-500">Checking workspace plan...</div>
        ) : !isTeamsPlan ? (
          /* ========================================================================= */
          /* UPGRADE PROMPT: For users not on Teams Plan */
          /* ========================================================================= */
          <div className="py-4 space-y-4 text-center">
            <div className="w-12 h-12 bg-red-100 text-[#ba0000] rounded-2xl flex items-center justify-center text-2xl mx-auto shadow-xs">
              🔒
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-neutral-900">
                This feature is only for users on Teams plan
              </h3>
              <p className="text-xs text-neutral-600 max-w-md mx-auto leading-relaxed">
                Template sharing across your organization and with specific team members is available
                exclusively on the <strong>Teams Plan</strong>. Upgrade your workspace to collaborate
                seamlessly.
              </p>
            </div>

            <div className="pt-3 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg transition-all"
              >
                Maybe Later
              </button>
              <Link
                href="/settings/organisation?tab=overview"
                onClick={onClose}
                className="px-4 py-2 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
              >
                Upgrade to Teams
              </Link>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* TEAMS PLAN: SHARING CONTROLS */
          /* ========================================================================= */
          <div className="space-y-4">
            {errorMessage && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 font-medium">
                ⚠️ {errorMessage}
              </div>
            )}
            {successMessage && (
              <div className="rounded-lg bg-green-50 border border-green-200 p-2.5 text-xs text-green-800 font-medium">
                ✓ {successMessage}
              </div>
            )}

            <form onSubmit={handleAddShare} className="space-y-3 bg-neutral-50 p-3.5 rounded-xl border border-neutral-200">
              <span className="text-xs font-bold text-neutral-800 block">Grant New Access</span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                    Share With
                  </label>
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value as 'team' | 'user')}
                    className="w-full bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                  >
                    <option value="team">Entire Team / Organization</option>
                    <option value="user">Specific Team Member</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                    Permission Level
                  </label>
                  <select
                    value={accessLevel}
                    onChange={(e) => setAccessLevel(e.target.value as 'READ' | 'EDIT')}
                    className="w-full bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                  >
                    <option value="READ">Can View & Use (Read)</option>
                    <option value="EDIT">Can Edit & Version (Edit)</option>
                  </select>
                </div>
              </div>

              {targetType === 'user' && (
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 mb-1">
                    Select Member
                  </label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                  >
                    {members.length === 0 ? (
                      <option value="">No members found</option>
                    ) : (
                      members.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.user?.name || m.user?.email} ({m.user?.email})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Sharing...' : 'Share Template'}
                </button>
              </div>
            </form>

            {/* Active Shares List */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-neutral-800 block">
                Active Shares ({shares.length})
              </span>

              {isLoadingShares ? (
                <p className="text-xs text-neutral-400 py-2">Loading active shares...</p>
              ) : shares.length === 0 ? (
                <p className="text-xs text-neutral-500 bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                  This template is currently private to its author and published library viewers.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {shares.map((share) => {
                    const memberMatch = members.find((m) => m.userId === share.targetId);
                    const label =
                      share.targetType === 'team'
                        ? 'Entire Team / Organization'
                        : memberMatch?.user?.name || memberMatch?.user?.email || share.targetId;

                    return (
                      <div
                        key={share.id}
                        className="flex items-center justify-between p-2.5 bg-white border border-neutral-200 rounded-lg text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span>{share.targetType === 'team' ? '🏢' : '👤'}</span>
                          <div>
                            <span className="font-semibold text-neutral-900 block">{label}</span>
                            <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
                              {share.accessLevel === 'EDIT' ? 'Can Edit' : 'Can View'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRevokeShare(share.id)}
                          className="text-neutral-400 hover:text-red-600 font-bold text-xs p-1"
                          title="Revoke access"
                        >
                          Revoke
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
