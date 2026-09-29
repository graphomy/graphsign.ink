'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'info' | 'attention' | 'success' | 'brand';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: BadgeSize;
  leftIcon?: React.ReactNode;
}

export function Badge({
  className,
  tone = 'neutral',
  size = 'md',
  leftIcon,
  children,
  ...props
}: BadgeProps) {
  const toneStyles: Record<BadgeTone, string> = {
    neutral: 'bg-ink-100 text-ink-700 border-ink-200',
    info: 'bg-info-50 text-info-600 border-info-100',
    attention: 'bg-amber-50 text-amber-700 border-amber-200',
    success: 'bg-verified-50 text-verified-700 border-verified-100',
    brand: 'bg-brand-50 text-brand-700 border-brand-200',
  };

  const sizeStyles: Record<BadgeSize, string> = {
    sm: 'h-5 px-2 text-[11px] uppercase tracking-wider font-bold',
    md: 'h-6 px-2.5 text-xs font-semibold',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border',
        toneStyles[tone],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {leftIcon && <span className="shrink-0">{leftIcon}</span>}
      <span>{children}</span>
    </span>
  );
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const s = status.toUpperCase();

  if (s === 'DRAFT') {
    return (
      <Badge tone="neutral" size="sm" className={className}>
        Draft
      </Badge>
    );
  }
  if (s === 'IN_REVIEW' || s === 'PENDING_REVIEW' || s === 'REVIEW') {
    return (
      <Badge tone="info" size="sm" className={className}>
        In Review
      </Badge>
    );
  }
  if (s === 'ACTIVE' || s === 'SENT' || s === 'AWAITING_SIGNATURES') {
    return (
      <Badge tone="info" size="sm" className={className}>
        ACTIVE
      </Badge>
    );
  }
  if (s === 'AWAITING_YOU' || s === 'ACTION_REQUIRED') {
    return (
      <Badge tone="attention" size="sm" className={className}>
        Awaiting You
      </Badge>
    );
  }
  if (s === 'SIGNED' || s === 'COMPLETED' || s === 'EXECUTED') {
    return (
      <Badge tone="success" size="sm" className={className}>
        Signed
      </Badge>
    );
  }
  if (s === 'DECLINED' || s === 'VOIDED' || s === 'CANCELLED') {
    return (
      <Badge tone="brand" size="sm" className={className}>
        Declined
      </Badge>
    );
  }
  if (s === 'EXPIRED') {
    return (
      <Badge tone="neutral" size="sm" className={cn('line-through opacity-75', className)}>
        Expired
      </Badge>
    );
  }

  return (
    <Badge tone="neutral" size="sm" className={className}>
      {status}
    </Badge>
  );
}
