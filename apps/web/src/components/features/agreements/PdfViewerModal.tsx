'use client';

import React, { useState, useRef } from 'react';
import { renderMarkdownToHtml } from './MarkdownEditor';

interface AgreementData {
  id: string;
  title: string;
  description?: string;
  version: string | number;
  status: string;
  markdownContent?: string;
  fileUrl?: string;
  fileName?: string;
  tags?: string[];
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
}

export function PdfViewerModal({ agreement, onClose }: PdfViewerModalProps) {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const printableAreaRef = useRef<HTMLDivElement>(null);

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
    window.print();
  }

  function handleDownload() {
    // Generate text/markdown or printable HTML blob download
    const title = agreement.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const content =
      agreement.markdownContent ||
      `# ${agreement.title}\n\n${agreement.description || ''}\n\nStatus: ${agreement.status}\nVersion: v${agreement.version}`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}_v${agreement.version}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const isMarkdown = !!agreement.markdownContent;
  const versionDisplay = String(agreement.version).startsWith('v')
    ? agreement.version
    : `v${agreement.version}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col justify-between p-2 sm:p-4 md:p-6 overflow-hidden">
      {/* Top PDF Controls Toolbar */}
      <div className="bg-neutral-900 text-white rounded-t-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-lg border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <span className="text-xl">📑</span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-neutral-100 max-w-md truncate">
                {agreement.title}
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-600/30 text-green-400 border border-green-500/40">
                ACTIVE {versionDisplay}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              PDF Mode • Created by {agreement.author?.name || agreement.author?.email || 'Author'}
            </p>
          </div>
        </div>

        {/* Zoom & Action Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
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

          <button
            onClick={handlePrint}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-lg border border-neutral-700 transition-colors flex items-center gap-1.5"
            title="Print Document"
          >
            <span>🖨️</span> Print PDF
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
      <div className="flex-1 bg-neutral-800 p-4 md:p-8 overflow-y-auto flex justify-center items-start">
        <div
          ref={printableAreaRef}
          style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
          className="bg-white text-neutral-900 w-full max-w-[850px] min-h-[1100px] shadow-2xl p-10 md:p-14 rounded-sm flex flex-col justify-between transition-transform duration-150 border border-neutral-300 print:p-0 print:shadow-none print:transform-none"
        >
          {/* Header Bar */}
          <div>
            <div className="flex items-center justify-between border-b-2 border-neutral-900 pb-4 mb-8">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-[#ba0000] text-white flex items-center justify-center font-bold text-sm">
                  GS
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                    graphsign.ink
                  </h3>
                  <p className="text-[10px] text-neutral-500">
                    Certified Cryptographic Document Platform
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-bold text-neutral-900 block">
                  VERSION {versionDisplay}
                </span>
                <span className="text-[10px] text-neutral-500">
                  {new Date(agreement.updatedAt || agreement.createdAt).toLocaleDateString(
                    undefined,
                    {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    },
                  )}
                </span>
              </div>
            </div>

            {/* Document Title Header */}
            <div className="mb-8">
              <h1 className="text-2xl font-black tracking-tight text-neutral-900 mb-2">
                {agreement.title}
              </h1>
              {agreement.description && (
                <p className="text-xs text-neutral-600 italic mb-4">{agreement.description}</p>
              )}

              {agreement.tags && agreement.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {agreement.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-semibold bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded border border-neutral-200"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Render Document Content */}
            {isMarkdown ? (
              <div
                className="prose prose-sm max-w-none text-neutral-800 font-serif leading-relaxed text-justify"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdownToHtml(agreement.markdownContent || ''),
                }}
              />
            ) : (
              <div className="py-12 text-center space-y-4">
                <div className="text-5xl">📄</div>
                <h3 className="text-lg font-bold text-neutral-800">
                  {agreement.fileName || 'Uploaded Document'}
                </h3>
                <p className="text-xs text-neutral-500 max-w-md mx-auto">
                  This document was uploaded as a PDF/DOCX contract. Converted and verified for
                  electronic execution and digital signatures.
                </p>
                {agreement.fileUrl && (
                  <div className="pt-4">
                    <a
                      href={agreement.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors inline-flex items-center gap-1.5"
                    >
                      <span>🔗</span> Open Original File
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Legal Document Footer & Signature Area */}
          <div className="mt-16 pt-8 border-t border-neutral-300 text-[11px] text-neutral-600">
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div className="border border-dashed border-neutral-300 rounded-lg p-4 bg-neutral-50/50">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-6">
                  Sender Signatory
                </p>
                <div className="border-b border-neutral-400 pb-1 mb-1">
                  <span className="font-semibold text-neutral-800">
                    {agreement.author?.name || agreement.author?.email || 'Authorized Signatory'}
                  </span>
                </div>
                <span className="text-[10px] text-neutral-400">Signature / Certified Seal</span>
              </div>

              <div className="border border-dashed border-neutral-300 rounded-lg p-4 bg-neutral-50/50">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-6">
                  Counterparty Signatory
                </p>
                <div className="border-b border-neutral-400 pb-1 mb-1 text-neutral-400 italic">
                  <span>Pending Recipient Signature</span>
                </div>
                <span className="text-[10px] text-neutral-400">Signature / Verification</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-neutral-400 border-t border-neutral-200 pt-3">
              <span>Document ID: {agreement.id}</span>
              <span>Protected by graphsign.ink e-Signature Engine</span>
              <span>Page 1 of 1</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Modal Close Bar */}
      <div className="bg-neutral-900 text-neutral-400 px-4 py-2 text-center text-xs rounded-b-xl border-t border-neutral-800">
        Press <span className="bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-200">ESC</span> or
        click close to return to agreements list.
      </div>
    </div>
  );
}
