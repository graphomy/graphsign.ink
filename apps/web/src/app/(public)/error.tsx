'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { AlertCircle, RotateCcw } from 'lucide-react';

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Public error boundary caught:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-white border border-ink-200 rounded-xl p-8 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-ink-900">Unable to load page</h2>
        <p className="text-xs text-ink-500 leading-relaxed">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <div className="pt-2 flex justify-center gap-3">
          <Button
            variant="outline"
            size="md"
            leftIcon={<RotateCcw className="w-4 h-4" />}
            onClick={() => reset()}
          >
            Try again
          </Button>
          <Link href="/">
            <Button variant="primary" size="md">
              Return Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
