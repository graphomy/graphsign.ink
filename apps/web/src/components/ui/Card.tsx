'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: 'e0' | 'e1' | 'e2' | 'e3';
}

export function Card({ className, elevation = 'e0', children, ...props }: CardProps) {
  const elevationStyles: Record<'e0' | 'e1' | 'e2' | 'e3', string> = {
    e0: 'border border-ink-200',
    e1: 'border border-ink-200 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_1px_3px_rgb(16_24_40/0.06)]',
    e2: 'border border-ink-200 shadow-[0_4px_8px_-2px_rgb(16_24_40/0.06),0_12px_24px_-4px_rgb(16_24_40/0.08)]',
    e3: 'border border-ink-200 shadow-[0_8px_16px_-4px_rgb(16_24_40/0.08),0_24px_48px_-12px_rgb(16_24_40/0.16)]',
  };

  return (
    <div
      className={cn('bg-white rounded-lg', elevationStyles[elevation], className)}
      {...props}
    >
      {children}
    </div>
  );
}
