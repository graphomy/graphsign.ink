'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderCardProps {
  title: React.ReactNode;
  subtitle: string;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * PageHeaderCard
 * Standardised onboard page header card across Dashboard, Agreements, and Templates.
 * Adheres strictly to .claude/docs/ui.md design principles (ink tokens, 24px/32px padding, lg/2xl radius, shadow-xs).
 */
export function PageHeaderCard({ title, subtitle, actions, className }: PageHeaderCardProps) {
  return (
    <section
      aria-label="Page header"
      className={cn(
        'bg-white border border-ink-200 rounded-2xl p-6 sm:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all',
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-[26px] font-bold text-ink-900 tracking-tight leading-tight">
          {title}
        </h1>
        <p className="text-xs sm:text-[13px] text-ink-500 leading-relaxed max-w-2xl">{subtitle}</p>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-3 shrink-0 self-start md:self-auto">
          {actions}
        </div>
      )}
    </section>
  );
}
