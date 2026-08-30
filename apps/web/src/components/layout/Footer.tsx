'use client';

import React from 'react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-ink-200 bg-white py-6 text-[13px] text-ink-400">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-bold text-ink-900">
            graphsign<span className="text-brand-600">.ink</span>
          </span>
          <span>© 2026 Graphomy Technologies LLP</span>
        </div>
        <div className="flex items-center gap-6 text-ink-500">
          <Link
            href="/verify"
            className="hover:text-brand-600 font-semibold text-brand-600 transition-colors"
          >
            Verify Signature
          </Link>
          <Link href="/terms" className="hover:text-ink-900 transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-ink-900 transition-colors">
            Privacy
          </Link>
          <Link href="/status" className="hover:text-ink-900 transition-colors">
            Status
          </Link>
          <Link href="/support" className="hover:text-ink-900 transition-colors">
            Support
          </Link>
        </div>
      </div>
    </footer>
  );
}
