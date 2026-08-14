'use client';

import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-white border-t border-neutral-200 mt-auto py-8 text-neutral-500 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-bold text-neutral-900">graphsign.ink</span>
          <span>© {new Date().getFullYear()} Graphomy Ltd. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="hover:text-neutral-900 transition-colors">
            Workspace
          </Link>
          <Link href="/agreements" className="hover:text-neutral-900 transition-colors">
            Agreements
          </Link>
          <Link href="/templates" className="hover:text-neutral-900 transition-colors">
            Templates
          </Link>
          <Link href="/settings/organisation" className="hover:text-neutral-900 transition-colors">
            Settings
          </Link>
        </div>
      </div>
    </footer>
  );
}
