'use client';

import React, { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api';
import { User, Shield, Building, LogOut, Sliders, ChevronDown, Award } from 'lucide-react';

interface ProfileDropdownProps {
  email?: string;
  token?: string;
  orgName?: string;
}

const emptySubscribe = () => () => {};

function getStoredEmailSnapshot() {
  if (typeof window === 'undefined') return 'user@graphsign.ink';
  return localStorage.getItem('graphsign_user_email') || 'user@graphsign.ink';
}
function getServerEmailSnapshot() {
  return 'user@graphsign.ink';
}

function getStoredOrgSnapshot() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_org_name') || '';
}
function getServerOrgSnapshot() {
  return '';
}

function getStoredRoleSnapshot() {
  if (typeof window === 'undefined') return '';
  const stored = localStorage.getItem('graphsign_user_role');
  if (stored) return stored;
  const sessionToken =
    localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
  if (sessionToken) {
    try {
      const parts = sessionToken.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload?.role) return payload.role;
      }
    } catch {}
  }
  return '';
}
function getServerRoleSnapshot() {
  return '';
}

export function ProfileDropdown({ email, token, orgName }: ProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const clientEmail = useSyncExternalStore(
    emptySubscribe,
    getStoredEmailSnapshot,
    getServerEmailSnapshot,
  );
  const clientOrg = useSyncExternalStore(
    emptySubscribe,
    getStoredOrgSnapshot,
    getServerOrgSnapshot,
  );
  const clientRole = useSyncExternalStore(
    emptySubscribe,
    getStoredRoleSnapshot,
    getServerRoleSnapshot,
  );

  const displayEmail = email || clientEmail;
  const displayOrgName = orgName || clientOrg;
  const [planType, setPlanType] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('graphsign_plan_type') || 'individual';
    }
    return 'individual';
  });

  useEffect(() => {
    const sessionToken =
      token ||
      localStorage.getItem('graphsign_session_token') ||
      localStorage.getItem('token') ||
      '';
    if (!sessionToken) return;
    const apiUrl = getApiUrl();
    fetch(`${apiUrl}/api/v1/organisations/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
      .then((res) => (res && typeof res.json === 'function' && res.ok ? res.json() : null))
      .then((data) => {
        if (data?.planType) {
          setPlanType(data.planType);
          localStorage.setItem('graphsign_plan_type', data.planType);
        }
      })
      .catch((err) => {
        console.debug('Failed to load organisation details:', err);
      });
  }, [token]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const userInitial = (displayEmail && displayEmail.charAt(0).toUpperCase()) || 'U';
  const userRole = clientRole || 'member';

  function handleSignOut() {
    localStorage.removeItem('graphsign_session_token');
    localStorage.removeItem('token');
    localStorage.removeItem('graphsign_user_email');
    localStorage.removeItem('graphsign_user_id');
    localStorage.removeItem('graphsign_org_id');
    localStorage.removeItem('graphsign_org_name');
    localStorage.removeItem('graphsign_plan_type');
    localStorage.removeItem('graphsign_user_role');
    window.location.href = '/login';
  }

  return (
    <div
      className="relative inline-block text-left"
      ref={dropdownRef}
      data-testid="profile-dropdown-container"
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="User menu"
        data-testid="profile-menu-button"
        className="flex items-center gap-2.5 rounded-full p-1 border border-ink-200 bg-white hover:bg-ink-50 hover:border-ink-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-950 transition-all shadow-xs"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white select-none">
          {userInitial}
        </span>
        <span className="hidden md:inline-block max-w-[180px] truncate text-xs font-medium text-ink-700">
          {displayEmail}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-ink-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="profile-menu-button"
          data-testid="profile-dropdown-menu"
          className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl bg-white p-1.5 shadow-[0_4px_8px_-2px_rgb(16_24_40/0.06),0_12px_24px_-4px_rgb(16_24_40/0.08)] border border-ink-200 focus:outline-none z-30 animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="px-3 py-2.5 border-b border-ink-100 mb-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-ink-400 font-medium uppercase tracking-wider">
                Signed in as
              </p>
              {planType === 'teams' ? (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200"
                  data-testid="plan-badge-teams"
                >
                  <Building className="w-3 h-3 text-brand-600" />
                  Teams Plan
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-ink-100 text-ink-600 border border-ink-200"
                  data-testid="plan-badge-individual"
                >
                  <User className="w-3 h-3 text-ink-500" />
                  Individual
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-ink-900 truncate mt-1" title={displayEmail}>
              {displayEmail}
            </p>
            {displayOrgName && (
              <div
                className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-600 bg-ink-50 px-2 py-1 rounded border border-ink-200 truncate"
                title={`Workspace: ${displayOrgName}`}
              >
                <Building className="w-3 h-3 shrink-0 text-ink-500" />
                <span className="truncate">{displayOrgName}</span>
              </div>
            )}
          </div>

          <div className="space-y-0.5">
            <Link
              href="/settings/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-ink-700 hover:bg-ink-100 hover:text-ink-900 transition-colors"
              data-testid="profile-settings-link"
            >
              <User className="h-4 w-4 text-ink-500 shrink-0" aria-hidden="true" />
              Profile
            </Link>

            <Link
              href="/settings/certificates"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-ink-700 hover:bg-ink-100 hover:text-ink-900 transition-colors"
              data-testid="certificates-settings-link"
            >
              <Award className="h-4 w-4 text-ink-500 shrink-0" aria-hidden="true" />
              Certificates & Trust
            </Link>

            <Link
              href="/settings/security"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-ink-700 hover:bg-ink-100 hover:text-ink-900 transition-colors"
              data-testid="security-settings-link"
            >
              <Shield className="h-4 w-4 text-ink-500 shrink-0" aria-hidden="true" />
              Security
            </Link>

            {planType === 'teams' ? (
              <Link
                href="/settings/organisation"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-ink-700 hover:bg-ink-100 hover:text-ink-900 transition-colors"
                data-testid="organisation-settings-link"
              >
                <Building className="h-4 w-4 text-ink-500 shrink-0" aria-hidden="true" />
                Organisation Settings
              </Link>
            ) : (
              <Link
                href="/settings/organisation"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 transition-colors"
                data-testid="upgrade-to-teams-link"
              >
                <span className="flex items-center gap-2">
                  <Building className="w-3.5 h-3.5" aria-hidden="true" />
                  Upgrade to Teams
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-brand-600 text-white px-1.5 py-0.5 rounded">
                  UPGRADE
                </span>
              </Link>
            )}

            {userRole === 'super_admin' && (
              <Link
                href="/settings/admin"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-ink-700 hover:bg-ink-100 hover:text-ink-900 transition-colors"
                data-testid="admin-settings-link"
              >
                <Sliders className="h-4 w-4 text-ink-500 shrink-0" aria-hidden="true" />
                Graphomy Administration
              </Link>
            )}
          </div>

          <div className="my-1 border-t border-ink-100" />

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              handleSignOut();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-brand-600 hover:bg-brand-50 hover:text-brand-700 transition-colors"
            data-testid="sign-out-button"
          >
            <LogOut className="h-4 w-4 text-brand-600 shrink-0" aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
