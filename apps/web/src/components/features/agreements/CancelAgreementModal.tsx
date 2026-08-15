'use client';

import React, { useState } from 'react';

interface CancelAgreementModalProps {
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

export function CancelAgreementModal({
  agreementId,
  agreementTitle,
  onClose,
  onSuccess,
}: CancelAgreementModalProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for voiding/cancelling this agreement.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${agreementId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          reason: reason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to cancel agreement.');
      }

      onSuccess(`Agreement "${agreementTitle}" has been cancelled.`);
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
          <h2 className="text-base font-bold text-red-600 flex items-center gap-2">
            <span>🛑</span> Cancel / Void Agreement
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">✕</button>
        </div>

        <p className="text-xs text-neutral-600">
          Are you sure you want to cancel <strong>&quot;{agreementTitle}&quot;</strong>? This will immediately invalidate all outstanding signing invitations and mark the envelope as void.
        </p>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Cancellation Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="Explain why this agreement is being cancelled..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              className="w-full bg-white border border-neutral-300 rounded-lg p-2.5 text-xs focus:outline-none focus:border-red-600"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg"
            >
              {isSubmitting ? 'Cancelling...' : 'Confirm Void / Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
