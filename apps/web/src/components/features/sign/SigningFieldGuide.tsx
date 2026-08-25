'use client';

import React from 'react';

export interface SigningFieldGuideProps {
  totalRequired: number;
  completedRequired: number;
  onNavigateNext: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  isTurn?: boolean;
}

export function SigningFieldGuide({
  totalRequired,
  completedRequired,
  onNavigateNext,
  onSubmit,
  isSubmitting = false,
  isTurn = true,
}: SigningFieldGuideProps) {
  const isAllComplete = totalRequired > 0 && completedRequired >= totalRequired;
  const progressPercent =
    totalRequired > 0 ? Math.min(100, Math.round((completedRequired / totalRequired) * 100)) : 100;
  const remaining = Math.max(0, totalRequired - completedRequired);

  return (
    <div
      className="fixed bottom-4 right-4 z-40 max-w-sm w-full sm:w-auto bg-neutral-900/95 text-white border border-neutral-700/80 rounded-2xl shadow-2xl p-3.5 backdrop-blur-md animate-in slide-in-from-bottom-4 duration-200"
      data-testid="signing-field-guide"
    >
      <div className="flex items-center gap-3">
        {/* Progress Circular / Bar Indicator */}
        <div className="space-y-1 shrink-0">
          <div className="flex items-center justify-between text-[11px] gap-2 font-medium text-neutral-300">
            <span>
              {isAllComplete ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  ✓ Ready to Sign
                </span>
              ) : (
                <span>
                  <strong>{completedRequired}</strong> of <strong>{totalRequired}</strong> completed
                </span>
              )}
            </span>
            <span className="font-mono text-[10px] text-neutral-400">{progressPercent}%</span>
          </div>

          <div className="w-36 sm:w-44 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                isAllComplete ? 'bg-emerald-500' : 'bg-blue-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Action Button */}
        <div className="shrink-0">
          {isAllComplete ? (
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting || !isTurn}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5"
              data-testid="guide-finish-button"
            >
              {isSubmitting ? 'Signing...' : 'Finish & Sign ✓'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onNavigateNext}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5"
              data-testid="guide-next-field-button"
            >
              <span>{completedRequired === 0 ? 'Start 🎯' : 'Next Field ⬇'}</span>
              {remaining > 0 && (
                <span className="text-[10px] bg-blue-800/80 px-1.5 py-0.5 rounded-full">
                  {remaining}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
