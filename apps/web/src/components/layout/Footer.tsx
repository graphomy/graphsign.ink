'use client';

export function Footer() {
  return (
    <footer className="bg-white border-t border-neutral-200 mt-auto py-8 text-neutral-500 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-bold text-neutral-900">graphsign.ink</span>
          <span>© {new Date().getFullYear()} Graphomy Technologies LLP. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
