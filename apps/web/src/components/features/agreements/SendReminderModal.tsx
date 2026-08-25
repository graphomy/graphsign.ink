'use client';

import React, { useState } from 'react';
import { getApiUrl } from '@/lib/api';

interface RecipientOption {
  id?: string;
  name: string;
  email: string;
  status?: string;
}

interface SendReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  agreementId: string;
  agreementTitle: string;
  recipients?: RecipientOption[];
  onSuccess?: () => void;
}

export function SendReminderModal({
  isOpen,
  onClose,
  agreementId,
  agreementTitle,
  recipients = [],
  onSuccess,
}: SendReminderModalProps) {
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('all');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const token =
      localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';

    try {
      const payload: { recipientId?: string; note?: string } = {};
      if (selectedRecipientId && selectedRecipientId !== 'all') {
        payload.recipientId = selectedRecipientId;
      }
      if (note.trim()) {
        payload.note = note.trim();
      }

      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${agreementId}/remind`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to dispatch reminders');
      }

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while sending reminders';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const pendingRecipients = recipients.filter(
    (r) => r.status !== 'SIGNED' && r.status !== 'DECLINED',
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-reminder-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div>
            <h3
              id="send-reminder-title"
              className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"
            >
              <span>⚡</span> Send Signing Reminder
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-sm mt-0.5">
              {agreementTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close reminder modal"
            className="rounded-lg p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
              Send Reminder To
            </label>
            <select
              value={selectedRecipientId}
              onChange={(e) => setSelectedRecipientId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none transition"
            >
              <option value="all">All Pending Signers</option>
              {pendingRecipients.map((r) => (
                <option key={r.id || r.email} value={r.id || r.email}>
                  {r.name} ({r.email})
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-400 mt-1">
              Recipients will receive a refreshed signing link and direct access to sign the
              document.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
              Personalized Note (Optional)
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder="e.g., Hi team, just a friendly reminder to review and sign before tomorrow's deadline."
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm placeholder-zinc-400 focus:ring-2 focus:ring-amber-500 focus:outline-none transition resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm focus:ring-2 focus:ring-amber-500 focus:outline-none transition flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Dispatching...</span>
                </>
              ) : (
                <span>Send Reminder Now</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
