'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { getApiUrl } from '@/lib/api';

interface TemplateItem {
  id: string;
  title: string;
  description?: string;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
  htmlContent?: string;
  fields?: Record<string, unknown>[];
  version: number;
  isPublished: boolean;
  isArchived: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  author?: { name?: string; email: string };
  shares?: Array<{ id: string; targetType: string; targetId: string; accessLevel: string }>;
}

interface VersionItem {
  id: string;
  version: number;
  title: string;
  changeSummary?: string;
  createdAt: string;
}

interface ShareItem {
  id: string;
  templateId: string;
  targetType: string;
  targetId: string;
  accessLevel: string;
  createdAt: string;
}

function TemplateManagementContent() {
  const [activeView, setActiveView] = useState<'library' | 'mine' | 'shared'>('library');
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateItem | null>(null);

  // Form & view states
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createHtml, setCreateHtml] = useState(
    '<h1>Template Document</h1><p>Define agreement layout and variables here...</p>',
  );

  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
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
    if (action === 'create') setShowCreateModal(true);
  }, [searchParams]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setActionError(null);
      try {
        let url = `${getApiUrl()}/api/v1/templates?view=${activeView}`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
        if (tagFilter) url += `&tag=${encodeURIComponent(tagFilter)}`;

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          },
        });

        if (!res.ok) throw new Error('Failed to load templates');
        const data = await res.json();
        if (!ignore) {
          setTemplates(data.items || []);
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
  }, [activeView, searchQuery, tagFilter, refreshTrigger]);

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          title: createTitle,
          description: createDescription,
          htmlContent: createHtml,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create template');
      }

      setActionMessage('Template created successfully.');
      setShowCreateModal(false);
      setCreateTitle('');
      setCreateDescription('');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  function openEditModal(template: TemplateItem) {
    setSelectedTemplate(template);
    setEditTitle(template.title);
    setEditDescription(template.description || '');
    setEditHtml(template.htmlContent || '');
    setShowEditModal(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplate) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates/${selectedTemplate.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          htmlContent: editHtml,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update template');
      }

      setActionMessage('Template updated successfully.');
      setShowEditModal(false);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handleArchive(template: TemplateItem) {
    if (!confirm(`Are you sure you want to archive template '${template.title}'?`)) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates/${template.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      if (!res.ok) throw new Error('Failed to archive template');
      setActionMessage('Template archived successfully.');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handlePublishToggle(template: TemplateItem) {
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates/${template.id}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ isPublished: !template.isPublished }),
      });

      if (!res.ok) throw new Error('Failed to update template publish status');
      setActionMessage(
        `Template ${!template.isPublished ? 'published to Organization Library' : 'unpublished'}.`,
      );
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handleInstantiate(template: TemplateItem) {
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates/${template.id}/instantiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ title: `[Draft] ${template.title}` }),
      });

      if (!res.ok) throw new Error('Failed to create agreement from template');
      setActionMessage('Agreement draft created from template. Available in Agreements.');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function openShareModal(template: TemplateItem) {
    setSelectedTemplate(template);
    setShowShareModal(true);
    fetchShares(template.id);
  }

  async function fetchShares(templateId: string) {
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates/${templateId}/shares`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setSharesList(data || []);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleShareSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplate || !shareTargetId) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates/${selectedTemplate.id}/shares`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          targetType: shareTargetType,
          targetId: shareTargetId,
          accessLevel: shareAccessLevel,
        }),
      });

      if (!res.ok) throw new Error('Failed to share template');
      setActionMessage('Template shared successfully.');
      setShareTargetId('');
      fetchShares(selectedTemplate.id);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handleRevokeShare(shareId: string) {
    if (!selectedTemplate) return;
    try {
      const res = await fetch(
        `${getApiUrl()}/api/v1/templates/${selectedTemplate.id}/shares/${shareId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          },
        },
      );

      if (!res.ok) throw new Error('Failed to revoke share');
      setActionMessage('Share access revoked.');
      fetchShares(selectedTemplate.id);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function openVersionModal(template: TemplateItem) {
    setSelectedTemplate(template);
    setShowVersionModal(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates/${template.id}/versions`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
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

  function openPreviewModal(template: TemplateItem) {
    setSelectedTemplate(template);
    setShowPreviewModal(true);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <span className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
                📋
              </span>
              Template Management
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Create, version, share, publish, and manage reusable contract blueprints.
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-red-600/20 flex items-center gap-2 self-start md:self-auto"
          >
            <span>✨</span> Create Template
          </button>
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

        {/* Navigation Tabs & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-2 rounded-2xl border border-slate-800 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveView('library')}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeView === 'library'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              Organization Library
            </button>
            <button
              onClick={() => setActiveView('mine')}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeView === 'mine'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              My Templates
            </button>
            <button
              onClick={() => setActiveView('shared')}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeView === 'shared'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              Shared with Me
            </button>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search templates..."
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

        {/* Template Cards Grid */}
        {loading ? (
          <div className="text-center py-16 text-slate-400">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-800 rounded-3xl bg-slate-900/30">
            <p className="text-slate-400 text-base font-medium">
              No templates found in {activeView}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
                        template.isPublished
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {template.isPublished ? 'Published' : 'Draft'}
                    </span>
                    <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                      v{template.version}.0
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2 line-clamp-1">
                    {template.title}
                  </h3>
                  <p className="text-xs text-slate-400 mb-4 line-clamp-2">
                    {template.description || 'No description provided.'}
                  </p>

                  {/* Tags */}
                  {template.tags && template.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {template.tags.map((tag, idx) => (
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
                      onClick={() => handleInstantiate(template)}
                      className="px-3 py-1.5 bg-red-600/90 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-all"
                      title="Use Template to Create Agreement"
                    >
                      🚀 Use
                    </button>
                    <button
                      onClick={() => openPreviewModal(template)}
                      className="p-2 hover:bg-slate-800 rounded-lg text-xs text-slate-400 hover:text-white transition-all"
                      title="Preview Template"
                    >
                      👁️
                    </button>
                    <button
                      onClick={() => openEditModal(template)}
                      className="p-2 hover:bg-slate-800 rounded-lg text-xs text-slate-400 hover:text-white transition-all"
                      title="Edit Template"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => openVersionModal(template)}
                      className="p-2 hover:bg-slate-800 rounded-lg text-xs text-slate-400 hover:text-white transition-all"
                      title="Version History"
                    >
                      🕒
                    </button>
                    <button
                      onClick={() => openShareModal(template)}
                      className="p-2 hover:bg-slate-800 rounded-lg text-xs text-slate-400 hover:text-white transition-all"
                      title="Sharing Settings"
                    >
                      🔗
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handlePublishToggle(template)}
                      className="text-xs text-slate-400 hover:text-amber-400 transition-all p-1"
                      title="Toggle Publish Status"
                    >
                      {template.isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      onClick={() => handleArchive(template)}
                      className="text-xs text-red-400 hover:text-red-300 transition-all p-1"
                      title="Archive Template"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Template Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full">
              <h2 className="text-xl font-bold text-white mb-4">Create Template Blueprint</h2>
              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Master Services Agreement Template"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    placeholder="Short summary of when to use this template"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Template Document Content (HTML)
                  </label>
                  <textarea
                    rows={8}
                    value={createHtml}
                    onChange={(e) => setCreateHtml(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 font-mono"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl"
                  >
                    Save Template
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Template Modal */}
        {showEditModal && selectedTemplate && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full">
              <h2 className="text-xl font-bold text-white mb-4">Edit Template</h2>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    HTML Content
                  </label>
                  <textarea
                    rows={8}
                    value={editHtml}
                    onChange={(e) => setEditHtml(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 font-mono"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 text-sm text-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Share Template Modal (Template ACL & Revoke Share) */}
        {showShareModal && selectedTemplate && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-white mb-1">Share Template Settings</h2>
              <p className="text-xs text-slate-400 mb-4">{selectedTemplate.title}</p>

              {/* Add Share Form */}
              <form
                onSubmit={handleShareSubmit}
                className="space-y-4 mb-6 bg-slate-950 p-4 rounded-2xl border border-slate-800"
              >
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Grant New Access
                </h3>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Share Target Type
                  </label>
                  <select
                    value={shareTargetType}
                    onChange={(e) => setShareTargetType(e.target.value as 'user' | 'team')}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-200"
                  >
                    <option value="user">User (by User UUID)</option>
                    <option value="team">Team (by Team UUID)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Target ID (UUID)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter user or team UUID..."
                    value={shareTargetId}
                    onChange={(e) => setShareTargetId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Access Level
                  </label>
                  <select
                    value={shareAccessLevel}
                    onChange={(e) => setShareAccessLevel(e.target.value as 'USE' | 'EDIT')}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-200"
                  >
                    <option value="USE">USE (Can instantiate agreements)</option>
                    <option value="EDIT">EDIT (Can modify template draft)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-xl"
                >
                  Grant Share Access
                </button>
              </form>

              {/* Active Shares List */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Active Shares
                </h3>
                {sharesList.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No direct share ACLs granted yet.</p>
                ) : (
                  <div className="space-y-2">
                    {sharesList.map((share) => (
                      <div
                        key={share.id}
                        className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <span className="text-xs font-semibold text-white capitalize">
                            {share.targetType}:{' '}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            {share.targetId.slice(0, 8)}...
                          </span>
                          <span className="ml-2 text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-md font-bold">
                            {share.accessLevel}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRevokeShare(share.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4 mt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowShareModal(false)}
                  className="px-4 py-2 text-sm text-slate-400"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Version History Modal */}
        {showVersionModal && selectedTemplate && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-white mb-2">Template Version History</h2>
              <p className="text-xs text-slate-400 mb-4">{selectedTemplate.title}</p>

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
                      {ver.changeSummary || 'No revision notes.'}
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

        {/* Template Preview Modal */}
        {showPreviewModal && selectedTemplate && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Template Preview</h2>
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <h3 className="text-base font-bold text-red-400 mb-1">{selectedTemplate.title}</h3>
              <p className="text-xs text-slate-400 mb-4">{selectedTemplate.description}</p>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 mb-4 prose prose-invert max-w-none">
                {selectedTemplate.htmlContent ? (
                  <div dangerouslySetInnerHTML={{ __html: selectedTemplate.htmlContent }} />
                ) : (
                  <p className="text-slate-500 italic">No HTML preview content available.</p>
                )}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                <button
                  onClick={() => handleInstantiate(selectedTemplate)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl"
                >
                  🚀 Instantiate Agreement from this Template
                </button>
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-200 text-sm rounded-xl"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TemplateManagementPage() {
  return (
    <SessionGuard>
      <Suspense fallback={<div className="p-12 text-center text-slate-400">Loading...</div>}>
        <TemplateManagementContent />
      </Suspense>
    </SessionGuard>
  );
}
