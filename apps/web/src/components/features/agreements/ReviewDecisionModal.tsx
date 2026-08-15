'use client';

import React, { useState } from 'react';

interface ReviewDecisionModalProps {
  agreementId: string;
  agreementTitle: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

function getApiUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:8787';
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

export function ReviewDecisionModal({
  agreementId,
  agreementTitle,
  onClose,
  onSuccess,
}: ReviewDecisionModalProps) {
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (decision === 'REJECT' && !comments.trim()) {
      setError('Please provide feedback comments explaining why the document is rejected.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const endpoint = decision === 'APPROVE' ? 'approve' : 'reject';
      const res = await fetch(
        `${getApiUrl()}/api/v1/agreements/${agreementId}/review/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            comments: comments.trim() || undefined,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to submit review decision.');
      }

      onSuccess(
        decision === 'APPROVE'
          ? `Agreement "${agreementTitle}" approved successfully.`
          : `Agreement "${agreementTitle}" rejected with feedback.`,
      );
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-neutral-900">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-900">Review &amp; Decision</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>

        <p className="text-xs text-neutral-600">
          Review <strong>&quot;{agreementTitle}&quot;</strong> and make an approval or rejection
          decision.
        </p>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDecision('APPROVE')}
              className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                decision === 'APPROVE'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <span className="text-lg">✓</span>
              <span>Approve Document</span>
            </button>

            <button
              type="button"
              onClick={() => setDecision('REJECT')}
              className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                decision === 'REJECT'
                  ? 'border-red-600 bg-red-50 text-red-800 ring-2 ring-red-500'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <span className="text-lg">✕</span>
              <span>Reject / Changes Required</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Feedback / Comments {decision === 'REJECT' && <span className="text-red-500">*</span>}
            </label>
            <textarea
              rows={3}
              placeholder={
                decision === 'APPROVE'
                  ? 'Optional review comments...'
                  : 'Explain required changes...'
              }
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="w-full bg-white border border-neutral-300 rounded-lg p-2.5 text-xs focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 text-xs font-bold text-white rounded-lg transition-colors ${
                decision === 'APPROVE'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              } disabled:opacity-50`}
            >
              {isSubmitting
                ? 'Submitting...'
                : decision === 'APPROVE'
                  ? 'Confirm Approval'
                  : 'Confirm Rejection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
