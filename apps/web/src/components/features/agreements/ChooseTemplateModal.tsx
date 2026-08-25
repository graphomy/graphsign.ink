'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/api';

export interface TemplateItem {
  id: string;
  title: string;
  description?: string;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
  htmlContent?: string;
  version: number;
  isPublished: boolean;
  isArchived: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  author?: { name?: string; email: string };
}

interface ChooseTemplateModalProps {
  onClose: () => void;
  onSuccess: (message: string) => void;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

export function ChooseTemplateModal({ onClose, onSuccess }: ChooseTemplateModalProps) {
  const [activeTab, setActiveTab] = useState<'library' | 'mine'>('library');
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [instantiatingId, setInstantiatingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function loadTemplates() {
      setLoading(true);
      setErrorMessage(null);
      try {
        let url = `${getApiUrl()}/api/v1/templates?view=${activeTab}`;
        if (searchQuery.trim()) {
          url += `&search=${encodeURIComponent(searchQuery.trim())}`;
        }

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });

        if (res.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('graphsign_session_token');
          window.location.href = '/login?reason=session_expired';
          return;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(
            errData?.error?.message || errData?.message || 'Failed to load templates.',
          );
        }

        const data = await res.json();
        if (!ignore) {
          setTemplates(data.items || []);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setErrorMessage((err as Error).message);
          setTemplates([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadTemplates();
    return () => {
      ignore = true;
    };
  }, [activeTab, searchQuery]);

  async function handleInstantiate(template: TemplateItem) {
    if (instantiatingId) return;
    setInstantiatingId(template.id);
    setErrorMessage(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates/${template.id}/instantiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error?.message || data?.message || 'Failed to instantiate agreement from template.',
        );
      }

      onSuccess(`Agreement draft created from template "${template.title}" (v0.1).`);
      onClose();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    } finally {
      setInstantiatingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 max-w-3xl w-full shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-200">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
              <span>📐</span> Create Agreement from Template
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Select a reusable blueprint to generate a new agreement draft.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 text-lg font-bold p-1 rounded-md"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700 flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-700 font-bold hover:underline"
            >
              ×
            </button>
          </div>
        )}

        {/* Tabs & Search */}
        <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('library')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'library'
                  ? 'bg-white text-neutral-900 shadow-xs border border-neutral-200'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Organization Library
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('mine')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'mine'
                  ? 'bg-white text-neutral-900 shadow-xs border border-neutral-200'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              My Templates
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
            />
          </div>
        </div>

        {/* Template List Grid */}
        <div className="flex-1 overflow-y-auto pr-1 py-1 space-y-3">
          {loading ? (
            <div className="text-center py-16 text-xs text-neutral-500">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-14 bg-neutral-50 border border-dashed border-neutral-200 rounded-xl p-6 space-y-2">
              <div className="text-2xl">📐</div>
              <p className="text-xs font-semibold text-neutral-700">No templates found.</p>
              <p className="text-[11px] text-neutral-500 max-w-xs mx-auto">
                {activeTab === 'library'
                  ? 'No published organization templates available. Publish a template from your library to make it available.'
                  : 'You have not created any templates yet. Go to Templates to create one.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="bg-neutral-50/70 border border-neutral-200 rounded-xl p-4 flex flex-col justify-between hover:border-neutral-300 transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          tpl.isPublished
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-neutral-200 text-neutral-700'
                        }`}
                      >
                        {tpl.isPublished ? 'Published' : 'Draft'}
                      </span>
                      <span className="text-[10px] font-semibold text-neutral-500 bg-white px-2 py-0.5 rounded border border-neutral-200">
                        v{tpl.version}.0
                      </span>
                    </div>

                    <h3 className="text-xs font-bold text-neutral-900 mb-1 line-clamp-1">
                      {tpl.title}
                    </h3>
                    <p className="text-[11px] text-neutral-600 mb-3 line-clamp-2">
                      {tpl.description || 'No description provided.'}
                    </p>

                    {tpl.tags && tpl.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {tpl.tags.map((t, idx) => (
                          <span
                            key={idx}
                            className="text-[9px] font-semibold bg-white text-neutral-600 px-1.5 py-0.5 rounded border border-neutral-200"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-neutral-200 flex items-center justify-between">
                    <span className="text-[10px] text-neutral-500">
                      {tpl.author?.name || tpl.author?.email || 'Author'}
                    </span>
                    <button
                      type="button"
                      disabled={instantiatingId === tpl.id}
                      onClick={() => handleInstantiate(tpl)}
                      className="px-3 py-1.5 bg-[#ba0000] hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-2xs transition-all flex items-center gap-1"
                    >
                      {instantiatingId === tpl.id ? (
                        'Creating Draft...'
                      ) : (
                        <>
                          <span>✨</span> Use Template
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-neutral-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
