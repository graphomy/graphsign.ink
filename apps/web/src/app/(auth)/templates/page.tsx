'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { WorkspaceNav } from '@/components/layout/WorkspaceNav';
import { Footer } from '@/components/layout/Footer';
import { MarkdownEditor } from '@/components/features/agreements/MarkdownEditor';
import { ShareTemplateModal } from '@/components/features/templates/ShareTemplateModal';
import { TemplateHistoryModal } from '@/components/features/templates/TemplateHistoryModal';
import {
  TemplateFilterBar,
  TemplateFilterState,
} from '@/components/features/templates/TemplateFilterBar';
import { getApiUrl } from '@/lib/api';
import { formatDate } from '@/lib/date-utils';

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

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

function TemplateManagementContent() {
  const [activeTab, setActiveTab] = useState<'org' | 'my' | 'shared'>('org');
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState<TemplateFilterState>({
    keyword: '',
    status: 'ALL',
    format: 'ALL',
    tag: '',
    datePreset: 'all',
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  });
  const [queryTimeMs, setQueryTimeMs] = useState<number | undefined>(undefined);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateItem | null>(null);
  const [selectedShareTemplate, setSelectedShareTemplate] = useState<TemplateItem | null>(null);
  const [selectedHistoryTemplate, setSelectedHistoryTemplate] = useState<TemplateItem | null>(null);

  // 3-dots action menu dropdown tracking
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Form states for Create
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createMarkdown, setCreateMarkdown] = useState(
    '# Standard Agreement Blueprint\n\n## 1. Scope and Terms\nEnter reusable contract clauses, obligations, and deliverables in Markdown.\n\n## 2. Execution and Signatures\nThis template blueprint can be instantiated into active agreements.\n',
  );
  const [createTags, setCreateTags] = useState<string[]>([]);
  const [createTagInput, setCreateTagInput] = useState('');

  // Form states for Edit
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editMarkdown, setEditMarkdown] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Form states for Upload
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [uploadTagInput, setUploadTagInput] = useState('');

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [isSubmittingUpload, setIsSubmittingUpload] = useState(false);
  const [instantiatingId, setInstantiatingId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Close 3-dots menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdownId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const action = searchParams?.get('action');
    if (action === 'create') {
      queueMicrotask(() => setShowCreateModal(true));
    }
  }, [searchParams]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const startTime = Date.now();
      setLoading(true);
      setActionError(null);
      try {
        const viewParam =
          activeTab === 'my' ? 'mine' : activeTab === 'shared' ? 'shared' : 'library';
        let url = `${getApiUrl()}/api/v1/templates?view=${viewParam}`;
        if (filterState.keyword.trim()) {
          url += `&search=${encodeURIComponent(filterState.keyword.trim())}`;
        }
        if (filterState.tag.trim()) {
          url += `&tag=${encodeURIComponent(filterState.tag.trim())}`;
        }
        if (filterState.status === 'ACTIVE') {
          url += `&isPublished=true`;
        } else if (filterState.status === 'DRAFT') {
          url += `&isPublished=false`;
        }

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });

        if (res.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('graphsign_session_token');
          localStorage.removeItem('graphsign_user_email');
          localStorage.removeItem('graphsign_org_id');
          localStorage.removeItem('graphsign_user_id');
          router.push('/login?reason=session_expired');
          return;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error?.message || errData?.message || 'Failed to load templates.');
        }

        const data = await res.json();
        if (!ignore) {
          let items: TemplateItem[] = data.items || [];

          // Format filtering
          if (filterState.format === 'pdf') {
            items = items.filter(
              (t) => t.fileName?.toLowerCase().endsWith('.pdf') || t.mimeType === 'application/pdf',
            );
          } else if (filterState.format === 'markdown') {
            items = items.filter(
              (t) => !t.fileName?.toLowerCase().endsWith('.pdf') && t.mimeType !== 'application/pdf',
            );
          }

          // Sorting
          items.sort((a, b) => {
            if (filterState.sortBy === 'title') {
              const cmp = a.title.localeCompare(b.title);
              return filterState.sortOrder === 'asc' ? cmp : -cmp;
            }
            if (filterState.sortBy === 'createdAt') {
              const cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
              return filterState.sortOrder === 'asc' ? cmp : -cmp;
            }
            const cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
            return filterState.sortOrder === 'asc' ? cmp : -cmp;
          });

          setTemplates(items);
          setQueryTimeMs(Date.now() - startTime);
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
  }, [activeTab, filterState, refreshTrigger]);

  function handleAddCreateTag() {
    const tag = createTagInput.trim().toLowerCase();
    if (tag && !createTags.includes(tag)) {
      setCreateTags([...createTags, tag]);
    }
    setCreateTagInput('');
  }

  function handleRemoveCreateTag(tag: string) {
    setCreateTags(createTags.filter((t) => t !== tag));
  }

  function handleAddEditTag() {
    const tag = editTagInput.trim().toLowerCase();
    if (tag && !editTags.includes(tag)) {
      setEditTags([...editTags, tag]);
    }
    setEditTagInput('');
  }

  function handleRemoveEditTag(tag: string) {
    setEditTags(editTags.filter((t) => t !== tag));
  }

  function handleAddUploadTag() {
    const tag = uploadTagInput.trim().toLowerCase();
    if (tag && !uploadTags.includes(tag)) {
      setUploadTags([...uploadTags, tag]);
    }
    setUploadTagInput('');
  }

  function handleRemoveUploadTag(tag: string) {
    setUploadTags(uploadTags.filter((t) => t !== tag));
  }

  // Open Edit Modal
  function handleOpenEdit(template: TemplateItem) {
    setEditingTemplate(template);
    setEditTitle(template.title);
    setEditDesc(template.description || '');
    setEditMarkdown(template.htmlContent || '');
    setEditTags(template.tags || []);
    setEditTagInput('');
    setActiveDropdownId(null);
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!createTitle.trim()) return;

    setIsSubmittingCreate(true);
    setActionError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          title: createTitle.trim(),
          description: createDesc.trim() || undefined,
          htmlContent: createMarkdown,
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
      setActiveTab('my');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setIsSubmittingCreate(false);
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTemplate || !editTitle.trim()) return;

    setIsSubmittingEdit(true);
    setActionError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates/${editingTemplate.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDesc.trim() || undefined,
          htmlContent: editMarkdown,
          tags: editTags,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || data?.message || 'Failed to update template.');
      }

      setActionMessage('Template updated successfully.');
      setEditingTemplate(null);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setIsSubmittingEdit(false);
    }
  }

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile) {
      setActionError('Please select a file to upload.');
      return;
    }

    setIsSubmittingUpload(true);
    setActionError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          title: uploadTitle.trim() || uploadFile.name,
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
      setActiveTab('my');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setIsSubmittingUpload(false);
    }
  }

  async function handlePublishToggle(id: string, isPublished: boolean) {
    setActionError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates/${id}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ isPublished }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(
          errData?.error?.message || errData?.message || 'Failed to update published status.',
        );
      }

      setActionMessage(
        `Template ${isPublished ? 'published (Status: Active)' : 'unpublished (Status: Draft)'}.`,
      );
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    setActionError(null);
    setActiveDropdownId(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error?.message || errData?.message || 'Failed to delete template.');
      }

      setActionMessage('Template deleted successfully.');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handleUseTemplate(template: TemplateItem) {
    if (instantiatingId) return;
    setInstantiatingId(template.id);
    setActionError(null);
    setActionMessage(null);

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

      router.push('/agreements?action=scratch');
    } catch (err: unknown) {
      setActionError((err as Error).message);
      setInstantiatingId(null);
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

        {/* Section Navigation (INK-269) */}
        <div className="flex items-center justify-between">
          <WorkspaceNav />
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

        {/* Navigation Tabs Bar */}
        <div className="bg-white border border-neutral-200/80 rounded-2xl p-2.5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('org')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'org'
                  ? 'bg-white text-neutral-900 shadow-xs border border-neutral-200/60'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Library
            </button>
            <button
              onClick={() => setActiveTab('my')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'my'
                  ? 'bg-white text-neutral-900 shadow-xs border border-neutral-200/60'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              My Templates
            </button>
            <button
              onClick={() => setActiveTab('shared')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'shared'
                  ? 'bg-white text-neutral-900 shadow-xs border border-neutral-200/60'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Shared with Me
            </button>
          </div>
        </div>

        {/* Omnibar Search & Filter Bar (INK-271) */}
        <TemplateFilterBar
          filters={filterState}
          onFilterChange={setFilterState}
          onClearFilters={() =>
            setFilterState({
              keyword: '',
              status: 'ALL',
              format: 'ALL',
              tag: '',
              datePreset: 'all',
              sortBy: 'updatedAt',
              sortOrder: 'desc',
            })
          }
          totalResults={templates.length}
          queryTimeMs={queryTimeMs}
        />

        {/* Templates Table View (INK-270) */}
        {loading ? (
          <div className="text-center py-16 text-xs font-medium text-neutral-500 bg-white rounded-xl border border-neutral-200">
            Loading templates...
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-16 bg-white border border-dashed border-neutral-300 rounded-xl p-8 space-y-3">
            <div className="h-12 w-12 rounded-full bg-neutral-100 text-neutral-400 mx-auto flex items-center justify-center text-xl">
              📐
            </div>
            <p className="text-sm font-semibold text-neutral-800">
              {activeTab === 'my'
                ? 'No templates found in your personal library.'
                : activeTab === 'shared'
                  ? 'No templates shared with you.'
                  : 'No published templates found in library.'}
            </p>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Create a reusable agreement blueprint in Markdown to streamline contract workflows.
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
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50/80 text-neutral-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-4 font-bold">Template</th>
                    <th className="py-3.5 px-4 font-bold">Status</th>
                    <th className="py-3.5 px-4 font-bold">Version</th>
                    <th className="py-3.5 px-4 font-bold">Updated</th>
                    <th className="py-3.5 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {templates.map((tpl) => {
                    const isPublished = tpl.isPublished;
                    const isDropdownOpen = activeDropdownId === tpl.id;

                    return (
                      <tr key={tpl.id} className="hover:bg-neutral-50/60 transition-colors">
                        {/* Template Details */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-start gap-3">
                            <span className="text-xl shrink-0 mt-0.5">
                              {tpl.fileName ? '📄' : '📐'}
                            </span>
                            <div className="space-y-1 min-w-0">
                              <h3 className="font-bold text-neutral-900 truncate max-w-xs sm:max-w-md">
                                {tpl.title}
                              </h3>
                              {tpl.description && (
                                <p className="text-[11px] text-neutral-500 line-clamp-1">
                                  {tpl.description}
                                </p>
                              )}
                              {tpl.tags && tpl.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {tpl.tags.map((t) => (
                                    <span
                                      key={t}
                                      className="text-[9px] font-semibold bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded"
                                    >
                                      #{t}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {isPublished ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-green-50 text-green-700 border border-green-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Draft
                            </span>
                          )}
                        </td>

                        {/* Version */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-mono text-xs font-bold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                            v{tpl.version}.0
                          </span>
                        </td>

                        {/* Author & Updated */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-neutral-500">
                          <div className="space-y-0.5">
                            <span className="block text-neutral-800 font-medium">
                              {formatDate(tpl.updatedAt)}
                            </span>
                            <span className="block text-[10px] text-neutral-400 truncate max-w-[120px]">
                              by {tpl.author?.name || tpl.author?.email || 'User'}
                            </span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2 relative">
                            {/* Primary Action: Use Template */}
                            <button
                              onClick={() => handleUseTemplate(tpl)}
                              disabled={instantiatingId === tpl.id}
                              className="px-3 py-1.5 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-all disabled:opacity-50 flex items-center gap-1"
                            >
                              {instantiatingId === tpl.id ? 'Creating...' : 'Use Template'}
                            </button>

                            {/* Secondary Action: Edit */}
                            <button
                              onClick={() => handleOpenEdit(tpl)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition-all"
                            >
                              Edit
                            </button>

                            {/* Secondary Action: Publish / Unpublish */}
                            <button
                              onClick={() => handlePublishToggle(tpl.id, !isPublished)}
                              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                                isPublished
                                  ? 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border-neutral-300'
                                  : 'bg-green-50 hover:bg-green-100 text-green-800 border-green-300'
                              }`}
                            >
                              {isPublished ? 'Unpublish' : 'Publish'}
                            </button>

                            {/* 3-dots Menu Button */}
                            <div className="relative">
                              <button
                                aria-label="More actions"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveDropdownId(isDropdownOpen ? null : tpl.id);
                                }}
                                className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg text-sm font-bold transition-colors"
                              >
                                •••
                              </button>

                              {/* Dropdown Menu */}
                              {isDropdownOpen && (
                                <div
                                  ref={dropdownRef}
                                  className="absolute right-0 top-full mt-1 w-44 bg-white border border-neutral-200 rounded-xl shadow-xl z-30 py-1 text-left text-xs font-medium"
                                >
                                  <button
                                    onClick={() => {
                                      setActiveDropdownId(null);
                                      setSelectedHistoryTemplate(tpl);
                                    }}
                                    className="w-full px-3.5 py-2 text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 text-left"
                                  >
                                    <span>🕒</span> Version History
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveDropdownId(null);
                                      setSelectedShareTemplate(tpl);
                                    }}
                                    className="w-full px-3.5 py-2 text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 text-left"
                                  >
                                    <span>👥</span> Share Template
                                  </button>
                                  <div className="border-t border-neutral-100 my-1" />
                                  <button
                                    onClick={() => handleDeleteTemplate(tpl.id)}
                                    className="w-full px-3.5 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2 text-left font-semibold"
                                  >
                                    <span>🗑️</span> Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Create Template Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 max-w-3xl w-full shadow-xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold text-neutral-900 mb-1">Create Agreement Template</h2>
              <p className="text-xs text-neutral-500 mb-4">
                Build a reusable blueprint in Markdown for instantiating agreements.
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
                    Template Markdown Content
                  </label>
                  <MarkdownEditor
                    value={createMarkdown}
                    onChange={setCreateMarkdown}
                    placeholder="Write agreement terms in Markdown..."
                    minHeight="280px"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Tags</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Add tag (e.g. employment, nda)"
                      value={createTagInput}
                      onChange={(e) => setCreateTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCreateTag();
                        }
                      }}
                      className="flex-1 bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                    />
                    <button
                      type="button"
                      onClick={handleAddCreateTag}
                      className="px-3 py-1.5 bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-lg hover:bg-neutral-300"
                    >
                      Add Tag
                    </button>
                  </div>
                  {createTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {createTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-700 text-xs px-2.5 py-1 rounded-full border border-neutral-200"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveCreateTag(tag)}
                            className="text-neutral-400 hover:text-red-500 font-bold"
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
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 border border-neutral-300 text-neutral-700 text-xs font-semibold rounded-lg hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingCreate}
                    className="px-4 py-2 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                  >
                    {isSubmittingCreate ? 'Saving...' : 'Save Template'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Template Modal */}
        {editingTemplate && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-neutral-200 rounded-2xl p-6 max-w-3xl w-full shadow-xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold text-neutral-900 mb-1">Edit Agreement Template</h2>
              <p className="text-xs text-neutral-500 mb-4">
                Update template blueprint details and Markdown clauses.
              </p>

              {actionError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
                  {actionError}
                </div>
              )}

              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Template Title
                  </label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
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
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Template Markdown Content
                  </label>
                  <MarkdownEditor
                    value={editMarkdown}
                    onChange={setEditMarkdown}
                    placeholder="Write agreement terms in Markdown..."
                    minHeight="280px"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Tags</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Add tag (e.g. employment, nda)"
                      value={editTagInput}
                      onChange={(e) => setEditTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddEditTag();
                        }
                      }}
                      className="flex-1 bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                    />
                    <button
                      type="button"
                      onClick={handleAddEditTag}
                      className="px-3 py-1.5 bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-lg hover:bg-neutral-300"
                    >
                      Add Tag
                    </button>
                  </div>
                  {editTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {editTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-700 text-xs px-2.5 py-1 rounded-full border border-neutral-200"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveEditTag(tag)}
                            className="text-neutral-400 hover:text-red-500 font-bold"
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
                    onClick={() => setEditingTemplate(null)}
                    className="px-4 py-2 border border-neutral-300 text-neutral-700 text-xs font-semibold rounded-lg hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingEdit}
                    className="px-4 py-2 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                  >
                    {isSubmittingEdit ? 'Saving...' : 'Save Changes'}
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
              <h2 className="text-lg font-bold text-neutral-900 mb-1">Upload PDF Template</h2>
              <p className="text-xs text-neutral-500 mb-4">
                Upload a verified PDF contract file to use as a reusable template.
              </p>

              {actionError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
                  {actionError}
                </div>
              )}

              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Template Title (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Defaults to filename"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-[#ba0000]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Select File (.pdf)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    required
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-neutral-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-red-50 file:text-[#ba0000] hover:file:bg-red-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Tags</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Add tag"
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
                      className="px-3 py-1.5 bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-lg hover:bg-neutral-300"
                    >
                      Add
                    </button>
                  </div>
                  {uploadTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {uploadTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 bg-neutral-100 text-neutral-700 text-xs px-2.5 py-1 rounded-full border border-neutral-200"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveUploadTag(tag)}
                            className="text-neutral-400 hover:text-red-500 font-bold"
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
                    onClick={() => setShowUploadModal(false)}
                    className="px-4 py-2 border border-neutral-300 text-neutral-700 text-xs font-semibold rounded-lg hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingUpload}
                    className="px-4 py-2 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                  >
                    {isSubmittingUpload ? 'Uploading...' : 'Upload Template'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Share Template Modal (INK-270) */}
        {selectedShareTemplate && (
          <ShareTemplateModal
            templateId={selectedShareTemplate.id}
            templateTitle={selectedShareTemplate.title}
            onClose={() => setSelectedShareTemplate(null)}
            onSuccess={(msg) => setActionMessage(msg)}
          />
        )}

        {/* Template History Modal (INK-270) */}
        {selectedHistoryTemplate && (
          <TemplateHistoryModal
            templateId={selectedHistoryTemplate.id}
            templateTitle={selectedHistoryTemplate.title}
            onClose={() => setSelectedHistoryTemplate(null)}
          />
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
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-neutral-50 text-xs text-neutral-500">
            Loading template workspace...
          </div>
        }
      >
        <TemplateManagementContent />
      </Suspense>
    </SessionGuard>
  );
}
