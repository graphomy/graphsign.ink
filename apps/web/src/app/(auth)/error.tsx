'use client';

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { AlertCircle, RotateCcw } from 'lucide-react';

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Workspace error boundary caught:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-ink-200 rounded-xl p-8 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-ink-900">Something went wrong</h2>
        <p className="text-xs text-ink-500 leading-relaxed">
          {error.message || 'An unexpected error occurred while loading this workspace page.'}
        </p>
        <div className="pt-2 flex justify-center gap-3">
          <Button
            variant="primary"
            size="md"
            leftIcon={<RotateCcw className="w-4 h-4" />}
            onClick={() => reset()}
          >
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
