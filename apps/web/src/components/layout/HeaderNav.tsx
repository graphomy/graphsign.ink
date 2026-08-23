'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getApiUrl } from '@/lib/api';
import { ProfileDropdown } from '@/components/features/auth/ProfileDropdown';

const emptySubscribe = () => () => {};
function getStoredEmail() {
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
        // Non-blocking background fetch for organisation header badge
        console.debug('Failed to load org name in header:', err);
      }
    }
    fetchOrg();
  }, []);

  const navItems = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Agreements', href: '/agreements' },
    { label: 'Templates', href: '/templates' },
  ];

  const mobileNavItems = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Agreements', href: '/agreements' },
    { label: 'Templates', href: '/templates' },
    { label: 'Profile', href: '/settings/profile' },
    { label: 'Security', href: '/settings/security' },
    { label: 'Organisation Settings', href: '/settings/organisation' },
  ];

  return (
    <header className="bg-white border-b border-neutral-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Back to Dashboard */}
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2.5 group">
              <div className="h-9 w-9 rounded-xl bg-[#ba0000] text-white font-black text-xl flex items-center justify-center shadow-md shadow-[#ba0000]/20 group-hover:scale-105 transition-transform">
                g
              </div>
              <span className="text-base font-extrabold text-neutral-900 tracking-tight leading-none">
                graphsign<span className="text-[#ba0000]">.ink</span>
              </span>
            </Link>

            {pathname !== '/dashboard' && (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#ba0000] bg-red-50 hover:bg-red-100/80 px-3 py-1.5 rounded-lg transition-all border border-red-200"
              >
                <span>←</span> Back to Dashboard
              </Link>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-red-50 text-[#ba0000] border border-red-200/60'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Profile Section on Top Right */}
          <div className="flex items-center gap-3">
            <ProfileDropdown email={userEmail} orgName={orgName} />
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="lg:hidden flex items-center justify-between border-t border-neutral-100 py-2.5 overflow-x-auto gap-2">
          {mobileNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  isActive ? 'bg-[#ba0000] text-white' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
