'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api';

interface ProfileDropdownProps {
  email?: string;
  token?: string;
}

/**
 * ProfileDropdown component provides a modern, accessible avatar menu
 * in the top right header containing Profile, Security (MFA), Session Settings,
 * and Sign Out options.
 */
export function ProfileDropdown({ email, token }: ProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const displayEmail =
    email ||
    (typeof window !== 'undefined'
      ? (localStorage.getItem('graphsign_user_email') ?? 'user@graphsign.ink')
      : 'user@graphsign.ink');

  const userInitial = displayEmail.trim()[0]?.toUpperCase() ?? 'U';

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  async function handleSignOut() {
    try {
      const apiUrl = getApiUrl();
      const sessionToken =
        token ||
        (typeof window !== 'undefined'
          ? (localStorage.getItem('graphsign_session_token') ?? '')
          : '');

      await fetch(`${apiUrl}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
      }).catch(() => null);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('graphsign_session_token');
      localStorage.removeItem('graphsign_user_email');
      localStorage.removeItem('graphsign_org_id');
      localStorage.removeItem('graphsign_user_id');
      window.location.href = '/login';
    }
  }

  return (
    <div
      className="relative inline-block text-left"
      ref={dropdownRef}
      data-testid="profile-dropdown-container"
    >
      {/* Profile Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="User menu"
        data-testid="profile-menu-button"
        className="flex items-center gap-2.5 rounded-full p-1 border border-neutral-200 bg-white hover:bg-neutral-50 hover:border-neutral-300 focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20 focus:border-[#ba0000] transition-all shadow-sm"
      >
        {/* Avatar Bubble */}
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ba0000] text-xs font-bold text-white shadow-inner select-none">
          {userInitial}
        </span>
        <span className="hidden md:inline-block max-w-[140px] truncate text-xs font-medium text-neutral-700">
          {displayEmail}
        </span>
        {/* Chevron Icon */}
        <svg
          className={`h-4 w-4 text-neutral-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Dropdown Menu Popup */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="profile-menu-button"
          data-testid="profile-dropdown-menu"
          className="absolute right-0 mt-2 w-60 origin-top-right rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-black/5 border border-neutral-100 focus:outline-none z-50 animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* User Info Header */}
          <div className="px-3 py-2 border-b border-neutral-100 mb-1">
            <p className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider">
              Signed in as
            </p>
            <p
              className="text-xs font-semibold text-neutral-900 truncate mt-0.5"
              title={displayEmail}
            >
              {displayEmail}
            </p>
          </div>

          {/* Menu Items */}
          <div className="space-y-0.5">
            <Link
              href="/settings/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
              data-testid="profile-settings-link"
            >
              <svg
                className="h-4 w-4 text-neutral-500 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.75"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
              Profile
            </Link>

            <Link
              href="/settings/security"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
              data-testid="security-settings-link"
            >
              <svg
                className="h-4 w-4 text-neutral-500 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.75"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
              Security
            </Link>

            <Link
              href="/settings/organisation"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
              data-testid="organisation-settings-link"
            >
              <svg
                className="h-4 w-4 text-neutral-500 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.75"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21"
                />
              </svg>
              Organisation Settings
            </Link>

            <Link
              href="/settings/admin"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
              data-testid="admin-settings-link"
            >
              <svg
                className="h-4 w-4 text-neutral-500 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.75"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 18H7.5m3-6h9.75m-9.75 0a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 12H7.5"
                />
              </svg>
              Admin Dashboard
            </Link>
          </div>

          {/* Divider */}
          <div className="my-1 border-t border-neutral-100" />

          {/* Sign Out */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              handleSignOut();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
            data-testid="sign-out-button"
          >
            <svg
              className="h-4 w-4 text-red-500 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.75"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
              />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
