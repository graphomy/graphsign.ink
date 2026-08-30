'use client';

import React, { useState, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getApiUrl } from '@/lib/api';
import { ProfileDropdown } from '@/components/features/auth/ProfileDropdown';

const emptySubscribe = () => () => {};
function getStoredEmail() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_user_email') || '';
}
function getServerEmail() {
  return '';
}

export function HeaderNav() {
  const pathname = usePathname();
  const [orgName, setOrgName] = useState<string>('Workspace');
  const userEmail = useSyncExternalStore(emptySubscribe, getStoredEmail, getServerEmail);

  useEffect(() => {
    async function fetchOrg() {
      try {
        const token =
          localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
        if (!token) return;
        const res = await fetch(`${getApiUrl()}/api/v1/organisations/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.name) setOrgName(data.name);
        }
      } catch (err) {
        console.debug('Failed to load org name in header:', err);
      }
    }
    fetchOrg();
  }, []);

  const navTabs = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Agreements', href: '/agreements' },
    { label: 'Templates', href: '/templates' },
  ];

  return (
    <header className="bg-white border-b border-ink-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Left: 'g' mark + wordmark linking to /dashboard */}
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2.5 group">
              <div className="h-8 w-8 rounded-lg bg-brand-600 text-white font-black text-lg flex items-center justify-center shadow-xs group-hover:bg-brand-700 transition-colors">
                g
              </div>
              <span className="text-base font-bold text-ink-900 tracking-tight leading-none">
                graphsign<span className="text-brand-600">.ink</span>
              </span>
            </Link>
          </div>

          {/* Centre: Section nav underline tabs */}
          <nav className="hidden md:flex items-center gap-8 h-full">
            {navTabs.map((tab) => {
              const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`h-full inline-flex items-center text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-brand-600 text-ink-900 font-semibold'
                      : 'border-transparent text-ink-500 hover:text-ink-900'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          {/* Right: Account menu */}
          <div className="flex items-center gap-3">
            <ProfileDropdown email={userEmail} orgName={orgName} />
          </div>
        </div>
      </div>
    </header>
  );
}
