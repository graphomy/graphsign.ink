'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { renderMarkdownToHtml } from './MarkdownEditor';
import { getApiUrl } from '@/lib/api';
import { StatusPill } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  FileText,
  Printer,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  FilePenLine,
} from 'lucide-react';

interface AgreementData {
  id: string;
  title: string;
  description?: string;
  version: string | number;
  status: string;
  markdownContent?: string;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  author?: {
    name?: string;
    email: string;
  };
}

interface PdfViewerModalProps {
  agreement: AgreementData;
  onClose: () => void;
  onOpenEditor?: () => void;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

export function PdfViewerModal({ agreement, onClose, onOpenEditor }: PdfViewerModalProps) {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages] = useState<number>(1);
  const [fetchedBlobUrl, setFetchedBlobUrl] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const showThumbnails = true;
  const printableAreaRef = useRef<HTMLDivElement>(null);

  const meta = (agreement.metadata as Record<string, unknown>) || {};
  const rawFileData =
    (meta.fileData as string | undefined) || (meta.fileBase64 as string | undefined);
  const hasFileData = !!rawFileData;

  const isPdf =
    hasFileData ||
    agreement.mimeType === 'application/pdf' ||
    agreement.fileName?.toLowerCase().endsWith('.pdf') ||
    (!agreement.markdownContent && !!agreement.fileUrl);

  const isMarkdown = !!agreement.markdownContent && !hasFileData;

