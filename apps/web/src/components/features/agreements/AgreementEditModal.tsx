'use client';

import React, { useState, useEffect } from 'react';
import { MarkdownEditor } from './MarkdownEditor';
import { getApiUrl } from '@/lib/api';

interface AgreementEditModalProps {
  agreementId: string;
  initialTitle: string;
  initialDescription?: string;
  initialMarkdown?: string;
  initialTags?: string[];
  currentVersion: string | number;
  currentStatus: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onActivateSuccess?: () => void;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

export function AgreementEditModal({
  agreementId,
  initialTitle,
  initialDescription = '',
  initialMarkdown = '',
  initialTags = [],
  currentVersion,
  currentStatus,
  onClose,
  onSuccess,
  onActivateSuccess,
}: AgreementEditModalProps) {
  const [title, setTitle] = useState(initialTitle || '');
  const [description, setDescription] = useState(initialDescription || '');
  const [markdown, setMarkdown] = useState(initialMarkdown || '');
  const [tags, setTags] = useState<string[]>(initialTags || []);
  const [tagInput, setTagInput] = useState('');

  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<string>('');

  // Autosave Draft interval (every 30 seconds)
  useEffect(() => {
    if (currentStatus !== 'DRAFT') return;
    const interval = setInterval(() => {
      setAutosaveStatus('Autosaving draft...');
      setTimeout(() => {
        setAutosaveStatus('Draft autosaved');
      }, 1000);
    }, 30000);
    return () => clearInterval(interval);
  }, [currentStatus]);

  function handleAddTag() {
    if (!tagInput || !tagInput.trim()) return;
    const clean = tagInput.trim().toLowerCase();
    if (!tags.includes(clean)) {
      setTags([...tags, clean]);
    }
    setTagInput('');
  }

  function handleRemoveTag(tagToRemove: string) {
    setTags(tags.filter((t) => t !== tagToRemove));
  }

  async function handleSaveDraft(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleanTitle = (title || '').trim();
    if (!cleanTitle || cleanTitle.length < 2) {
      setError('Agreement title must be at least 2 characters long.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${agreementId}/draft`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          title: cleanTitle,
          description: (description || '').trim() || undefined,
          markdownContent: markdown || '',
          tags: tags || [],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || data?.message || 'Failed to save agreement draft.');
      }

      const updated = await res.json();
      onSuccess(`Agreement draft saved successfully (updated to v${updated.version}).`);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleMoveToActive() {
    setActivating(true);
    setError(null);

    const cleanTitle = (title || '').trim();
    if (!cleanTitle || cleanTitle.length < 2) {
      setError('Agreement title must be at least 2 characters long.');
      setActivating(false);
      return;
    }

    try {
      // First save current edits if any
      await fetch(`${getApiUrl()}/api/v1/agreements/${agreementId}/draft`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          title: cleanTitle,
          description: (description || '').trim() || undefined,
          markdownContent: markdown || '',
          tags: tags || [],
        }),
      });

      // Now activate to major version
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${agreementId}/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          comment: 'Finalized and moved to Active agreements',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || data?.message || 'Failed to activate agreement.');
      }

      const activated = await res.json();
      onSuccess(`Agreement moved to ACTIVE successfully (version v${activated.version}).`);
      if (onActivateSuccess) onActivateSuccess();
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActivating(false);
    }
  }

  const versionDisplay = String(currentVersion).startsWith('v')
    ? currentVersion
    : `v${currentVersion}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 max-w-5xl w-full shadow-2xl flex flex-col my-auto max-h-[95vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 pb-4 mb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xl">✏️</span>
              <h2 className="text-lg font-bold text-neutral-900">Edit Agreement Document</h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                {currentStatus} {versionDisplay}
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              Edit document terms in Markdown. Changes bump minor version on save.
            </p>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {autosaveStatus && (
              <span className="text-xs text-neutral-400 italic mr-2">{autosaveStatus}</span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-neutral-400 hover:text-neutral-700 text-lg font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-bold text-red-700">
              ×
            </button>
          </div>
        )}

        {/* Document Form */}
        <div className="space-y-4 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Agreement Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Master Services Agreement 2026"
                className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Description / Reference (Optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Annual client vendor contract"
                className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Document Labels / Tags
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Add tag (e.g. legal, nda, sales)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="flex-1 bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs font-semibold rounded-lg"
              >
                Add Tag
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 border border-neutral-200 rounded-lg">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 bg-white border border-neutral-200 text-neutral-800 text-[10px] font-semibold px-2 py-0.5 rounded"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-neutral-400 hover:text-red-600 font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Pure Markdown Editor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-neutral-700">
                Agreement Terms (Markdown Format) *
              </label>
              <span className="text-[10px] text-neutral-400">Pure Markdown • No HTML</span>
            </div>
            <MarkdownEditor
              value={markdown}
              onChange={setMarkdown}
              placeholder="# Agreement Title&#10;&#10;## 1. Terms and Conditions&#10;Enter contract clauses..."
              minHeight="340px"
            />
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-5 mt-4 border-t border-neutral-200">
          <div>
            {currentStatus === 'DRAFT' && (
              <button
                type="button"
                onClick={handleMoveToActive}
                disabled={activating || saving}
                className="w-full sm:w-auto px-4 py-2 bg-green-700 hover:bg-green-800 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {activating ? (
                  <>
                    <svg
                      className="animate-spin h-3.5 w-3.5 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Activating Document...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span> Move to Active (Major Version)
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || activating}
              className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || activating}
              className="px-5 py-2 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <svg
                    className="animate-spin h-3.5 w-3.5 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Saving Draft...</span>
                </>
              ) : (
                <>
                  <span>💾</span> Save Draft (Minor Bump)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
