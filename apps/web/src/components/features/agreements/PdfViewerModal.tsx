'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { renderMarkdownToHtml } from './MarkdownEditor';
import { getApiUrl } from '@/lib/api';
import { formatStatus } from '@/lib/date-utils';

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
  const [fetchedBlobUrl, setFetchedBlobUrl] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
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

  // Derive Blob URL synchronously for base64 uploaded PDF data if present
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

  function handleZoomIn() {
    setZoomLevel((prev) => Math.min(prev + 15, 160));
  }

  function handleZoomOut() {
    setZoomLevel((prev) => Math.max(prev - 15, 60));
  }

  function handleResetZoom() {
    setZoomLevel(100);
  }

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

  function handleOpenOriginal() {
    if (effectivePdfUrl) {
      window.open(effectivePdfUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // For markdown documents, open a clean printable view in new tab
    const cleanContent =
      agreement.markdownContent || `# ${agreement.title}\n\n${agreement.description || ''}`;
    const blob = new Blob(
      [
        `<!DOCTYPE html><html><head><title>${agreement.title}</title><style>body{font-family:sans-serif;padding:40px;max-width:800px;margin:auto;line-height:1.6;color:#111;}</style></head><body>${renderMarkdownToHtml(cleanContent)}</body></html>`,
      ],
      { type: 'text/html;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
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
      `# ${agreement.title}\n\n${agreement.description || ''}\n\nStatus: ${formatStatus(agreement.status)}\nVersion: ${versionDisplay}`;
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
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col justify-between p-2 sm:p-4 md:p-6 overflow-hidden">
      {/* Top PDF Controls Toolbar */}
      <div className="bg-neutral-900 text-white rounded-t-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-lg border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <span className="text-xl">{isPdf ? '📑' : '📝'}</span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-neutral-100 max-w-md truncate">
                {agreement.title}
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-600/30 text-green-400 border border-green-500/40">
                {formatStatus(agreement.status)} {versionDisplay}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              {isPdf ? 'Source PDF View' : 'Document View'} • Created by{' '}
              {agreement.author?.name || agreement.author?.email || 'Author'}
            </p>
          </div>
        </div>

        {/* Zoom & Action Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom controls (for markdown document view) */}
          {isMarkdown && (
            <div className="flex items-center bg-neutral-800 rounded-lg p-0.5 border border-neutral-700">
              <button
                onClick={handleZoomOut}
                className="px-2.5 py-1 text-xs text-neutral-300 hover:text-white hover:bg-neutral-700 rounded transition-colors font-bold"
                title="Zoom Out"
              >
                −
              </button>
              <span className="px-2 text-xs font-mono text-neutral-300 min-w-[48px] text-center">
                {zoomLevel}%
              </span>
              <button
                onClick={handleZoomIn}
                className="px-2.5 py-1 text-xs text-neutral-300 hover:text-white hover:bg-neutral-700 rounded transition-colors font-bold"
                title="Zoom In"
              >
                +
              </button>
              <button
                onClick={handleResetZoom}
                className="px-2 py-1 text-[10px] text-neutral-400 hover:text-neutral-200 border-l border-neutral-700 ml-0.5"
                title="Reset Zoom"
              >
                100%
              </button>
            </div>
          )}

          {onOpenEditor && (
            <button
              onClick={() => {
                onClose();
                onOpenEditor();
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              title="Open Visual Document Editor"
            >
              <span>✏️</span> Design Fields
            </button>
          )}

          {/* Open Original File / New Tab Button */}
          <button
            onClick={handleOpenOriginal}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-lg border border-neutral-700 transition-colors flex items-center gap-1.5"
            title="Open Original File in New Tab"
          >
            <span>🔗</span> Open Original File
          </button>

          <button
            onClick={handlePrint}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-lg border border-neutral-700 transition-colors flex items-center gap-1.5"
            title="Print Document"
          >
            <span>🖨️</span> Print
          </button>

          <button
            onClick={handleDownload}
            className="px-3 py-1.5 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            title="Download Document"
          >
            <span>⬇️</span> Download
          </button>

          <button
            onClick={onClose}
            className="p-1.5 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded-lg transition-colors text-lg font-bold ml-2"
            title="Close Viewer"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Document View Canvas */}
      <div className="flex-1 bg-neutral-900 p-2 sm:p-4 md:p-6 overflow-hidden flex justify-center items-center">
        {isLoadingFile ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-white space-y-3">
            <div className="w-8 h-8 border-3 border-neutral-600 border-t-white rounded-full animate-spin" />
            <p className="text-xs text-neutral-300 font-medium">Loading document securely...</p>
          </div>
        ) : fetchError ? (
          <div className="bg-neutral-800 border border-red-500/40 rounded-xl p-8 max-w-md text-center text-white space-y-4 shadow-xl">
            <div className="text-4xl text-red-400">⚠️</div>
            <h3 className="text-sm font-bold text-neutral-100">Unable to load document</h3>
            <p className="text-xs text-neutral-400">{fetchError}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-xs font-semibold"
            >
              Retry
            </button>
          </div>
        ) : isPdf && effectivePdfUrl ? (
          <div className="w-full h-full rounded-b-lg overflow-hidden bg-neutral-800 border border-neutral-700 shadow-2xl flex flex-col">
            <iframe
              src={effectivePdfUrl}
              className="w-full h-full min-h-[600px] border-0 bg-white"
              title={agreement.title}
            />
          </div>
        ) : isMarkdown ? (
          <div className="w-full h-full overflow-y-auto flex justify-center p-2 sm:p-4">
            <div
              ref={printableAreaRef}
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
              className="bg-white text-neutral-900 w-full max-w-[850px] min-h-[1050px] shadow-2xl p-8 sm:p-12 md:p-16 rounded-sm transition-transform duration-150 border border-neutral-300 print:p-0 print:shadow-none print:transform-none"
            >
              <div
                className="prose prose-sm max-w-none text-neutral-900 leading-relaxed text-left font-serif"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdownToHtml(agreement.markdownContent || ''),
                }}
              />
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 bg-neutral-800 rounded-b-lg border border-neutral-700">
            <div className="text-5xl mb-4">📄</div>
            <h3 className="text-base font-bold text-neutral-100 mb-2">
              {agreement.fileName || agreement.title}
            </h3>
            <p className="text-xs text-neutral-400 max-w-md mb-6">
              Source file is ready for execution. You can view or download the original file
              directly.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenOriginal}
                className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
              >
                <span>🔗</span> Open Original File
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-[#ba0000] hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
              >
                <span>⬇️</span> Download File
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Modal Close Bar */}
      <div className="bg-neutral-900 text-neutral-400 px-4 py-2 text-center text-xs rounded-b-xl border-t border-neutral-800">
        Press <span className="bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-200">ESC</span> or
        click close to return to agreements list.
      </div>
    </div>
  );
}
