'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { orDash, orLabel } from '@/lib/format';
import { PdfViewerModal } from '@/components/features/agreements/PdfViewerModal';
import { AgreementHistoryModal } from '@/components/features/agreements/AgreementHistoryModal';
import { AgreementEditModal } from '@/components/features/agreements/AgreementEditModal';
import {
  DocumentEditorModal,
  DocumentField,
  Recipient,
} from '@/components/features/agreements/DocumentEditorModal';
import { SubmitReviewModal } from '@/components/features/agreements/SubmitReviewModal';
import { ReviewDecisionModal } from '@/components/features/agreements/ReviewDecisionModal';
import { SendAgreementModal } from '@/components/features/agreements/SendAgreementModal';
import { ChooseTemplateModal } from '@/components/features/agreements/ChooseTemplateModal';
import { SendReminderModal } from '@/components/features/agreements/SendReminderModal';
import { getApiUrl } from '@/lib/api';
import { formatDateTime } from '@/lib/date-utils';
import {
  Upload,
  PenLine,
  LayoutTemplate,
  Search,
  SlidersHorizontal,
  FileText,
  Download,
  MoreHorizontal,
  Eye,
  FileSignature,
  FileClock,
  Tag,
  Copy,
  Archive,
  ArchiveRestore,
  Trash2,
  Send,
  Scale,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

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
  reviewerId?: string | null;
  reviewer?: { id?: string; name?: string; email: string };
  createdAt: string;
  updatedAt: string;
  authorId?: string;
  author?: { id?: string; name?: string; email: string };
  fields?: {
    fields?: DocumentField[];
    recipients?: Recipient[];
  };
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

function getCurrentUserInfo(): { userId: string; userEmail: string } {
  if (typeof window === 'undefined') return { userId: '', userEmail: '' };
  let userId = localStorage.getItem('graphsign_user_id') || '';
  let userEmail = localStorage.getItem('graphsign_user_email') || '';
  if (!userId || !userEmail) {
    const token =
      localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1]));
          if (!userId && payload?.sub) userId = payload.sub;
          if (!userEmail && payload?.email) userEmail = payload.email;
        }
      } catch {}
    }
  }
  return { userId, userEmail };
}

