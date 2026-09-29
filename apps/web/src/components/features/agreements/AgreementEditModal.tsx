'use client';
import { agreementReturnUrl } from '@/lib/agreement-navigation';

import React, { useState, useEffect } from 'react';
import { useEditorDialog } from './useEditorDialog';
import { MarkdownEditor } from './MarkdownEditor';
import { ExternalLink, LoaderCircle, PenLine, X } from 'lucide-react';
import { getApiUrl } from '@/lib/api';

interface AgreementEditModalProps {
  mode?: 'create' | 'edit';
  fullPage?: boolean;
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
  mode = 'edit',
  fullPage = false,
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
  const [version, setVersion] = useState(currentVersion);
  const [title, setTitle] = useState(initialTitle || '');
  const [description, setDescription] = useState(initialDescription || '');
  const [markdown, setMarkdown] = useState(initialMarkdown || '');
  const [tags, setTags] = useState<string[]>(initialTags || []);
  const [tagInput, setTagInput] = useState('');

  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(
    !initialMarkdown && !!agreementId,
  );

  const dialogRef = useEditorDialog(fullPage, onClose, saving || activating);

  // Fetch full agreement details if markdownContent was omitted in list query
  useEffect(() => {
    if (!initialMarkdown && agreementId) {
      let isMounted = true;
      async function loadFullAgreement() {
        try {
          const res = await fetch(`${getApiUrl()}/api/v1/agreements/${agreementId}`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          });
          if (!res.ok) throw new Error('Unable to load agreement content.');
          if (res.ok) {
            const data = await res.json();
            if (isMounted) {
              if (data.markdownContent) setMarkdown(data.markdownContent);
              if (data.title) setTitle((prev) => prev || data.title);
              if (data.description) setDescription((prev) => prev || data.description);
              if (data.tags) setTags((prev) => (prev.length === 0 ? data.tags : prev));
            }
          }
        } catch (e) {
          if (isMounted)
            setError('Unable to load agreement content. Close the editor and try again.');
          console.error('Failed to load full agreement details:', e);
        } finally {
          if (isMounted) {
            setIsLoadingDetails(false);
          }
        }
      }
      loadFullAgreement();
      return () => {
        isMounted = false;
      };
    }
  }, [agreementId, initialMarkdown]);

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

  async function handleSaveDraft(e?: React.FormEvent, openInNewTab = false) {
    if (e) e.preventDefault();
    const cleanTitle = (title || '').trim();
    if (!cleanTitle || cleanTitle.length < 2) {
      setError('Agreement title must be at least 2 characters long.');
      return;
    }
    if (cleanTitle.length > 50) {
      setError('Agreement title must not exceed 50 characters.');
      return;
    }
    const cleanDesc = (description || '').trim();
    if (cleanDesc.length > 260) {
      setError('Description / Reference must not exceed 260 characters.');
      return;
    }

    if (!markdown.trim()) {
      setError('Agreement terms are required.');
      return;
    }
    const editorTab = openInNewTab ? window.open('about:blank', '_blank') : null;
    if (openInNewTab && !editorTab) {
      setError('Your browser blocked the new tab. Allow pop-ups for this site and try again.');
      return;
    }
    if (editorTab) editorTab.opener = null;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(
        mode === 'create'
          ? `${getApiUrl()}/api/v1/agreements/scratch`
          : `${getApiUrl()}/api/v1/agreements/${agreementId}/draft`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            title: cleanTitle,
            ...(mode === 'edit' ? { expectedVersion: String(version).replace(/^v/, '') } : {}),
            description: cleanDesc || undefined,
            markdownContent: markdown || '',
            tags: tags || [],
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || data?.message || 'Failed to save agreement draft.');
      }

      const updated = await res.json();
      setVersion(updated.version);
      onSuccess(
        mode === 'create'
          ? `Agreement draft created successfully (v${updated.version}).`
          : `Agreement draft saved successfully (updated to v${updated.version}).`,
      );
      if (editorTab)
        editorTab.location.replace(
          '/agreements/edit?id=' +
            encodeURIComponent(updated.id || agreementId) +
            '&returnTo=' +
            encodeURIComponent(
              agreementReturnUrl(window.location.pathname + window.location.search),
            ),
        );
      if (!fullPage) onClose();
    } catch (err: unknown) {
      editorTab?.close();
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
    if (cleanTitle.length > 50) {
      setError('Agreement title must not exceed 50 characters.');
      setActivating(false);
      return;
    }
    const cleanDesc = (description || '').trim();
    if (cleanDesc.length > 260) {
      setError('Description / Reference must not exceed 260 characters.');
      setActivating(false);
      return;
    }

    try {
      // First save current edits if any
      const saved = await fetch(`${getApiUrl()}/api/v1/agreements/${agreementId}/draft`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          title: cleanTitle,
          description: cleanDesc || undefined,
          markdownContent: markdown || '',
          tags: tags || [],
        }),
      });

      if (!saved.ok) throw new Error('Failed to save agreement. Your agreement was not activated.');

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

  const versionDisplay = String(version).startsWith('v') ? version : `v${version}`;

  return (
    <div
      ref={dialogRef}
      role={fullPage ? undefined : 'dialog'}
      aria-modal={fullPage ? undefined : true}
      aria-labelledby="agreement-editor-title"
      className={
        fullPage
          ? 'min-h-screen bg-ink-50 p-4 md:p-8'
          : 'fixed inset-0 z-50 bg-ink-950/55 flex items-center justify-center p-2 sm:p-4 md:p-6'
      }
    >
      <div
        className={
          fullPage
            ? 'bg-white border border-neutral-200 rounded-2xl p-4 md:p-6 w-full flex flex-col min-h-[calc(100vh-4rem)]'
            : 'bg-white border border-neutral-200 rounded-2xl p-4 md:p-6 max-w-5xl w-full shadow-2xl flex flex-col my-auto max-h-[95vh] overflow-y-auto'
        }
      >
        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 pb-4 mb-4">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <PenLine className="h-5 w-5 shrink-0" aria-hidden="true" />
              <h2 id="agreement-editor-title" className="text-lg font-bold text-neutral-900">
                {mode === 'create' ? 'Create agreement from scratch' : 'Edit Agreement Document'}
              </h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                {currentStatus} {versionDisplay}
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              {mode === 'create'
                ? 'Write and preview your agreement, then save it as a draft.'
                : 'Edit document terms in Markdown. Save your changes before leaving.'}
            </p>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {!fullPage && (
              <button
                type="button"
                onClick={() => handleSaveDraft(undefined, true)}
                disabled={saving || activating || isLoadingDetails}
                className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 disabled:opacity-50"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Save & open in new tab
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={saving || activating || isLoadingDetails}
              aria-label={fullPage ? 'Back to agreements' : 'Close editor'}
              className="p-1 text-neutral-400 hover:text-neutral-700 text-lg font-bold"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {isLoadingDetails && (
          <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs font-medium text-blue-700 flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading full agreement content...</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700 flex items-center justify-between"
          >
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-bold text-red-700">
              ×
            </button>
          </div>
        )}

        {/* Document Form */}
        <fieldset
          disabled={saving || activating || isLoadingDetails}
          className="space-y-4 flex-1 min-w-0"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="agreement-title"
                  className="block text-xs font-semibold text-neutral-700"
                >
                  Agreement Title *
                </label>
                <span className="text-[10px] text-neutral-400">{title.length}/50</span>
              </div>
              <input
                type="text"
                required
                id="agreement-title"
                maxLength={50}
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 50))}
                placeholder="e.g. Master Services Agreement 2026"
                className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="agreement-description"
                  className="block text-xs font-semibold text-neutral-700"
                >
                  Description / Reference (Optional)
                </label>
                <span className="text-[10px] text-neutral-400">{description.length}/260</span>
              </div>
              <input
                type="text"
                id="agreement-description"
                maxLength={260}
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 260))}
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
              minHeight={fullPage ? '60vh' : '340px'}
            />
          </div>
        </fieldset>

        {/* Modal Action Footer */}
        {currentStatus === 'DRAFT' && (
          <p className="text-sm text-ink-700 mt-4" role="note">
            Finalizing saves the document as an active agreement ready for signing. It does not send
            signing invitations. Review the terms before finalizing; further term changes require a
            draft revision.
          </p>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-5 mt-4 border-t border-neutral-200">
          <div>
            {mode === 'edit' && currentStatus === 'DRAFT' && (
              <button
                type="button"
                onClick={handleMoveToActive}
                disabled={activating || saving || isLoadingDetails}
                className="w-full sm:w-auto px-4 py-2 bg-green-700 hover:bg-green-800 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {activating ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Activating Document...</span>
                  </>
                ) : (
                  <>
                    <PenLine className="h-4 w-4" aria-hidden="true" /> Finalize & make ready for
                    signing
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || activating || isLoadingDetails}
              className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSaveDraft()}
              disabled={saving || activating || isLoadingDetails}
              className="px-5 py-2 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Saving Draft...</span>
                </>
              ) : (
                <>{mode === 'create' ? 'Create Draft' : 'Save Draft (Minor Bump)'}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
