'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getApiUrl } from '@/lib/api';

export function HeaderNav() {
  const pathname = usePathname();
  const [orgName, setOrgName] = useState<string>('Workspace');
  const [userEmail] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('graphsign_user_email') || '';
  });

  useEffect(() => {
    async function fetchOrg() {
      try {
        const token =
          localStorage.getItem('token') || localStorage.getItem('graphsign_session_token') || '';
        if (!token) return;
        const res = await fetch(`${getApiUrl()}/api/v1/organisations/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.name) setOrgName(data.name);
        }
      } catch (err) {
        console.error('Failed to load org name in header:', err);
      }
    }
    fetchOrg();
  }, []);

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('graphsign_session_token');
    localStorage.removeItem('graphsign_user_email');
    localStorage.removeItem('graphsign_org_id');
    localStorage.removeItem('graphsign_user_id');
    window.location.href = '/login';
  }

  const navItems = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Agreements', href: '/agreements' },
    { label: 'Templates', href: '/templates' },
    { label: 'Organisation Settings', href: '/settings/organisation' },
    { label: 'Security & Profile', href: '/settings/security' },
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
              <div className="flex flex-col">
                <span className="text-base font-extrabold text-neutral-900 tracking-tight leading-none">
                  graphsign<span className="text-[#ba0000]">.ink</span>
                </span>
                <span className="text-[10px] font-semibold text-neutral-500 tracking-wide uppercase mt-0.5">
                  {orgName}
                </span>
              </div>
            </Link>

            {pathname !== '/dashboard' && (
              <Link
                href="/dashboard"
                className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-[#ba0000] bg-neutral-100 hover:bg-neutral-200/80 px-3 py-1.5 rounded-lg transition-all border border-neutral-200"
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
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
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

          {/* User Email & Logout */}
          <div className="flex items-center gap-3">
            {userEmail && (
              <span className="hidden sm:inline-block text-xs font-medium text-neutral-600 bg-neutral-100 px-2.5 py-1 rounded-md border border-neutral-200">
                {userEmail}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-neutral-600 hover:text-red-600 hover:bg-red-50 border border-neutral-200 px-3 py-1.5 rounded-lg transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="lg:hidden flex items-center justify-between border-t border-neutral-100 py-2.5 overflow-x-auto gap-2">
          {navItems.map((item) => {
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
