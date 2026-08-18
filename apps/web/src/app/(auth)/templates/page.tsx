'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { Footer } from '@/components/layout/Footer';
import { getApiUrl } from '@/lib/api';

interface TemplateItem {
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

interface ShareItem {
  id: string;
  targetType: string;
  targetId: string;
  accessLevel: string;
  createdAt: string;
}

interface VersionItem {
  id: string;
  version: number;
  title: string;
  changeSummary?: string;
  createdAt: string;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

function TemplateManagementContent() {
  const [activeTab, setActiveTab] = useState<'org' | 'my' | 'shared'>('org');
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);

  // Form states
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createHtml, setCreateHtml] = useState(
    '<h1>Template Blueprint</h1><p>Enter reusable terms and fields here...</p>',
  );
  const [createTags, setCreateTags] = useState<string[]>([]);
  const [createTagInput, setCreateTagInput] = useState('');

  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [uploadTagInput, setUploadTagInput] = useState('');

  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editHtml, setEditHtml] = useState('');

  const [shareTargetType, setShareTargetType] = useState<'user' | 'team'>('user');
  const [shareTargetId, setShareTargetId] = useState('');
  const [shareAccessLevel, setShareAccessLevel] = useState<'USE' | 'EDIT'>('USE');

  const [sharesList, setSharesList] = useState<ShareItem[]>([]);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const action = searchParams?.get('action');
    if (action === 'create') {
      queueMicrotask(() => setShowCreateModal(true));
    }
  }, [searchParams]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      try {
        let url = `${getApiUrl()}/api/v1/templates`;
        if (searchQuery) url += `?search=${encodeURIComponent(searchQuery)}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });

        if (res.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('graphsign_session_token');
          localStorage.removeItem('graphsign_user_email');
          localStorage.removeItem('graphsign_org_id');
          localStorage.removeItem('graphsign_user_id');
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
        if (!ignore) console.error(err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [activeTab, searchQuery, tagFilter, refreshTrigger]);

  function handleAddCreateTag() {
    if (!createTagInput.trim()) return;
    const tag = createTagInput.trim().toLowerCase();
    if (!createTags.includes(tag)) setCreateTags([...createTags, tag]);
    setCreateTagInput('');
  }

  function handleAddUploadTag() {
    if (!uploadTagInput.trim()) return;
    const tag = uploadTagInput.trim().toLowerCase();
    if (!uploadTags.includes(tag)) setUploadTags([...uploadTags, tag]);
    setUploadTagInput('');
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActionMessage(null);

    if (!createTitle || createTitle.trim().length < 2) {
      setActionError('Template title must be at least 2 characters long.');
      return;
    }

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          title: createTitle.trim(),
          description: createDesc,
          htmlContent: createHtml,
          tags: createTags,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || data?.message || 'Failed to create template.');
      }

      setActionMessage('Template created successfully.');
      setShowCreateModal(false);
      setCreateTitle('');
      setCreateDesc('');
      setCreateTags([]);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setActionMessage(null);

    if (!uploadFile) {
      setActionError('Please select a file (PDF or DOCX).');
      return;
    }

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates`, {
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
          tags: uploadTags,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || data?.message || 'Upload failed.');
      }

      setActionMessage('Template uploaded successfully.');
      setShowUploadModal(false);
      setUploadTitle('');
      setUploadFile(null);
      setUploadTags([]);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handlePublishToggle(id: string, isPublished: boolean) {
    setActionError(null);
    try {
      const endpoint = isPublished ? 'publish' : 'unpublish';
      const res = await fetch(`${getApiUrl()}/api/v1/templates/${id}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error('Failed to update published status.');
      setActionMessage(`Template ${isPublished ? 'published to organization' : 'unpublished'}.`);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handleArchiveToggle(id: string, isArchived: boolean) {
    setActionError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error('Failed to archive template.');
      setActionMessage('Template archived successfully.');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
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
              <span>📐</span> Template Management
            </h1>
            <p className="text-xs text-neutral-600">
              Create reusable agreement blueprints, version templates, publish to team libraries,
              and manage access.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setActionError(null);
                setShowCreateModal(true);
              }}
              className="px-4 py-2 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>✨</span> Create Template
            </button>
            <button
              onClick={() => {
                setActionError(null);
                setShowUploadModal(true);
              }}
              className="px-4 py-2 bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-800 text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            >
              <span>📄</span> Upload Template
            </button>
          </div>
        </div>

        {/* Global Notifications Banners */}
        {actionMessage && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-xs font-medium text-green-800 flex items-center justify-between">
            <span>{actionMessage}</span>
            <button onClick={() => setActionMessage(null)} className="font-bold text-green-700">
              ×
            </button>
          </div>
        )}
        {actionError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700 flex items-center justify-between">
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
              onClick={() => setActiveTab('org')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'org'
                  ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Organization Library
            </button>
            <button
              onClick={() => setActiveTab('my')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'my'
                  ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              My Templates
            </button>
            <button
              onClick={() => setActiveTab('shared')}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'shared'
                  ? 'bg-white text-neutral-900 shadow-sm border border-neutral-200'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Shared with Me
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
            />
          </div>
        </div>

        {/* Templates Grid */}
        {loading ? (
          <div className="text-center py-16 text-xs font-medium text-neutral-500 bg-white rounded-xl border border-neutral-200">
            Loading templates...
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-16 bg-white border border-dashed border-neutral-300 rounded-xl p-8 space-y-3">
            <div className="h-12 w-12 rounded-full bg-neutral-100 text-neutral-400 mx-auto flex items-center justify-center text-xl">
              📐
            </div>
            <p className="text-sm font-semibold text-neutral-800">No templates found in library.</p>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Create a reusable agreement blueprint to streamline agreement creation.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-[#ba0000] text-white text-xs font-semibold rounded-lg"
              >
                Create Template
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="bg-white border border-neutral-200 rounded-xl p-5 hover:border-neutral-300 shadow-sm transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wider ${
                        tpl.isPublished
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                      }`}
                    >
                      {tpl.isPublished ? 'Published' : 'Draft'}
                    </span>
                    <span className="text-[11px] font-semibold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                      v{tpl.version}.0
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-neutral-900 mb-1.5 line-clamp-1">
                    {tpl.title}
                  </h3>
                  <p className="text-xs text-neutral-500 mb-4 line-clamp-2">
                    {tpl.description || 'No description provided.'}
                  </p>

                  {tpl.tags && tpl.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {tpl.tags.map((tag, idx) => (
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

                <div className="pt-3 border-t border-neutral-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handlePublishToggle(tpl.id, !tpl.isPublished)}
                      className="px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors"
                    >
                      {tpl.isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                    <Link
                      href={`/agreements?action=scratch&templateId=${tpl.id}`}
                      className="px-2.5 py-1 text-[11px] font-semibold text-[#ba0000] hover:bg-red-50 rounded transition-colors"
                    >
                      Use Template
                    </Link>
                  </div>

                  <button
                    onClick={() => handleArchiveToggle(tpl.id, !tpl.isArchived)}
                    className="text-[11px] font-semibold text-neutral-500 hover:text-red-600 transition-colors"
                  >
                    Archive
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Template Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold text-neutral-900 mb-1">Create Agreement Template</h2>
              <p className="text-xs text-neutral-500 mb-4">
                Build a reusable blueprint for sending agreements.
              </p>

              {actionError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
                  {actionError}
                </div>
              )}

              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Template Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Standard Employment Agreement"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    placeholder="Short description of this template blueprint"
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Template HTML Content
                  </label>
                  <textarea
                    rows={8}
                    value={createHtml}
                    onChange={(e) => setCreateHtml(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-lg p-3 text-xs text-neutral-900 font-mono focus:outline-none focus:border-[#ba0000]"
                  />
                </div>

                {/* Tags input inside Create Template Modal */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Assign Tags (Optional)
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Add tag (e.g. hr, template)"
                      value={createTagInput}
                      onChange={(e) => setCreateTagInput(e.target.value)}
                      className="flex-1 bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs text-neutral-900"
                    />
                    <button
                      type="button"
                      onClick={handleAddCreateTag}
                      className="px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs font-semibold rounded-lg"
                    >
                      Add Tag
                    </button>
                  </div>
                  {createTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-2 bg-neutral-50 border border-neutral-200 rounded-lg">
                      {createTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 bg-white border border-neutral-200 text-neutral-800 text-[10px] font-semibold px-2 py-0.5 rounded"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => setCreateTags(createTags.filter((t) => t !== tag))}
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
                      setShowCreateModal(false);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                  >
                    Save Template
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Upload Template Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 max-w-lg w-full shadow-xl">
              <h2 className="text-lg font-bold text-neutral-900 mb-2">Upload Template Document</h2>
              <p className="text-xs text-neutral-500 mb-4">
                Select a PDF or DOCX file to use as a reusable template.
              </p>

              {actionError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
                  {actionError}
                </div>
              )}

              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Template Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Master Services Agreement Template"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Select File (PDF / DOCX up to 25MB)
                  </label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.docx,.doc"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-lg p-2 text-xs text-neutral-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Assign Tags (Optional)
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Add tag (e.g. sales, contract)"
                      value={uploadTagInput}
                      onChange={(e) => setUploadTagInput(e.target.value)}
                      className="flex-1 bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs text-neutral-900"
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
                    Upload Template
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default function TemplateManagementPage() {
  return (
    <SessionGuard>
      <Suspense
        fallback={<div className="p-12 text-center text-xs text-neutral-500">Loading...</div>}
      >
        <TemplateManagementContent />
      </Suspense>
    </SessionGuard>
  );
}