function AgreementManagementContent() {
  const [activeTab, setActiveTab] = useState<'all' | 'drafts' | 'active' | 'signed' | 'archived'>(
    'signed',
  );
  const [agreements, setAgreements] = useState<AgreementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updatedAt' | 'createdAt' | 'title'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedTag, setSelectedTag] = useState('');
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [datePreset, setDatePreset] = useState('all');
  const [authorEmailFilter, setAuthorEmailFilter] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modals state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showScratchModal, setShowScratchModal] = useState(false);
  const [showChooseTemplateModal, setShowChooseTemplateModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showDocumentEditor, setShowDocumentEditor] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [showSubmitReviewModal, setShowSubmitReviewModal] = useState(false);
  const [showReviewDecisionModal, setShowReviewDecisionModal] = useState(false);
  const [showSendAgreementModal, setShowSendAgreementModal] = useState(false);
  const [showCancelAgreementModal, setShowCancelAgreementModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState<AgreementItem | null>(null);

  // Form states
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [uploadTagInput, setUploadTagInput] = useState('');
  const [currentUser] = useState<{ userId: string; userEmail: string }>(() => getCurrentUserInfo());

  const [scratchTitle, setScratchTitle] = useState('');
  const [scratchDesc, setScratchDesc] = useState('');
  const [scratchMarkdown, setScratchMarkdown] = useState(
    '# Standard Agreement\n\n## 1. Scope and Terms\nEnter contract clauses, obligations, and deliverables in pure Markdown.\n\n## 2. Term & Termination\nThis agreement is effective upon mutual execution.\n',
  );
  const [scratchTags, setScratchTags] = useState<string[]>([]);
  const [scratchTagInput, setScratchTagInput] = useState('');

  const [tagInput, setTagInput] = useState('');
  const [tagsList, setTagsList] = useState<string[]>([]);

  // Action processing states
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingScratch, setIsCreatingScratch] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [isArchivingId, setIsArchivingId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isSavingTags, setIsSavingTags] = useState(false);

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [dropdownAnchor, setDropdownAnchor] = useState<{
    id: string;
    agreement: AgreementItem;
    top: number;
    bottom: number;
    right: number;
    isBottom: boolean;
  } | null>(null);

  useEffect(() => {
    function handleClose() {
      setDropdownAnchor(null);
    }
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, []);

  const initialQueryProcessedRef = useRef(false);

  useEffect(() => {
    const action = searchParams?.get('action');
    const qParam = searchParams?.get('q') || searchParams?.get('search');
    const timer = setTimeout(() => {
      if (qParam && !initialQueryProcessedRef.current) {
        initialQueryProcessedRef.current = true;
        setSearchQuery(qParam);
      }
      if (action === 'upload') {
        setShowUploadModal(true);
      } else if (action === 'scratch') {
        setShowScratchModal(true);
      } else if (action === 'template') {
        setShowChooseTemplateModal(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [searchParams]);

  function handleTabChange(tab: 'all' | 'drafts' | 'active' | 'signed' | 'archived') {
    setActiveTab(tab);
    setCurrentPage(1);
    setAgreements([]);
    setActionError(null);
    setActionMessage(null);
    setDropdownAnchor(null);
  }

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;

    async function load() {
      setLoading(true);
      setActionError(null);
      try {
        const isArchivedParam = activeTab === 'archived' ? 'true' : 'false';
        let statusParam = '';
        if (activeTab === 'signed') statusParam = 'SIGNED';
        else if (activeTab === 'drafts') statusParam = 'DRAFT';
        else if (activeTab === 'active') statusParam = 'ACTIVE';

        let url = `${getApiUrl()}/api/v1/search/agreements?isArchived=${isArchivedParam}&page=${currentPage}&limit=${pageSize}&sortBy=${sortBy}&sortOrder=${sortOrder}`;
        if (statusParam) url += `&status=${encodeURIComponent(statusParam)}`;
        if (searchQuery) url += `&q=${encodeURIComponent(searchQuery)}`;
        if (selectedTag) url += `&tag=${encodeURIComponent(selectedTag)}`;
        if (datePreset && datePreset !== 'all')
          url += `&datePreset=${encodeURIComponent(datePreset)}`;
        if (authorEmailFilter) url += `&authorEmail=${encodeURIComponent(authorEmailFilter)}`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${getToken()}` },
          signal: controller.signal,
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
          throw new Error(
            errData?.error?.message || errData?.message || 'Failed to load agreements.',
          );
        }

        const data = await res.json();
        if (!ignore) {
          const items: AgreementItem[] = data.data || data.items || [];
          setAgreements(items);
          if (data.pagination) {
            setPagination({
              page: data.pagination.page || currentPage,
              limit: data.pagination.limit || pageSize,
              total: data.pagination.total || items.length,
              totalPages:
                data.pagination.totalPages ||
                Math.ceil((data.pagination.total || items.length) / pageSize) ||
                1,
            });
          } else {
            setPagination({
              page: currentPage,
              limit: pageSize,
              total: items.length,
              totalPages: Math.ceil(items.length / pageSize) || 1,
            });
          }
        }
      } catch (err: unknown) {
        const isAbort =
          ignore ||
          (err instanceof Error &&
            (err.name === 'AbortError' || err.message.toLowerCase().includes('abort')));
        if (!isAbort) {
          console.error(err);
          setActionError(err instanceof Error ? err.message : 'Failed to load agreements.');
          setAgreements([]);
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
      controller.abort();
    };
  }, [
    activeTab,
    searchQuery,
    sortBy,
    sortOrder,
    selectedTag,
    datePreset,
    authorEmailFilter,
    currentPage,
    pageSize,
    refreshTrigger,
    router,
  ]);

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isUploading) return;
    setActionError(null);
    setActionMessage(null);

    if (!uploadFile) {
      setActionError('Please select a valid document file (.pdf, .docx, or .md).');
      return;
    }

    setIsUploading(true);
    try {
      const isMd =
        uploadFile.name.toLowerCase().endsWith('.md') ||
        uploadFile.type === 'text/markdown' ||
        uploadFile.type === 'text/plain';

      let markdownContent: string | undefined = undefined;
      let fileBase64: string | undefined = undefined;

      if (isMd) {
        markdownContent = await uploadFile.text();
      } else {
        fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(uploadFile);
        });
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
          fileBase64,
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
      setCurrentPage(1);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleScratchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isCreatingScratch) return;
    setActionError(null);
    setActionMessage(null);

    if (!scratchTitle || scratchTitle.trim().length < 2) {
      setActionError('Agreement title must be at least 2 characters long.');
      return;
    }

    setIsCreatingScratch(true);
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
      setCurrentPage(1);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setIsCreatingScratch(false);
    }
  }

  async function handleClone(id: string) {
    if (cloningId) return;
    setActionError(null);
    setCloningId(id);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${id}/clone`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error('Failed to clone agreement.');
      setActionMessage('Agreement cloned successfully into a new draft (v0.1).');
      setActiveTab('drafts');
      setCurrentPage(1);
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setCloningId(null);
    }
  }

  async function handleArchiveToggle(id: string, isArchived: boolean) {
    if (isArchivingId) return;
    setActionError(null);
    setIsArchivingId(id);
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
    } finally {
      setIsArchivingId(null);
    }
  }

  async function handleRetractReview(id: string, title: string) {
    if (
      !confirm(
        `Are you sure you want to retract the review request for "${title}"? The document will return to Draft status so you can make updates and resubmit it.`,
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${id}/review/retract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data?.error?.message || data?.message || 'Failed to retract review request.',
        );
      }

      setActionMessage(
        `Review request for "${title}" has been retracted. Document returned to Draft.`,
      );
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handleDownloadAgreement(agreement: AgreementItem) {
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${agreement.id}/file`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to download document');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanTitle = agreement.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = agreement.fileName || `${cleanTitle}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    }
  }

  async function handleDeleteAgreement(id: string) {
    if (
      !confirm(
        'Are you sure you want to delete this agreement record? This action cannot be undone.',
      )
    ) {
      return;
    }
    setActionError(null);
    setDropdownAnchor(null);
    setIsDeletingId(id);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || data?.message || 'Failed to delete agreement.');
      }

      setActionMessage('Agreement deleted successfully.');
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setIsDeletingId(null);
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

  function openDocumentEditor(agreement: AgreementItem) {
    setSelectedAgreement(agreement);
    setShowDocumentEditor(true);
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
    if (!selectedAgreement || isSavingTags) return;
    setIsSavingTags(true);
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
    } finally {
      setIsSavingTags(false);
    }
  }

  function formatVersion(ver: string | number) {
    const s = String(ver);
    return s.startsWith('v') || s.startsWith('V') ? s : `v${s}`;
  }

  const startItem = pagination.total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, pagination.total);

  const tabCounts = {
    all: activeTab === 'all' ? pagination.total : undefined,
    drafts: activeTab === 'drafts' ? pagination.total : undefined,
    active: activeTab === 'active' ? pagination.total : undefined,
    signed: activeTab === 'signed' ? pagination.total : undefined,
    archived: activeTab === 'archived' ? pagination.total : undefined,
  };

  return (
    <div className="min-h-screen bg-ink-50 flex flex-col font-sans text-ink-900">
      <HeaderNav />

      <main className="flex-1 max-w-[1440px] mx-auto w-full px-6 lg:px-8 pt-8 pb-12 space-y-8">
        {/* Page Header (No emoji) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink-900 tracking-tight">
              Agreements <span className="sr-only">Agreement Management</span>
            </h1>
            <p className="text-[13px] text-ink-500 mt-1">
              Draft, send, and track agreements with a verifiable audit history.
            </p>
          </div>

          {/* Right-aligned action cluster: Only ONE primary button */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <Button
              variant="primary"
              size="md"
              leftIcon={<Upload className="w-4 h-4" />}
              onClick={() => {
                setActionError(null);
                setShowUploadModal(true);
              }}
            >
              Upload agreement
            </Button>
            <Button
              variant="outline"
              size="md"
              leftIcon={<PenLine className="w-4 h-4" />}
              onClick={() => {
                setActionError(null);
                setShowScratchModal(true);
              }}
            >
              Create from scratch
            </Button>
            <Button
              variant="ghost"
              size="md"
              leftIcon={<LayoutTemplate className="w-4 h-4" />}
              onClick={() => {
                setActionError(null);
                setShowChooseTemplateModal(true);
              }}
            >
              From template
            </Button>
          </div>
        </div>

        {/* Action / Error Alerts */}
        {actionMessage && (
          <div className="rounded-md bg-verified-50 border border-verified-200 p-3.5 text-xs font-medium text-verified-700 flex items-center justify-between shadow-xs">
            <span>{actionMessage}</span>
            <button
              onClick={() => setActionMessage(null)}
              className="font-bold text-verified-700 hover:text-verified-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {actionError && (
          <div className="rounded-md bg-brand-50 border border-brand-200 p-3.5 text-xs font-medium text-brand-700 flex items-center justify-between shadow-xs">
            <span>{actionError}</span>
            <button
              onClick={() => setActionError(null)}
              className="font-bold text-brand-700 hover:text-brand-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Verification Callout Banner (Issue 5) */}
        <div className="rounded-xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm border border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 flex items-center justify-center font-bold text-lg shrink-0">
              🛡️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white">Independent Document &amp; Seal Verification</h4>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Public Trust
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Verify any signed agreement by document token, envelope ID, or by uploading the sealed PDF.
              </p>
            </div>
          </div>
          <Link
            href="/verify"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-sm shrink-0"
          >
            Verify a Document <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Table Card Container */}
        <Card elevation="e0" className="overflow-hidden border border-ink-200">
          {/* Filter Bar inside Table Card */}
          <div className="p-4 border-b border-ink-200 bg-white space-y-3">
            {/* Status Tabs Segmented Control */}
            <div className="inline-flex items-center p-1 rounded-full bg-ink-100 gap-1">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'drafts', label: 'Drafts' },
                  { key: 'active', label: 'Active' },
                  { key: 'signed', label: 'Signed' },
                  { key: 'archived', label: 'Archived' },
                ] as const
              ).map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleTabChange(tab.key)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-white text-ink-900 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_1px_3px_rgb(16_24_40/0.06)] font-semibold'
                        : 'text-ink-500 hover:text-ink-900'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {isActive && pagination.total > 0 && (
                      <span className="h-4 min-w-4 px-1 rounded-full bg-ink-200 text-ink-600 text-[10px] flex items-center justify-center font-bold">
                        {pagination.total}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Single-Row Search, Sort, Filters Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title, tag, recipient, or content"
                  className="w-full h-10 pl-9 pr-3 text-sm bg-white border border-ink-200 rounded-md text-ink-900 placeholder:text-ink-400 focus:border-ink-900 focus:ring-2 focus:ring-ink-950/10 focus:outline-none transition-colors"
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'updatedAt' | 'createdAt' | 'title')}
                className="h-10 w-full sm:w-[180px] bg-white border border-ink-200 rounded-md px-3 text-xs font-medium text-ink-700 focus:border-ink-900 focus:outline-none cursor-pointer"
              >
                <option value="updatedAt">Sort: Last Modified</option>
                <option value="createdAt">Sort: Date Created</option>
                <option value="title">Sort: Title (A-Z)</option>
              </select>

              <div className="relative">
                <Button
                  variant="ghost"
                  size="md"
                  leftIcon={<SlidersHorizontal className="w-4 h-4" />}
                  onClick={() => setShowFilterPopover(!showFilterPopover)}
                >
                  Filters
                </Button>

                {showFilterPopover && (
                  <div className="absolute right-0 mt-2 w-72 bg-white border border-ink-200 rounded-lg p-4 shadow-[0_4px_8px_-2px_rgb(16_24_40/0.06),0_12px_24px_-4px_rgb(16_24_40/0.08)] z-20 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-ink-100">
                      <span className="text-xs font-bold text-ink-900">Advanced Filters</span>
                      <button
                        onClick={() => {
                          setSelectedTag('');
                          setDatePreset('all');
                          setAuthorEmailFilter('');
                          setShowFilterPopover(false);
                        }}
                        className="text-[11px] text-brand-700 hover:underline"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-ink-700">Date Range</label>
                      <select
                        value={datePreset}
                        onChange={(e) => setDatePreset(e.target.value)}
                        className="w-full h-8 text-xs border border-ink-200 rounded-md px-2 bg-white text-ink-900"
                      >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="week">Past 7 Days</option>
                        <option value="month">Past 30 Days</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-ink-700">Filter by Tag</label>
                      <input
                        type="text"
                        value={selectedTag}
                        onChange={(e) => setSelectedTag(e.target.value)}
                        placeholder="e.g. legal, nda"
                        className="w-full h-8 text-xs border border-ink-200 rounded-md px-2 bg-white text-ink-900"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-ink-700">Author Email</label>
                      <input
                        type="text"
                        value={authorEmailFilter}
                        onChange={(e) => setAuthorEmailFilter(e.target.value)}
                        placeholder="author@example.com"
                        className="w-full h-8 text-xs border border-ink-200 rounded-md px-2 bg-white text-ink-900"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Table Content */}
          {loading ? (
            <div className="divide-y divide-ink-100">
              {[1, 2, 3, 4, 5].map((idx) => (
                <div key={idx} className="h-16 px-4 flex items-center gap-4">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              ))}
            </div>
          ) : agreements.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-ink-100 text-ink-400 mx-auto flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-ink-900">No agreements here yet</h3>
              <p className="text-[13px] text-ink-500 max-w-sm mx-auto">
                {activeTab === 'drafts'
                  ? 'Create or upload contract drafts to prepare them for review and signature.'
                  : activeTab === 'active'
                    ? 'Agreements sent out for signature will appear here with live tracking.'
                    : activeTab === 'signed'
                      ? 'Fully executed contracts with tamper-evident audit trails will appear here.'
                      : 'Draft, upload, or generate contracts from templates to get started.'}
              </p>
              <div className="pt-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setShowUploadModal(true)}
                  leftIcon={<Upload className="w-4 h-4" />}
                >
                  Upload agreement
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-ink-50 h-11 border-b border-ink-200 text-ink-500 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-4 font-semibold">Document Details</th>
                    <th className="py-2.5 px-3 font-semibold w-[100px]">Version</th>
                    <th className="py-2.5 px-3 font-semibold w-[140px]">Status</th>
                    <th className="py-2.5 px-3 font-semibold w-[120px]">Recipients</th>
                    <th className="py-2.5 px-3 font-semibold w-[160px]">Last Modified</th>
                    <th className="py-2.5 px-3 font-semibold w-[140px]">Author</th>
                    <th className="py-2.5 px-4 font-semibold text-right w-[120px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {agreements.map((agreement) => {
                    const isDraft = agreement.status === 'DRAFT' || agreement.status === 'REJECTED';
                    const isInReview = agreement.status === 'IN_REVIEW';
                    const isReviewer = Boolean(
                      (currentUser.userId && agreement.reviewerId === currentUser.userId) ||
                      (currentUser.userEmail &&
                        agreement.reviewer?.email?.toLowerCase() ===
                          currentUser.userEmail.toLowerCase()),
                    );

                    return (
                      <tr
                        key={agreement.id}
                        className="h-16 hover:bg-ink-50 transition-colors group cursor-pointer"
                        onClick={() => openPdfViewer(agreement)}
                      >
                        {/* Document Title & Tags */}
                        <td className="py-2.5 px-4 max-w-xs sm:max-w-sm md:max-w-md">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-md bg-ink-100 text-ink-600 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 space-y-0.5">
                              <span className="text-[15px] font-semibold text-ink-900 truncate block">
                                {agreement.title}
                              </span>
                              {agreement.tags && agreement.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {agreement.tags.map((tag, tIdx) => (
                                    <span
                                      key={tIdx}
                                      className="text-[11px] font-medium bg-ink-100 text-ink-600 px-1.5 py-0.2 rounded-sm"
                                    >
                                      #{tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Version chip */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="text-[13px] font-mono font-medium text-ink-700 bg-ink-100 px-2 py-0.5 rounded-sm tabular-nums">
                            {formatVersion(agreement.version)}
                          </span>
                        </td>

                        {/* Status pill */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <StatusPill status={agreement.status} />
                        </td>

                        {/* Recipients stacked avatar */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {agreement.fields?.recipients &&
                          agreement.fields.recipients.length > 0 ? (
                            <div className="flex items-center -space-x-1.5">
                              {agreement.fields.recipients.slice(0, 3).map((rec, rIdx) => (
                                <div
                                  key={rIdx}
                                  title={`${rec.name} (${rec.email})`}
                                  className="h-6 w-6 rounded-full bg-brand-600 text-white text-[10px] font-bold ring-2 ring-white flex items-center justify-center"
                                >
                                  {rec.name?.charAt(0).toUpperCase() || 'R'}
                                </div>
                              ))}
                              {agreement.fields.recipients.length > 3 && (
                                <div className="h-6 w-6 rounded-full bg-ink-200 text-ink-700 text-[10px] font-bold ring-2 ring-white flex items-center justify-center">
                                  +{agreement.fields.recipients.length - 3}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[13px] text-ink-400 italic">—</span>
                          )}
                        </td>

                        {/* Last modified date */}
                        <td
                          className="py-2.5 px-3 whitespace-nowrap text-[13px] text-ink-700 tabular-nums"
                          title={new Date(agreement.updatedAt).toLocaleString()}
                        >
                          {formatDateTime(agreement.updatedAt)}
                        </td>

                        {/* Author */}
                        <td className="py-2.5 px-3 whitespace-nowrap text-[13px] text-ink-700">
                          {orLabel(agreement.author?.name, orDash(agreement.author?.email))}
                        </td>

                        {/* Actions */}
                        <td
                          className="py-2.5 px-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {/* Primary row action buttons for tests and quick workflows */}
                            {isDraft && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedAgreement(agreement);
                                    setShowSubmitReviewModal(true);
                                  }}
                                  className="p-1.5 text-ink-600 hover:text-ink-900 hover:bg-ink-100 rounded transition-colors"
                                  title="Submit for Review"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(agreement)}
                                  className="p-1.5 text-ink-600 hover:text-ink-900 hover:bg-ink-100 rounded transition-colors"
                                  title="Edit Document"
                                >
                                  <PenLine className="w-4 h-4" />
                                </button>
                              </>
                            )}

                            {isInReview && isReviewer && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAgreement(agreement);
                                  setShowReviewDecisionModal(true);
                                }}
                                className="p-1.5 text-ink-600 hover:text-ink-900 hover:bg-ink-100 rounded transition-colors"
                                title="Review Decision"
                              >
                                <Scale className="w-4 h-4" />
                              </button>
                            )}

                            {activeTab === 'active' &&
                              !agreement.isArchived &&
                              !isInReview &&
                              agreement.status !== 'SENT' &&
                              agreement.status !== 'SENT_FOR_SIGNATURE' &&
                              agreement.status !== 'PARTIALLY_SIGNED' &&
                              agreement.status !== 'COMPLETED' &&
                              agreement.status !== 'SIGNED' && (
                                <button
                                  type="button"
                                  onClick={() => openDocumentEditor(agreement)}
                                  className="p-1.5 text-ink-600 hover:text-ink-900 hover:bg-ink-100 rounded transition-colors"
                                  title="Send for Signature"
                                >
                                  <FileSignature className="w-4 h-4" />
                                </button>
                              )}

                            {/* View PDF */}
                            <button
                              type="button"
                              onClick={() => openPdfViewer(agreement)}
                              className="p-1.5 text-ink-600 hover:text-ink-900 hover:bg-ink-100 rounded transition-colors"
                              title="View PDF"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Download */}
                            <button
                              type="button"
                              onClick={() => handleDownloadAgreement(agreement)}
                              className="p-1.5 text-ink-600 hover:text-ink-900 hover:bg-ink-100 rounded transition-colors"
                              title="Download Signed Document"
                            >
                              <Download className="w-4 h-4" />
                            </button>

                            {/* Overflow Menu */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                const isBottom = rect.bottom + 240 > window.innerHeight;
                                setDropdownAnchor({
                                  id: agreement.id,
                                  agreement,
                                  top: rect.bottom + 4,
                                  bottom: rect.top - 4,
                                  right: window.innerWidth - rect.right,
                                  isBottom,
                                });
                              }}
                              className="p-1.5 text-ink-600 hover:text-ink-900 hover:bg-ink-100 rounded transition-colors"
                              title="More actions"
                              aria-label="More actions"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Table Footer: 48px bar */}
          <div className="h-12 bg-ink-50 border-t border-ink-200 px-4 flex items-center justify-between text-[13px] text-ink-500">
            <div>
              Showing <span className="font-semibold text-ink-900">{startItem}</span> to{' '}
              <span className="font-semibold text-ink-900">{endItem}</span> of{' '}
              <span className="font-semibold text-ink-900">{pagination.total}</span> agreements
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
                >
                  Previous
                </Button>

                <span className="px-2 text-xs font-mono tabular-nums">
                  Page {currentPage} of {pagination.totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= pagination.totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, pagination.totalPages))}
                  rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </Card>
      </main>

      {/* Overflow Dropdown Portal */}
      {dropdownAnchor &&
        createPortal(
          <div
            className="fixed bg-white border border-ink-200 rounded-lg shadow-[0_4px_8px_-2px_rgb(16_24_40/0.06),0_12px_24px_-4px_rgb(16_24_40/0.08)] py-1 min-w-[180px] z-50 animate-in fade-in duration-100"
            style={{
              top: dropdownAnchor.isBottom ? undefined : `${dropdownAnchor.top}px`,
              bottom: dropdownAnchor.isBottom
                ? `${window.innerHeight - dropdownAnchor.bottom}px`
                : undefined,
              right: `${dropdownAnchor.right}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                const ag = dropdownAnchor.agreement;
                setDropdownAnchor(null);
                openPdfViewer(ag);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-50 flex items-center gap-2"
            >
              <Eye className="w-3.5 h-3.5 text-ink-400" />
              View PDF
            </button>

            <button
              onClick={() => {
                const ag = dropdownAnchor.agreement;
                setDropdownAnchor(null);
                handleClone(ag.id);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-50 flex items-center gap-2"
            >
              <Copy className="w-3.5 h-3.5 text-ink-400" />
              Clone
            </button>

            <button
              onClick={() => {
                const ag = dropdownAnchor.agreement;
                setDropdownAnchor(null);
                openHistoryModal(ag);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-50 flex items-center gap-2"
            >
              <FileClock className="w-3.5 h-3.5 text-ink-400" />
              History
            </button>

            <button
              onClick={() => {
                const ag = dropdownAnchor.agreement;
                setDropdownAnchor(null);
                openMetadataModal(ag);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-50 flex items-center gap-2"
            >
              <Tag className="w-3.5 h-3.5 text-ink-400" />
              Tags
            </button>

            <button
              onClick={() => {
                const ag = dropdownAnchor.agreement;
                setDropdownAnchor(null);
                handleArchiveToggle(ag.id, !ag.isArchived);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-ink-700 hover:bg-ink-50 flex items-center gap-2"
            >
              {dropdownAnchor.agreement.isArchived ? (
                <>
                  <ArchiveRestore className="w-3.5 h-3.5 text-ink-400" />
                  Unarchive
                </>
              ) : (
                <>
                  <Archive className="w-3.5 h-3.5 text-ink-400" />
                  Archive
                </>
              )}
            </button>

            <div className="my-1 border-t border-ink-100" />

            <button
              onClick={() => {
                const ag = dropdownAnchor.agreement;
                setDropdownAnchor(null);
                handleDeleteAgreement(ag.id);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-brand-600 hover:bg-brand-50 flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5 text-brand-600" />
              Delete
            </button>
          </div>,
          document.body,
        )}

      {/* Upload Modal (PDF / DOCX / MD) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-ink-950/55 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-ink-200 rounded-xl p-6 max-w-lg w-full shadow-[0_8px_16px_-4px_rgb(16_24_40/0.08),0_24px_48px_-12px_rgb(16_24_40/0.16)]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-ink-900">Upload agreement</h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-ink-400 hover:text-ink-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-ink-500 mb-4">
              Upload a <strong>PDF or DOCX</strong> (becomes active contract at v1.0) or a{' '}
              <strong>Markdown (.md)</strong> file (becomes draft at v0.1).
            </p>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">
                  Agreement Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Services Agreement 2026"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full bg-white border border-ink-200 rounded-md px-3 py-2 text-xs text-ink-900 focus:border-ink-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">
                  Select File (.PDF, .DOCX, .MD up to 15MB)
                </label>
                <input
                  type="file"
                  required
                  accept=".pdf,.docx,.doc,.md,text/markdown,text/plain"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full bg-ink-50 border border-ink-200 rounded-md p-2 text-xs text-ink-700"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">
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
                        if (
                          uploadTagInput.trim() &&
                          !uploadTags.includes(uploadTagInput.trim().toLowerCase())
                        ) {
                          setUploadTags([...uploadTags, uploadTagInput.trim().toLowerCase()]);
                          setUploadTagInput('');
                        }
                      }
                    }}
                    className="flex-1 bg-white border border-ink-200 rounded-md px-3 py-1.5 text-xs text-ink-900 focus:border-ink-900 focus:outline-none"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (
                        uploadTagInput.trim() &&
                        !uploadTags.includes(uploadTagInput.trim().toLowerCase())
                      ) {
                        setUploadTags([...uploadTags, uploadTagInput.trim().toLowerCase()]);
                        setUploadTagInput('');
                      }
                    }}
                  >
                    Add Tag
                  </Button>
                </div>
                {uploadTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2 bg-ink-50 border border-ink-200 rounded-md">
                    {uploadTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 bg-white border border-ink-200 text-ink-800 text-[11px] font-medium px-2 py-0.5 rounded-sm"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => setUploadTags(uploadTags.filter((t) => t !== tag))}
                          className="text-ink-400 hover:text-brand-600 font-bold"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setShowUploadModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md" isLoading={isUploading}>
                  Upload Document
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create from Scratch Modal */}
      {showScratchModal && (
        <div className="fixed inset-0 z-50 bg-ink-950/55 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-ink-200 rounded-xl p-6 max-w-2xl w-full shadow-[0_8px_16px_-4px_rgb(16_24_40/0.08),0_24px_48px_-12px_rgb(16_24_40/0.16)] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink-900">Create agreement from scratch</h2>
              <button
                onClick={() => setShowScratchModal(false)}
                className="text-ink-400 hover:text-ink-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleScratchSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Non-Disclosure Agreement"
                  value={scratchTitle}
                  onChange={(e) => setScratchTitle(e.target.value)}
                  className="w-full bg-white border border-ink-200 rounded-md px-3 py-2 text-xs text-ink-900 focus:border-ink-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">
                  Markdown Body
                </label>
                <textarea
                  rows={8}
                  required
                  value={scratchMarkdown}
                  onChange={(e) => setScratchMarkdown(e.target.value)}
                  className="w-full bg-white border border-ink-200 rounded-md p-3 text-xs font-mono text-ink-900 focus:border-ink-900 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setShowScratchModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="md" isLoading={isCreatingScratch}>
                  Create Draft
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Other Feature Modals */}
      {showChooseTemplateModal && (
        <ChooseTemplateModal
          onClose={() => setShowChooseTemplateModal(false)}
          onSuccess={() => {
            setShowChooseTemplateModal(false);
            setRefreshTrigger((p) => p + 1);
          }}
        />
      )}

      {showPdfModal && selectedAgreement && (
        <PdfViewerModal
          agreement={selectedAgreement}
          onClose={() => {
            setShowPdfModal(false);
            setSelectedAgreement(null);
          }}
          onOpenEditor={() => {
            setShowPdfModal(false);
            if (selectedAgreement) openDocumentEditor(selectedAgreement);
          }}
        />
      )}

      {showDocumentEditor && selectedAgreement && (
        <DocumentEditorModal
          agreement={selectedAgreement}
          onClose={() => {
            setShowDocumentEditor(false);
            setSelectedAgreement(null);
            setRefreshTrigger((p) => p + 1);
          }}
        />
      )}

      {showEditModal && selectedAgreement && (
        <AgreementEditModal
          agreementId={selectedAgreement.id}
          initialTitle={selectedAgreement.title}
          currentVersion={selectedAgreement.version || 'v1.0'}
          currentStatus={selectedAgreement.status}
          onSuccess={(msg) => {
            setActionMessage(msg || 'Agreement updated successfully');
            setShowEditModal(false);
            setSelectedAgreement(null);
            setRefreshTrigger((p) => p + 1);
          }}
          onClose={() => {
            setShowEditModal(false);
            setSelectedAgreement(null);
            setRefreshTrigger((p) => p + 1);
          }}
        />
      )}

      {showHistoryModal && selectedAgreement && (
        <AgreementHistoryModal
          agreementId={selectedAgreement.id}
          agreementTitle={selectedAgreement.title}
          currentVersion={selectedAgreement.version || 'v1.0'}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedAgreement(null);
          }}
        />
      )}

      {showSubmitReviewModal && selectedAgreement && (
        <SubmitReviewModal
          agreementId={selectedAgreement.id}
          agreementTitle={selectedAgreement.title}
          onSuccess={() => {
            setRefreshTrigger((p) => p + 1);
          }}
          onClose={() => {
            setShowSubmitReviewModal(false);
            setSelectedAgreement(null);
            setRefreshTrigger((p) => p + 1);
          }}
        />
      )}

      {showReviewDecisionModal && selectedAgreement && (
        <ReviewDecisionModal
          agreementId={selectedAgreement.id}
          agreementTitle={selectedAgreement.title}
          onSuccess={() => {
            setRefreshTrigger((p) => p + 1);
          }}
          onClose={() => {
            setShowReviewDecisionModal(false);
            setSelectedAgreement(null);
            setRefreshTrigger((p) => p + 1);
          }}
        />
      )}

      {showSendAgreementModal && selectedAgreement && (
        <SendAgreementModal
          agreementId={selectedAgreement.id}
          agreementTitle={selectedAgreement.title}
          onSuccess={() => {
            setRefreshTrigger((p) => p + 1);
          }}
          onClose={() => {
            setShowSendAgreementModal(false);
            setSelectedAgreement(null);
            setRefreshTrigger((p) => p + 1);
          }}
        />
      )}

      {showReminderModal && selectedAgreement && (
        <SendReminderModal
          isOpen={showReminderModal}
          agreementId={selectedAgreement.id}
          agreementTitle={selectedAgreement.title}
          onClose={() => {
            setShowReminderModal(false);
            setSelectedAgreement(null);
          }}
        />
      )}

      {showMetadataModal && selectedAgreement && (
        <div className="fixed inset-0 z-50 bg-ink-950/55 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-ink-200 rounded-xl p-6 max-w-md w-full shadow-lg space-y-4">
            <h2 className="text-base font-bold text-ink-900">Manage Document Tags</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter tag name"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="flex-1 bg-white border border-ink-200 rounded-md px-3 py-1.5 text-xs text-ink-900 focus:border-ink-900 focus:outline-none"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddTag}>
                Add
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5 p-3 bg-ink-50 border border-ink-200 rounded-md min-h-[60px]">
              {tagsList.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 bg-white border border-ink-200 text-ink-800 text-xs px-2 py-0.5 rounded-sm"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="text-ink-400 hover:text-brand-600 font-bold"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setShowMetadataModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                isLoading={isSavingTags}
                onClick={handleSaveTags}
              >
                Save Tags
              </Button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

export default function AgreementManagementPage() {
  return (
    <SessionGuard>
      <Suspense
        fallback={
          <div className="min-h-screen bg-ink-50 p-8 text-center text-xs text-ink-400">
            Loading agreements workspace...
          </div>
        }
      >
        <AgreementManagementContent />
      </Suspense>
    </SessionGuard>
  );
}
