'use client';

import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Skeleton } from './Skeleton';

/** Loading and recoverable failure states shared by record lists. */
export function RecordListState({
  error,
  onRetry,
  label,
}: {
  error?: string | null;
  onRetry: () => void;
  label: string;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (error) {
    return (
      <div className="p-8 text-center space-y-3">
        <p role="alert" className="text-sm text-ink-700">
          {error}
        </p>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="py-4" aria-busy="true" aria-label={`Loading ${label}`}>
      <p role="status" className="px-4 pb-4 text-sm text-ink-500">
        {slow
          ? 'This is taking longer than usual. Still trying, no need to refresh.'
          : `Loading ${label}...`}
      </p>
      <div aria-hidden="true" className="divide-y divide-ink-100">
        {[1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="h-16 px-4 flex items-center gap-4">
            <Skeleton className="h-8 w-8 motion-reduce:animate-none" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2 motion-reduce:animate-none" />
              <Skeleton className="h-3 w-1/3 motion-reduce:animate-none" />
            </div>
            <Skeleton className="h-5 w-16 motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  );
}