  const versionDisplay = String(agreement.version).startsWith('v')
    ? agreement.version
    : `v${agreement.version}`;

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '=' || (e.key === '+' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        setZoomLevel((z) => Math.min(z + 15, 200));
      } else if (e.key === '-' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setZoomLevel((z) => Math.max(z - 15, 60));
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setCurrentPage((p) => Math.min(p + 1, totalPages));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setCurrentPage((p) => Math.max(p - 1, 1));
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, totalPages]);

  // Derive Blob URL synchronously for base64
  const inlineBlobUrl = useMemo(() => {
    if (rawFileData && typeof rawFileData === 'string') {
      try {
        let base64 = rawFileData;
        let mime = agreement.mimeType || 'application/pdf';

        if (rawFileData.startsWith('data:')) {
          const commaIdx = rawFileData.indexOf(',');
          if (commaIdx !== -1) {
            const mimeMatch = rawFileData.substring(0, commaIdx).match(/^data:([^;]+)/);
            if (mimeMatch && mimeMatch[1]) {
              mime = mimeMatch[1];
            }
            base64 = rawFileData.substring(commaIdx + 1);
          }
        }

        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mime });
        if (typeof URL.createObjectURL === 'function') {
          return URL.createObjectURL(blob);
        }
      } catch (e) {
        console.error('Error creating inline PDF object URL:', e);
      }
    }
    return null;
  }, [rawFileData, agreement.mimeType]);

  // Fetch binary file with authorization headers when inline base64 is not present
  useEffect(() => {
    if (inlineBlobUrl || isMarkdown) {
      return;
    }

    let isMounted = true;
    let createdUrl: string | null = null;

    async function loadPdfBinary() {
      setIsLoadingFile(true);
      setFetchError(null);

      try {
        const token = getToken();
        const res = await fetch(`${getApiUrl()}/api/v1/agreements/${agreement.id}/file`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error?.message || `Failed to fetch document (${res.status})`);
        }

        const blob = await res.blob();
        createdUrl = URL.createObjectURL(blob);

        if (isMounted) {
          setFetchedBlobUrl(createdUrl);
        }
      } catch (err: unknown) {
        if (isMounted) {
          console.error('Error fetching agreement file:', err);
          setFetchError((err as Error).message);
        }
      } finally {
        if (isMounted) {
          setIsLoadingFile(false);
        }
      }
    }

    loadPdfBinary();

    return () => {
      isMounted = false;
      if (createdUrl && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [agreement.id, inlineBlobUrl, isMarkdown]);

  // Clean up inline object URL on unmount
  useEffect(() => {
    return () => {
      if (inlineBlobUrl && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(inlineBlobUrl);
      }
    };
  }, [inlineBlobUrl]);

  const effectivePdfUrl = inlineBlobUrl || fetchedBlobUrl;
  const embeddedPdfUrl = effectivePdfUrl
    ? `${effectivePdfUrl}#toolbar=0&navpanes=0&scrollbar=1`
    : null;

  function handlePrint() {
    if (isPdf && effectivePdfUrl) {
      const printWindow = window.open(effectivePdfUrl, '_blank');
      if (printWindow) {
        printWindow.focus();
      }
      return;
    }
    window.print();
  }

  function handleDownload() {
    const cleanTitle = agreement.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName =
      agreement.fileName ||
      (isPdf ? `${cleanTitle}.pdf` : `${cleanTitle}_v${agreement.version}.md`);

    if (effectivePdfUrl) {
      const a = document.createElement('a');
      a.href = effectivePdfUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // Markdown file download
    const content =
      agreement.markdownContent ||
      `# ${agreement.title}\n\n${agreement.description || ''}\n\nStatus: ${agreement.status}\nVersion: ${versionDisplay}`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isPdf ? `${cleanTitle}.pdf` : `${cleanTitle}_v${agreement.version}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-viewer-title"
    >
      <div className="w-full h-full max-w-7xl bg-ink-900 rounded-xl overflow-hidden flex flex-col shadow-[0_8px_16px_-4px_rgb(16_24_40/0.08),0_24px_48px_-12px_rgb(16_24_40/0.16)] border border-ink-800">
        {/* 56px Custom Single Top Toolbar */}
        <div className="h-14 bg-white border-b border-ink-200 px-4 flex items-center justify-between gap-4 shrink-0">
          {/* Left: Document Info */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-md bg-ink-100 text-ink-700 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <h2
                id="pdf-viewer-title"
                className="text-[15px] font-semibold text-ink-900 truncate max-w-[280px] sm:max-w-md"
                title={agreement.title}
              >
                {agreement.title}
              </h2>
              <span className="text-xs font-mono font-medium text-ink-600 bg-ink-100 px-1.5 py-0.5 rounded-sm tabular-nums">
                {versionDisplay}
              </span>
              <StatusPill status={agreement.status} />
            </div>
          </div>

          {/* Centre: Page Counter & Zoom */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex items-center gap-1 bg-ink-50 border border-ink-200 rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage <= 1}
                className="p-1 rounded text-ink-600 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-xs font-medium text-ink-700 tabular-nums">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage >= totalPages}
                className="p-1 rounded text-ink-600 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1 bg-ink-50 border border-ink-200 rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(z - 15, 60))}
                className="p-1 rounded text-ink-600 hover:text-ink-900 hover:bg-ink-100"
                aria-label="Zoom out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-xs font-mono text-ink-700 min-w-[44px] text-center tabular-nums">
                {zoomLevel}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(z + 15, 200))}
                className="p-1 rounded text-ink-600 hover:text-ink-900 hover:bg-ink-100"
                aria-label="Zoom in"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                className="px-1.5 py-0.5 text-[11px] text-ink-500 hover:text-ink-900 border-l border-ink-200"
              >
                Fit
              </button>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {onOpenEditor && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<FilePenLine className="w-3.5 h-3.5" />}
                onClick={onOpenEditor}
              >
                Design fields
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Printer className="w-3.5 h-3.5" />}
              onClick={handlePrint}
            >
              Print
            </Button>

            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={handleDownload}
            >
              Download
            </Button>

            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-md text-ink-400 hover:text-ink-700 hover:bg-ink-100 flex items-center justify-center transition-colors ml-1"
              aria-label="Close viewer (Esc)"
              title="Close viewer (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Two-column Body */}
        <div className="flex-1 flex overflow-hidden bg-ink-100">
          {/* Left Thumbnail Rail */}
          {showThumbnails && (
            <aside className="w-44 bg-ink-50 border-r border-ink-200 p-3 overflow-y-auto hidden md:flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between pb-1">
                <span className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                  Pages
                </span>
                <span className="text-[11px] font-mono text-ink-400">1/1</span>
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                className={`p-2 rounded-md border text-center transition-all bg-white shadow-xs ${
                  currentPage === 1
                    ? 'border-brand-600 ring-2 ring-brand-600/20'
                    : 'border-ink-200 hover:border-ink-400'
                }`}
              >
                <div className="h-28 bg-ink-50 rounded border border-dashed border-ink-200 flex items-center justify-center text-ink-400">
                  <FileText className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-medium text-ink-700 mt-1.5 block">Page 1</span>
              </button>
            </aside>
          )}

          {/* Centre Document Viewport */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center justify-start">
            {isLoadingFile ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-ink-600 space-y-3 my-auto">
                <div className="w-8 h-8 border-2 border-ink-300 border-t-brand-600 rounded-full animate-spin" />
                <p className="text-xs font-medium">Loading document securely…</p>
              </div>
            ) : fetchError ? (
              <div className="bg-white border border-brand-200 rounded-xl p-8 max-w-md text-center text-ink-900 space-y-3 shadow-md my-auto">
                <h3 className="text-sm font-bold">Unable to load document</h3>
                <p className="text-xs text-ink-500">{fetchError}</p>
                <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </div>
            ) : isPdf && embeddedPdfUrl ? (
              <div
                style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
                className="w-full max-w-4xl h-[85vh] bg-white rounded-md shadow-lg border border-ink-200 overflow-hidden transition-transform duration-150"
              >
                <object
                  data={embeddedPdfUrl}
                  type="application/pdf"
                  className="w-full h-full border-0"
                  title={agreement.title}
                >
                  <iframe
                    src={embeddedPdfUrl}
                    className="w-full h-full border-0 bg-white"
                    title={agreement.title}
                  />
                </object>
              </div>
            ) : isMarkdown ? (
              <div
                ref={printableAreaRef}
                style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
                className="bg-white text-ink-900 w-full max-w-[850px] min-h-[1050px] shadow-lg p-8 sm:p-12 md:p-16 rounded-sm transition-transform duration-150 border border-ink-200 print:p-0 print:shadow-none print:transform-none"
              >
                <div
                  className="prose prose-sm max-w-none text-ink-900 leading-relaxed text-left font-serif"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdownToHtml(agreement.markdownContent || ''),
                  }}
                />
              </div>
            ) : (
              <div className="w-full max-w-md text-center p-8 bg-white rounded-xl border border-ink-200 shadow-md my-auto space-y-3">
                <FileText className="w-10 h-10 text-ink-400 mx-auto" />
                <h3 className="text-base font-bold text-ink-900">
                  {agreement.fileName || agreement.title}
                </h3>
                <p className="text-xs text-ink-500">
                  Source file is ready for execution. You can download the verified document file
                  directly.
                </p>
                <div className="pt-2">
                  <Button
                    variant="primary"
                    size="md"
                    leftIcon={<Download className="w-4 h-4" />}
                    onClick={handleDownload}
                  >
                    Download File
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
