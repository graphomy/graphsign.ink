'use client';

import React, { useState } from 'react';

interface SubmitReviewModalProps {
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

export function SubmitReviewModal({
  agreementId,
  agreementTitle,
  onClose,
  onSuccess,
}: SubmitReviewModalProps) {
  const [reviewerEmail, setReviewerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewerEmail.trim()) {
      setError('Please provide a reviewer email address.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${agreementId}/review/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          reviewerEmail: reviewerEmail.trim(),
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to submit agreement for review.');
      }

      onSuccess(`Agreement submitted for review to ${reviewerEmail}`);
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
          <h2 className="text-base font-bold text-neutral-900">Submit for Internal Review</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">✕</button>
        </div>

        <p className="text-xs text-neutral-600">
          Submit <strong>&quot;{agreementTitle}&quot;</strong> to an internal reviewer before sending it to signers.
        </p>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Reviewer Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              placeholder="colleague@example.com"
              value={reviewerEmail}
              onChange={(e) => setReviewerEmail(e.target.value)}
              required
              className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Review Instructions / Notes (Optional)
            </label>
            <textarea
              rows={3}
              placeholder="e.g., Please double check section 3 regarding payment terms."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
            >
              {isSubmitting ? 'Submitting...' : 'Submit for Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
