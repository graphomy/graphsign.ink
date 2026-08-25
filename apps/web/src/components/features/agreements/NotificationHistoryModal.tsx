'use client';

import React, { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api';

export interface NotificationLogItem {
  id: string;
  recipientEmail: string;
  recipientName?: string | null;
  eventType: string;
  channel: string;
  status: string;
  providerMessageId?: string | null;
  attempts: number;
  lastError?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

interface NotificationHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  agreementId: string;
  agreementTitle: string;
}

export function NotificationHistoryModal({
  isOpen,
  onClose,
  agreementId,
  agreementTitle,
}: NotificationHistoryModalProps) {
  const [logs, setLogs] = useState<NotificationLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !agreementId) return;

    let isMounted = true;
    const token =
      localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';

    fetch(`${getApiUrl()}/api/v1/agreements/${agreementId}/notifications`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load notification history');
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setLogs(data?.data?.logs || []);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          const message = err instanceof Error ? err.message : 'Error fetching notifications';
          setError(message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, agreementId]);

  if (!isOpen) return null;

  const getEventBadge = (eventType: string) => {
    switch (eventType) {
      case 'INVITATION':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
            Invitation
          </span>
        );
      case 'REMINDER':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            Reminder
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            Completed
          </span>
        );
      case 'DECLINED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
            Declined
          </span>
        );
      case 'EXPIRY_WARNING':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
            Expiry Warning
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
            Expired
          </span>
        );
      case 'REVIEW_REQUEST':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
            Review Request
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
            {eventType}
          </span>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'SENT' || status === 'DELIVERED') {
      return (
        <span className="inline-flex items-center text-xs font-medium text-emerald-600 dark:text-emerald-400">
          ✓ {status}
        </span>
      );
    }
    if (status === 'FAILED' || status === 'BOUNCED') {
      return (
        <span className="inline-flex items-center text-xs font-medium text-rose-600 dark:text-rose-400">
          ✕ {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center text-xs font-medium text-slate-500">{status}</span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-history-title"
    >
      <div className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div>
            <h3
              id="notification-history-title"
              className="text-lg font-bold text-zinc-900 dark:text-zinc-100"
            >
              Notification & Delivery History
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-lg mt-0.5">
              {agreementTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close notification history"
            className="rounded-lg p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400 space-y-3">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium">Loading delivery events...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-sm">
              {error}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 space-y-2">
              <p className="text-sm font-medium">No notification events recorded yet.</p>
              <p className="text-xs text-zinc-400">
                Events are logged automatically when invitations, reminders, and notices are
                dispatched.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Event</th>
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Attempts</th>
                    <th className="py-3 px-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition"
                    >
                      <td className="py-3 px-4">{getEventBadge(log.eventType)}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100">
                          {log.recipientName || log.recipientEmail}
                        </div>
                        {log.recipientName && (
                          <div className="text-xs text-zinc-400">{log.recipientEmail}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {getStatusBadge(log.status)}
                        {log.lastError && (
                          <div
                            className="text-xs text-rose-500 truncate max-w-xs mt-0.5"
                            title={log.lastError}
                          >
                            {log.lastError}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-zinc-500">
                        {log.attempts} {log.attempts === 1 ? 'try' : 'tries'}
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-zinc-400 whitespace-nowrap">
                        {new Date(log.sentAt || log.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
