'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { Footer } from '@/components/layout/Footer';
import { MarkdownEditor } from '@/components/features/agreements/MarkdownEditor';
import { PdfViewerModal } from '@/components/features/agreements/PdfViewerModal';
import { AgreementHistoryModal } from '@/components/features/agreements/AgreementHistoryModal';
import { AgreementEditModal } from '@/components/features/agreements/AgreementEditModal';
import { getApiUrl } from '@/lib/api';

interface AgreementItem {
  id: string;
  title: string;
  description?: string;
  status: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  markdownContent?: string;
  version: string | number;
  isArchived: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  author?: { name?: string; email: string };
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

function AgreementManagementContent() {
  const [activeTab, setActiveTab] = useState<'active' | 'drafts' | 'archived'>('active');
  const [agreements, setAgreements] = useState<AgreementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modals state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showScratchModal, setShowScratchModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState<AgreementItem | null>(null);

  // Form states
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [uploadTagInput, setUploadTagInput] = useState('');

  const [scratchTitle, setScratchTitle] = useState('');
  const [scratchDesc, setScratchDesc] = useState('');
  const [scratchMarkdown, setScratchMarkdown] = useState(
    '# Standard Agreement\n\n## 1. Scope and Terms\nEnter contract clauses, obligations, and deliverables in pure Markdown.\n\n## 2. Term & Termination\nThis agreement is effective upon mutual execution.\n',
  );
  const [scratchTags, setScratchTags] = useState<string[]>([]);
  const [scratchTagInput, setScratchTagInput] = useState('');

  const [tagInput, setTagInput] = useState('');
  const [tagsList, setTagsList] = useState<string[]>([]);

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const action = searchParams?.get('action');
    if (action === 'upload') {
      queueMicrotask(() => setShowUploadModal(true));
    } else if (action === 'scratch') {
      queueMicrotask(() => setShowScratchModal(true));
    }
  }, [searchParams]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        const isArchivedParam = activeTab === 'archived' ? 'true' : 'false';
        const statusParam =
          activeTab === 'drafts' ? 'DRAFT' : activeTab === 'active' ? 'ACTIVE' : '';
        let url = `${getApiUrl()}/api/v1/agreements?isArchived=${isArchivedParam}`;
        if (statusParam) url += `&status=${statusParam}`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
        if (tagFilter) url += `&tag=${encodeURIComponent(tagFilter)}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });

        if (!res.ok) throw new Error('Failed to load agreements.');
        const data = await res.json();
        if (!ignore) {
          setAgreements(data.items || []);
        }
      } catch (err: unknown) {
        if (!ignore) {
          console.error(err);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [activeTab, searchQuery, tagFilter, refreshTrigger]);

  function handleAddUploadTag() {
    if (!uploadTagInput.trim()) return;
    const tag = uploadTagInput.trim().toLowerCase();
    if (!uploadTags.includes(tag)) {
      setUploadTags([...uploadTags, tag]);
    }
    setUploadTagInput('');
  }

  function handleAddScratchTag() {
    if (!scratchTagInput.trim()) return;
    const tag = scratchTagInput.trim().toLowerCase();
    if (!scratchTags.includes(tag)) {
      setScratchTags([...scratchTags, tag]);
    }
    setScratchTagInput('');
  }

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActionMessage(null);

    if (!uploadFile) {
      setActionError('Please select a valid document file (.pdf, .docx, or .md).');
      return;
    }

    try {
      const isMd =
        uploadFile.name.toLowerCase().endsWith('.md') ||
        uploadFile.type === 'text/markdown' ||
        uploadFile.type === 'text/plain';

      let markdownContent: string | undefined = undefined;
      if (isMd) {
        markdownContent = await uploadFile.text();
      }

      const res = await fetch(`${getApiUrl()}/api/v1/agreements/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          title: uploadTitle || uploadFile.name.replace(/\.[^/.]+$/, ''),
          fileName: uploadFile.name,
          fileSize: uploadFile.size,
          mimeType: isMd ? 'text/markdown' : uploadFile.type || 'application/pdf',
          markdownContent,
          tags: uploadTags,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || data?.message || 'Failed to upload agreement.');
      }

      await res.json();
      if (isMd) {
        setActionMessage('Markdown agreement uploaded successfully as Draft (v0.1).');
        setActiveTab('drafts');
      } else {
        setActionMessage('Agreement uploaded and converted to active PDF (v1.0).');
        setActiveTab('active');
      }

      setShowUploadModal(false);
      setUploadTitle('');
      setUploadFile(null);
      setUploadTags([]);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handleScratchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActionMessage(null);

    if (!scratchTitle || scratchTitle.trim().length < 2) {
      setActionError('Agreement title must be at least 2 characters long.');
      return;
    }

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/scratch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          title: scratchTitle.trim(),
          description: scratchDesc.trim() || undefined,
          markdownContent: scratchMarkdown,
          tags: scratchTags,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || data?.message || 'Failed to create agreement.');
      }

      setActionMessage('Agreement draft created from scratch successfully (v0.1).');
      setShowScratchModal(false);
      setScratchTitle('');
      setScratchDesc('');
      setScratchTags([]);
      setActiveTab('drafts');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handleClone(id: string) {
    setActionError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${id}/clone`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error('Failed to clone agreement.');
      setActionMessage('Agreement cloned successfully into a new draft (v0.1).');
      setActiveTab('drafts');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handleArchiveToggle(id: string, isArchived: boolean) {
    setActionError(null);
    try {
      const endpoint = isArchived ? 'archive' : 'unarchive';
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${id}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error('Failed to update archive status.');
      setActionMessage(`Agreement ${isArchived ? 'archived' : 'unarchived'} successfully.`);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  function openEditModal(agreement: AgreementItem) {
    setSelectedAgreement(agreement);
    setShowEditModal(true);
  }

  function openPdfViewer(agreement: AgreementItem) {
    setSelectedAgreement(agreement);
    setShowPdfModal(true);
  }

  function openHistoryModal(agreement: AgreementItem) {
    setSelectedAgreement(agreement);
    setShowHistoryModal(true);
  }

  function openMetadataModal(agreement: AgreementItem) {
    setSelectedAgreement(agreement);
    setTagsList(agreement.tags || []);
    setTagInput('');
    setShowMetadataModal(true);
  }

  function handleAddTag() {
    if (!tagInput.trim()) return;
    const cleanTag = tagInput.trim().toLowerCase();
    if (!tagsList.includes(cleanTag)) {
      setTagsList([...tagsList, cleanTag]);
    }
    setTagInput('');
  }

  function handleRemoveTag(tagToRemove: string) {
    setTagsList(tagsList.filter((t) => t !== tagToRemove));
  }

  async function handleSaveTags() {
    if (!selectedAgreement) return;
    setActionError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${selectedAgreement.id}/metadata`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          tags: tagsList,
        }),
      });

      if (!res.ok) throw new Error('Failed to update tags.');
      setActionMessage('Agreement tags updated successfully.');
      setShowMetadataModal(false);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  function formatVersion(ver: string | number) {
    const s = String(ver);
    return s.startsWith('v') || s.startsWith('V') ? s : `v${s}`;
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col font-sans text-neutral-900">
      <HeaderNav />

      <main className="flex-1 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Top Breadcrumb & Action Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1 text-xs font-bold text-[#ba0000] hover:underline bg-red-50 px-2.5 py-1 rounded border border-red-200"
              >
                ← Back to Dashboard
              </Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 flex items-center gap-2.5">
              <span>📑</span> Agreement Management
            </h1>
            <p className="text-xs text-neutral-600">
              Draft contracts in Markdown, convert to verified PDFs, manage semantic versions and
              audit history.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <button
              onClick={() => {
                setActionError(null);
                setShowUploadModal(true);
              }}
              className="px-4 py-2 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>📄</span> Upload PDF/DOCX/MD
            </button>
            <button
              onClick={() => {
                setActionError(null);
                setShowScratchModal(true);
              }}
              className="px-4 py-2 bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-800 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>✏️</span> Create from Scratch
            </button>
          </div>
        </div>

        {/* Global Notifications Banners */}
        {actionMessage && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-xs font-medium text-green-800 flex items-center justify-between shadow-2xs">
            <span>{actionMessage}</span>
            <button onClick={() => setActionMessage(null)} className="font-bold text-green-700">
              ×
            </button>
          </div>
        )}
        {actionError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700 flex items-center justify-between shadow-2xs">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="font-bold text-red-700">
              ×
            </button>
          </div>
        )}

        {/* Navigation Tabs & Search Controls */}
        <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'active'
                  ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Active Agreements
            </button>
            <button
              onClick={() => setActiveTab('drafts')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'drafts'
                  ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Drafts Only
            </button>
            <button
              onClick={() => setActiveTab('archived')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'archived'
                  ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Archived
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
            />
            <input
              type="text"
              placeholder="Filter tag..."
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000] w-28"
            />
          </div>
        </div>

        {/* Agreements Grid */}
        {loading ? (
          <div className="text-center py-16 text-xs font-medium text-neutral-500 bg-white rounded-xl border border-neutral-200">
            Loading agreements...
          </div>
        ) : agreements.length === 0 ? (
          <div className="text-center py-16 bg-white border border-dashed border-neutral-300 rounded-xl p-8 space-y-3">
            <div className="h-12 w-12 rounded-full bg-neutral-100 text-neutral-400 mx-auto flex items-center justify-center text-xl">
              📄
            </div>
            <p className="text-sm font-semibold text-neutral-800">
              No agreements found in {activeTab}.
            </p>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Draft a new agreement in Markdown or upload documents to send for signatures.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => setShowScratchModal(true)}
                className="px-4 py-2 bg-[#ba0000] text-white text-xs font-semibold rounded-lg"
              >
                Create from Scratch
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agreements.map((agreement) => (
              <div
                key={agreement.id}
                className="bg-white border border-neutral-200 rounded-xl p-5 hover:border-neutral-300 shadow-sm transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wider ${
                        agreement.status === 'ACTIVE' ||
                        agreement.status === 'COMPLETED' ||
                        agreement.status === 'SEALED'
                          ? 'bg-green-100 text-green-800 border border-green-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {agreement.status}
                    </span>
                    <span className="text-[11px] font-semibold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                      {formatVersion(agreement.version)}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-neutral-900 mb-1.5 line-clamp-1">
                    {agreement.title}
                  </h3>
                  <p className="text-xs text-neutral-500 mb-4 line-clamp-2">
                    {agreement.description ||
                      (agreement.markdownContent
                        ? agreement.markdownContent.substring(0, 120)
                        : agreement.fileName || 'No description provided.')}
                  </p>

                  {/* Tags Pills */}
                  {agreement.tags && agreement.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {agreement.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] font-semibold bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded border border-neutral-200"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Action Controls */}
                <div className="pt-3 border-t border-neutral-100 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {/* Pencil Edit Mode Button */}
                    <button
                      onClick={() => openEditModal(agreement)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-[#ba0000] bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors flex items-center gap-1"
                      title="Edit Document"
                    >
                      <span>✏️</span> Edit
                    </button>

                    {/* View PDF Button */}
                    <button
                      onClick={() => openPdfViewer(agreement)}
                      className="px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors flex items-center gap-1"
                      title="View PDF"
                    >
                      <span>👁️</span> PDF
                    </button>

                    {/* Concise History Button */}
                    <button
                      onClick={() => openHistoryModal(agreement)}
                      className="px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors"
                      title="Change History"
                    >
                      🕒 History
                    </button>

                    {/* Clone Button */}
                    <button
                      onClick={() => handleClone(agreement.id)}
                      className="px-2 py-1 text-[11px] font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors"
                      title="Clone Draft"
                    >
                      📋 Clone
                    </button>

                    {/* Tags Button */}
                    <button
                      onClick={() => openMetadataModal(agreement)}
                      className="px-2 py-1 text-[11px] font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors"
                      title="Edit Tags"
                    >
                      🏷️
                    </button>
                  </div>

                  <button
                    onClick={() => handleArchiveToggle(agreement.id, !agreement.isArchived)}
                    className="text-[11px] font-semibold text-neutral-500 hover:text-red-600 transition-colors"
                  >
                    {agreement.isArchived ? 'Unarchive' : 'Archive'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload Modal (PDF / DOCX / MD) */}
        {showUploadModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 max-w-lg w-full shadow-xl">
              <h2 className="text-lg font-bold text-neutral-900 mb-1">Upload Agreement Document</h2>
              <p className="text-xs text-neutral-500 mb-4">
                Upload a <strong>PDF or DOCX</strong> (becomes active contract at v1.0) or a{' '}
                <strong>Markdown (.md)</strong> file (becomes draft at v0.1).
              </p>

              {actionError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
                  {actionError}
                </div>
              )}

              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Agreement Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Master Services Agreement 2026"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Select File (.PDF, .DOCX, .MD up to 15MB)
                  </label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.docx,.doc,.md,text/markdown,text/plain"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-lg p-2 text-xs text-neutral-700"
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">
                    Note: Password-protected or encrypted files must be unlocked prior to upload.
                  </p>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Assign Tags (Optional)
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Add tag (e.g. legal, sales)"
                      value={uploadTagInput}
                      onChange={(e) => setUploadTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddUploadTag();
                        }
                      }}
                      className="flex-1 bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                    />
                    <button
                      type="button"
                      onClick={handleAddUploadTag}
                      className="px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs font-semibold rounded-lg"
                    >
                      Add Tag
                    </button>
                  </div>
                  {uploadTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 border border-neutral-200 rounded-lg">
                      {uploadTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 bg-white border border-neutral-200 text-neutral-800 text-[10px] font-semibold px-2 py-0.5 rounded"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => setUploadTags(uploadTags.filter((t) => t !== tag))}
                            className="text-neutral-400 hover:text-red-600 font-bold"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setShowUploadModal(false);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                  >
                    Upload Document
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Scratch Creation Modal (Markdown Editor) */}
        {showScratchModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 max-w-4xl w-full shadow-2xl flex flex-col my-auto max-h-[95vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                    <span>✏️</span> Create Agreement from Scratch
                  </h2>
                  <p className="text-xs text-neutral-500">
                    Draft contract terms in Markdown. Initial draft saved at version v0.1.
                  </p>
                </div>
                <button
                  onClick={() => setShowScratchModal(false)}
                  className="p-1 text-neutral-400 hover:text-neutral-700 text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {actionError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
                  {actionError}
                </div>
              )}

              <form onSubmit={handleScratchSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Agreement Title *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Non-Disclosure Agreement (NDA)"
                      value={scratchTitle}
                      onChange={(e) => setScratchTitle(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Confidentiality agreement for vendor negotiations"
                      value={scratchDesc}
                      onChange={(e) => setScratchDesc(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                    />
                  </div>
                </div>

                {/* Markdown Editor */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-neutral-700">
                      Agreement Content (Markdown Format) *
                    </label>
                    <span className="text-[10px] text-neutral-400">Pure Markdown</span>
                  </div>
                  <MarkdownEditor
                    value={scratchMarkdown}
                    onChange={setScratchMarkdown}
                    minHeight="320px"
                  />
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Assign Tags (Optional)
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Add tag (e.g. nda, confidential)"
                      value={scratchTagInput}
                      onChange={(e) => setScratchTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddScratchTag();
                        }
                      }}
                      className="flex-1 bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                    />
                    <button
                      type="button"
                      onClick={handleAddScratchTag}
                      className="px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs font-semibold rounded-lg"
                    >
                      Add Tag
                    </button>
                  </div>
                  {scratchTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 border border-neutral-200 rounded-lg">
                      {scratchTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 bg-white border border-neutral-200 text-neutral-800 text-[10px] font-semibold px-2 py-0.5 rounded"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => setScratchTags(scratchTags.filter((t) => t !== tag))}
                            className="text-neutral-400 hover:text-red-600 font-bold"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setShowScratchModal(false);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm"
                  >
                    Create Draft (v0.1)
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Pencil Edit Mode Modal */}
        {showEditModal && selectedAgreement && (
          <AgreementEditModal
            agreementId={selectedAgreement.id}
            initialTitle={selectedAgreement.title ?? ''}
            initialDescription={selectedAgreement.description ?? ''}
            initialMarkdown={selectedAgreement.markdownContent ?? ''}
            initialTags={selectedAgreement.tags ?? []}
            currentVersion={selectedAgreement.version}
            currentStatus={selectedAgreement.status}
            onClose={() => {
              setShowEditModal(false);
              setSelectedAgreement(null);
            }}
            onSuccess={(msg) => {
              setActionMessage(msg);
              setRefreshTrigger((prev) => prev + 1);
            }}
            onActivateSuccess={() => {
              setActiveTab('active');
            }}
          />
        )}

        {/* PDF Viewer Modal */}
        {showPdfModal && selectedAgreement && (
          <PdfViewerModal
            agreement={selectedAgreement}
            onClose={() => {
              setShowPdfModal(false);
              setSelectedAgreement(null);
            }}
          />
        )}

        {/* Concise History Modal */}
        {showHistoryModal && selectedAgreement && (
          <AgreementHistoryModal
            agreementId={selectedAgreement.id}
            agreementTitle={selectedAgreement.title}
            currentVersion={selectedAgreement.version}
            onClose={() => {
              setShowHistoryModal(false);
              setSelectedAgreement(null);
            }}
          />
        )}

        {/* Metadata Tags Modal */}
        {showMetadataModal && selectedAgreement && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 max-w-lg w-full shadow-xl">
              <h2 className="text-lg font-bold text-neutral-900 mb-1">Edit Agreement Tags</h2>
              <p className="text-xs text-neutral-500 mb-4">{selectedAgreement.title}</p>

              {actionError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
                  {actionError}
                </div>
              )}

              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter tag (e.g. hr, confidential)"
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
                    onClick={handleAddTag}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-900 text-white text-xs font-semibold rounded-lg"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                  {tagsList.length === 0 ? (
                    <span className="text-xs text-neutral-400 italic">No tags attached.</span>
                  ) : (
                    tagsList.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 bg-white border border-neutral-200 text-neutral-800 px-2.5 py-1 rounded text-xs font-semibold"
                      >
                        #{tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="text-neutral-400 hover:text-red-600 font-bold text-xs"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                  <button
                    onClick={() => {
                      setActionError(null);
                      setShowMetadataModal(false);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-neutral-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTags}
                    className="px-4 py-2 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                  >
                    Save Tags
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default function AgreementManagementPage() {
  return (
    <SessionGuard>
      <Suspense
        fallback={<div className="p-12 text-center text-xs text-neutral-500">Loading...</div>}
      >
        <AgreementManagementContent />
      </Suspense>
    </SessionGuard>
  );
}
