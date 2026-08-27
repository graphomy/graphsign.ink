'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface WorkspaceNavProps {
  className?: string;
}

export function WorkspaceNav({ className = '' }: WorkspaceNavProps) {
  const pathname = usePathname();

  const navItems = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="7" height="9" x="3" y="3" rx="1" />
          <rect width="7" height="5" x="14" y="3" rx="1" />
          <rect width="7" height="9" x="14" y="12" rx="1" />
          <rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
      ),
    },
    {
      label: 'Agreements',
      href: '/agreements',
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M10 9H8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </svg>
      ),
    },
    {
      label: 'Templates',
      href: '/templates',
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z" />
          <path d="m14.5 3.5 6 6" />
          <path d="m7.5 10.5 2 2" />
          <path d="m10.5 13.5 2 2" />
          <path d="m13.5 16.5 2 2" />
        </svg>
      ),
    },
  ];

  return (
    <nav
      aria-label="Workspace Sections"
      className={`bg-white border border-neutral-200/90 rounded-2xl p-1.5 shadow-xs flex items-center flex-wrap sm:flex-nowrap gap-1.5 w-full sm:w-auto ${className}`}
    >
      {navItems.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== '/dashboard' && pathname?.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150 flex items-center justify-center sm:justify-start gap-2 select-none ${
              isActive
                ? 'bg-[#ba0000] text-white shadow-sm shadow-[#ba0000]/25 font-bold scale-[1.01]'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100/80'
            }`}
          >
            <span className={isActive ? 'text-white' : 'text-neutral-500'}>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
