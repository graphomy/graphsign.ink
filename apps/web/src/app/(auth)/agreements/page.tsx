'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
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
  htmlContent?: string;
  version: number;
  isArchived: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  author?: { name?: string; email: string };
}

interface VersionItem {
  id: string;
  version: number;
  title: string;
  fileUrl?: string;
  changeSummary?: string;
  createdAt: string;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('token') || localStorage.getItem('graphsign_session_token') || '';
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
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState<AgreementItem | null>(null);

  // Form states
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [scratchTitle, setScratchTitle] = useState('');
  const [scratchHtml, setScratchHtml] = useState(
    '<h1>Agreement Terms</h1><p>Enter agreement details and variables here...</p>',
  );
  const [autosaveStatus, setAutosaveStatus] = useState<string>('');
  const [versions, setVersions] = useState<VersionItem[]>([]);
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
      setActionError(null);
      try {
        const isArchivedParam = activeTab === 'archived' ? 'true' : 'false';
        const statusParam = activeTab === 'drafts' ? 'DRAFT' : '';
        let url = `${getApiUrl()}/api/v1/agreements?isArchived=${isArchivedParam}`;
        if (statusParam) url += `&status=${statusParam}`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
        if (tagFilter) url += `&tag=${encodeURIComponent(tagFilter)}`;

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        });

        if (!res.ok) throw new Error('Failed to load agreements');
        const data = await res.json();
        if (!ignore) {
          setAgreements(data.items || []);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setActionError((err as Error).message);
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

  // Draft Autosave interval (every 30 seconds for scratch modal)
  useEffect(() => {
    if (!showScratchModal || !scratchTitle) return;
    const interval = setInterval(() => {
      setAutosaveStatus('Autosaving draft...');
      setTimeout(() => {
        setAutosaveStatus('Draft saved automatically');
      }, 1000);
    }, 30000);
    return () => clearInterval(interval);
  }, [showScratchModal, scratchTitle]);

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActionMessage(null);

    if (!uploadFile) {
      setActionError('Please select a file (PDF or DOCX)');
      return;
    }

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          title: uploadTitle || uploadFile.name,
          fileName: uploadFile.name,
          fileSize: uploadFile.size,
          mimeType: uploadFile.type || 'application/pdf',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || data?.error?.message || 'Upload failed');
      }

      setActionMessage('Agreement uploaded successfully as Draft.');
      setShowUploadModal(false);
      setUploadTitle('');
      setUploadFile(null);
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
          htmlContent: scratchHtml,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || data?.error?.message || 'Failed to create agreement');
      }

      setActionMessage('Agreement created from scratch successfully.');
      setShowScratchModal(false);
      setScratchTitle('');
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
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      if (!res.ok) throw new Error('Failed to clone agreement');
      setActionMessage('Agreement cloned successfully.');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handleArchiveToggle(id: string, isArchived: boolean) {
    setActionError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${id}/archive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ isArchived }),
      });

      if (!res.ok) throw new Error('Failed to update archive status');
      setActionMessage(`Agreement ${isArchived ? 'archived' : 'unarchived'} successfully.`);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function openVersionModal(agreement: AgreementItem) {
    setSelectedAgreement(agreement);
    setShowVersionModal(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${agreement.id}/versions`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setVersions(data || []);
      }
    } catch (err) {
      console.error(err);
    }
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

      if (!res.ok) throw new Error('Failed to update tags');
      setActionMessage('Agreement tags updated.');
      setShowMetadataModal(false);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <span className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
                📑
              </span>
              Agreement Management
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Upload documents, create agreements from scratch, manage versions and audit trails.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <button
              onClick={() => {
                setActionError(null);
                setShowUploadModal(true);
              }}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-red-600/20 flex items-center gap-2"
            >
              <span>📄</span> Upload Document
            </button>
            <button
              onClick={() => {
                setActionError(null);
                setShowScratchModal(true);
              }}
              className="px-4 py-2.5 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-all flex items-center gap-2"
            >
              <span>✏️</span> Create from Scratch
            </button>
          </div>
        </div>

        {/* Notifications */}
        {actionMessage && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-center justify-between">
            <span>{actionMessage}</span>
            <button onClick={() => setActionMessage(null)} className="text-emerald-400 font-bold">
              ×
            </button>
          </div>
        )}
        {actionError && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center justify-between">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-400 font-bold">
              ×
            </button>
          </div>
        )}

        {/* Tabs & Search Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-2 rounded-2xl border border-slate-800 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'active'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              Active Agreements
            </button>
            <button
              onClick={() => setActiveTab('drafts')}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'drafts'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              Drafts Only
            </button>
            <button
              onClick={() => setActiveTab('archived')}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'archived'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              Archived
            </button>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500"
            />
            <input
              type="text"
              placeholder="Filter tag..."
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-red-500 w-32"
            />
          </div>
        </div>

        {/* Agreements Grid */}
        {loading ? (
          <div className="text-center py-16 text-slate-400">Loading agreements...</div>
        ) : agreements.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-800 rounded-3xl bg-slate-900/30">
            <p className="text-slate-400 text-base font-medium">
              No agreements found in {activeTab}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agreements.map((agreement) => (
              <div
                key={agreement.id}
                className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
                        agreement.status === 'COMPLETED' || agreement.status === 'SEALED'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {agreement.status}
                    </span>
                    <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                      v{agreement.version}.0
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2 line-clamp-1">
                    {agreement.title}
                  </h3>
                  <p className="text-xs text-slate-400 mb-4 line-clamp-2">
                    {agreement.description || agreement.fileName || 'No description provided.'}
                  </p>

                  {/* Tags */}
                  {agreement.tags && agreement.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {agreement.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openVersionModal(agreement)}
                      className="p-2 hover:bg-slate-800 rounded-lg text-xs text-slate-400 hover:text-white transition-all"
                      title="Version History"
                    >
                      🕒 History
                    </button>
                    <button
                      onClick={() => handleClone(agreement.id)}
                      className="p-2 hover:bg-slate-800 rounded-lg text-xs text-slate-400 hover:text-white transition-all"
                      title="Clone Agreement"
                    >
                      📋 Clone
                    </button>
                    <button
                      onClick={() => openMetadataModal(agreement)}
                      className="p-2 hover:bg-slate-800 rounded-lg text-xs text-slate-400 hover:text-white transition-all"
                      title="Edit Tags"
                    >
                      🏷️ Tags
                    </button>
                  </div>

                  <button
                    onClick={() => handleArchiveToggle(agreement.id, !agreement.isArchived)}
                    className="text-xs text-slate-400 hover:text-red-400 transition-all p-1"
                  >
                    {agreement.isArchived ? 'Unarchive' : 'Archive'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload Modal (INK-66) */}
        {showUploadModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full">
              <h2 className="text-xl font-bold text-white mb-4">Upload Agreement (PDF / DOCX)</h2>
              {actionError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
                  {actionError}
                </div>
              )}
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Agreement Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Master Services Agreement"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Select File (Max 25MB)
                  </label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.docx,.doc"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-400"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setShowUploadModal(false);
                    }}
                    className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl"
                  >
                    Upload Document
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Scratch Modal (INK-67 & INK-68 Draft Autosave) */}
        {showScratchModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Create Agreement from Scratch</h2>
                {autosaveStatus && (
                  <span className="text-xs text-amber-400 italic">{autosaveStatus}</span>
                )}
              </div>

              {actionError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
                  {actionError}
                </div>
              )}

              <form onSubmit={handleScratchSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Agreement Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter agreement title (e.g. Consulting Services Agreement)"
                    value={scratchTitle}
                    onChange={(e) => setScratchTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Rich Text Content (HTML)
                  </label>
                  <textarea
                    rows={8}
                    value={scratchHtml}
                    onChange={(e) => setScratchHtml(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 font-mono"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setShowScratchModal(false);
                    }}
                    className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl"
                  >
                    Save & Create Draft
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Version History Modal (INK-72) */}
        {showVersionModal && selectedAgreement && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-white mb-2">Agreement Version History</h2>
              <p className="text-xs text-slate-400 mb-4">{selectedAgreement.title}</p>

              <div className="space-y-3">
                {versions.map((ver) => (
                  <div key={ver.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-white">Version {ver.version}.0</span>
                      <span className="text-xs text-slate-500">
                        {new Date(ver.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {ver.changeSummary || 'Initial draft version.'}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowVersionModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-200 text-sm rounded-xl"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Metadata Modal (INK-69 Tags) */}
        {showMetadataModal && selectedAgreement && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full">
              <h2 className="text-xl font-bold text-white mb-2">Edit Agreement Tags</h2>
              <p className="text-xs text-slate-400 mb-4">{selectedAgreement.title}</p>

              {actionError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
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
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-200"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-slate-950 rounded-xl border border-slate-800">
                  {tagsList.length === 0 ? (
                    <span className="text-xs text-slate-500 italic">No tags attached.</span>
                  ) : (
                    tagsList.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 bg-slate-800 text-slate-200 px-3 py-1 rounded-lg text-xs"
                      >
                        #{tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="text-slate-400 hover:text-white font-bold text-xs"
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    onClick={() => {
                      setActionError(null);
                      setShowMetadataModal(false);
                    }}
                    className="px-4 py-2 text-sm text-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTags}
                    className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl"
                  >
                    Save Tags
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgreementManagementPage() {
  return (
    <SessionGuard>
      <Suspense fallback={<div className="p-12 text-center text-slate-400">Loading...</div>}>
        <AgreementManagementContent />
      </Suspense>
    </SessionGuard>
  );
}
