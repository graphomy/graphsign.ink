import React from 'react';

export default function AuthLoading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
      <div className="w-8 h-8 border-2 border-ink-200 border-t-brand-600 rounded-full animate-spin mb-3" />
      <p className="text-xs font-medium text-ink-500">Loading workspace…</p>
    </div>
  );
}
