'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/api';

interface HistoryEntry {
  id: string;
  action: string;
  summary: string;
  version?: string;
  user: {
    id?: string;
    name?: string;
    email?: string;
  };
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface AgreementHistoryModalProps {
  agreementId: string;
  agreementTitle: string;
  currentVersion: string | number;
  onClose: () => void;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

export function AgreementHistoryModal({
  agreementId,
  agreementTitle,
  currentVersion,
  onClose,
}: AgreementHistoryModalProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function loadHistory() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${getApiUrl()}/api/v1/agreements/${agreementId}/history`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });

        if (!res.ok) {
          throw new Error('Failed to load agreement history.');
        }

        const data = await res.json();
        if (!ignore) {
          setHistory(data || []);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError((err as Error).message);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadHistory();
    return () => {
      ignore = true;
    };
  }, [agreementId]);

  function getActionBadgeColor(action: string) {
    if (action.includes('ACTIVATED')) {
      return 'bg-green-100 text-green-800 border-green-200';
    }
    if (action.includes('CREATED') || action.includes('UPLOADED')) {
      return 'bg-blue-100 text-blue-800 border-blue-200';
    }
    if (action.includes('ARCHIVED')) {
      return 'bg-neutral-200 text-neutral-800 border-neutral-300';
    }
    return 'bg-amber-100 text-amber-800 border-amber-200';
  }

  function getActionIcon(action: string) {
    if (action.includes('ACTIVATED')) return '🚀';
    if (action.includes('CREATED')) return '✨';
    if (action.includes('UPLOADED')) return '📄';
    if (action.includes('DRAFT_UPDATED')) return '✏️';
    if (action.includes('ARCHIVED')) return '📦';
    if (action.includes('UNARCHIVED')) return '📂';
    if (action.includes('CLONED')) return '📋';
    if (action.includes('METADATA')) return '🏷️';
    return '🕒';
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 mb-4">
          <div>
            <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <span>🕒</span> Agreement History
            </h2>
            <p className="text-xs text-neutral-500 truncate max-w-sm mt-0.5">
              {agreementTitle} • Current: <span className="font-semibold">v{currentVersion}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-700 text-lg font-bold rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-xs font-medium text-neutral-500">
              Loading change history...
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-xs font-medium text-neutral-400">
              No audit history recorded for this agreement.
            </div>
          ) : (
            <div className="relative border-l-2 border-neutral-200 ml-3 pl-5 space-y-4 py-2">
              {history.map((item) => (
                <div key={item.id} className="relative group">
                  {/* Timeline Dot */}
                  <div className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full bg-white border-2 border-neutral-400 group-hover:border-[#ba0000] transition-colors flex items-center justify-center text-[8px]" />

                  <div className="bg-neutral-50 hover:bg-neutral-100/80 p-3 rounded-xl border border-neutral-200 transition-colors space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border ${getActionBadgeColor(
                          item.action,
                        )}`}
                      >
                        <span>{getActionIcon(item.action)}</span>
                        {item.summary}
                      </span>
                      <span className="text-[10px] text-neutral-400 whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1">
                      <span className="font-medium text-neutral-700">
                        👤 {item.user?.name || item.user?.email || 'System'}
                      </span>
                      {item.version && (
                        <span className="text-[10px] font-mono font-semibold bg-white px-1.5 py-0.5 rounded border border-neutral-200">
                          v{item.version}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-neutral-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
