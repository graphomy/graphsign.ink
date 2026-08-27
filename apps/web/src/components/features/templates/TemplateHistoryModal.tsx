'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/api';
import { formatDate } from '@/lib/date-utils';

interface TemplateVersionItem {
  id: string;
  version: number;
  title: string;
  changeSummary?: string | null;
  createdAt: string;
  author?: {
    name?: string | null;
    email: string;
  };
}

interface TemplateHistoryModalProps {
  templateId: string;
  templateTitle: string;
  onClose: () => void;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

export function TemplateHistoryModal({
  templateId,
  templateTitle,
  onClose,
}: TemplateHistoryModalProps) {
  const [versions, setVersions] = useState<TemplateVersionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function loadVersions() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${getApiUrl()}/api/v1/templates/${templateId}/versions`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error('Failed to load template version history.');
        const data = await res.json();
        if (!ignore && Array.isArray(data)) {
          setVersions(data);
        }
      } catch (err: unknown) {
        if (!ignore) setError((err as Error).message);
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }
    loadVersions();
    return () => {
      ignore = true;
    };
  }, [templateId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-neutral-900 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <div>
            <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
              <span>🕒</span> Template Version History
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5 truncate max-w-sm font-medium">
              {templateTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 text-lg font-bold p-1"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 font-medium">
            ⚠️ {error}
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-xs text-neutral-500">Loading version timeline...</div>
        ) : versions.length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-400">
            No version history records found.
          </div>
        ) : (
          <div className="space-y-3">
            {versions.map((ver, idx) => (
              <div
                key={ver.id}
                className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl space-y-1 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-900 flex items-center gap-1.5">
                    <span className="bg-[#ba0000] text-white px-1.5 py-0.5 rounded text-[10px] font-mono">
                      v{ver.version}.0
                    </span>
                    <span>{ver.title}</span>
                    {idx === 0 && (
                      <span className="bg-green-100 text-green-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                        Latest
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    {formatDate(ver.createdAt)}
                  </span>
                </div>
                <p className="text-neutral-600 text-[11px] italic">
                  {ver.changeSummary || 'Version revision'}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-neutral-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
