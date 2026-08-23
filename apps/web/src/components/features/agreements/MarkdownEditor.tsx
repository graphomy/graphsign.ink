'use client';

import React, { useState, useRef, useId } from 'react';

interface MarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minHeight?: string;
  readOnly?: boolean;
}

/**
 * Simple client-side Markdown to HTML renderer for live preview.
 * Converts headings, bold, italic, strikethrough, lists, code, tables, and blockquotes.
 */
export function renderMarkdownToHtml(md?: string | null): string {
  if (!md || typeof md !== 'string') return '';

  let html = md
    // Escape HTML tags to prevent XSS
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

    // Headers
    .replace(/^### (.*$)/gim, '<h3 class="text-base font-bold text-neutral-900 mt-4 mb-2">$1</h3>')
    .replace(
      /^## (.*$)/gim,
      '<h2 class="text-lg font-bold text-neutral-900 mt-5 mb-2 pb-1 border-b border-neutral-200">$1</h2>',
    )
    .replace(
      /^# (.*$)/gim,
      '<h1 class="text-xl font-extrabold text-neutral-900 mt-6 mb-3 pb-1 border-b-2 border-neutral-300">$1</h1>',
    )

    // Bold, Italic, Strikethrough
    .replace(/\*\*\*(.*?)\*\*\*/gim, '<strong class="font-bold"><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong class="font-bold text-neutral-900">$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em class="italic text-neutral-800">$1</em>')
    .replace(/~~(.*?)~~/gim, '<del class="line-through text-neutral-400">$1</del>')

    // Blockquotes (accounting for escaped > which becomes &gt;)
    .replace(
      /^(&gt;|>)\s*(.*$)/gim,
      '<blockquote class="border-l-4 border-red-500 pl-4 py-1.5 my-3 bg-red-50/50 text-neutral-700 italic text-xs rounded-r">$2</blockquote>',
    )

    // Horizontal Rule
    .replace(/^---$/gim, '<hr class="my-4 border-t border-neutral-300" />')

    // Code blocks
    .replace(
      /```([a-z]*)\n([\s\S]*?)```/gim,
      '<pre class="bg-neutral-900 text-neutral-100 p-3 rounded-lg my-3 overflow-x-auto text-[11px] font-mono leading-relaxed"><code>$2</code></pre>',
    )
    .replace(
      /`([^`]+)`/gim,
      '<code class="bg-neutral-100 text-red-700 px-1.5 py-0.5 rounded text-[11px] font-mono border border-neutral-200">$1</code>',
    )

    // Checkboxes / Task lists
    .replace(
      /^- \[x\] (.*$)/gim,
      '<li class="flex items-center gap-2 text-xs list-none my-1"><span class="text-green-600 font-bold">☑</span> <span class="line-through text-neutral-500">$1</span></li>',
    )
    .replace(
      /^- \[ \] (.*$)/gim,
      '<li class="flex items-center gap-2 text-xs list-none my-1"><span class="text-neutral-400">☐</span> <span>$1</span></li>',
    )

    // Unordered Lists
    .replace(/^\- (.*$)/gim, '<li class="text-xs text-neutral-700 ml-4 list-disc my-0.5">$1</li>')

    // Ordered Lists
    .replace(
      /^(\d+)\. (.*$)/gim,
      '<li class="text-xs text-neutral-700 ml-4 list-decimal my-0.5">$2</li>',
    )

    // Links
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/gim,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[#ba0000] underline font-medium hover:text-red-700">$1</a>',
    )

    // Paragraphs / line breaks
    .replace(/\n\n/gim, '<p class="my-2.5 text-xs text-neutral-700 leading-relaxed"></p>')
    .replace(/\n/gim, '<br />');

  // Format Markdown Tables
  const tableRegex = /\|(.+)\|\n\|[-|\s]+\|\n((?:\|.+\|\n?)+)/g;
  html = html.replace(tableRegex, (match, headerRow, bodyRows) => {
    const headers = headerRow
      .split('|')
      .map((h: string) => h.trim())
      .filter(Boolean);
    const headerHtml = `<tr>${headers.map((h: string) => `<th class="border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-left text-xs font-bold text-neutral-800">${h}</th>`).join('')}</tr>`;

    const rows = bodyRows
      .trim()
      .split('\n')
      .map((row: string) => {
        const cells = row
          .split('|')
          .map((c: string) => c.trim())
          .filter(Boolean);
        return `<tr class="hover:bg-neutral-50">${cells.map((c: string) => `<td class="border border-neutral-300 px-3 py-1 text-xs text-neutral-700">${c}</td>`).join('')}</tr>`;
      })
      .join('');

    return `<div class="overflow-x-auto my-3"><table class="w-full border-collapse border border-neutral-300 text-xs"><thead>${headerHtml}</thead><tbody>${rows}</tbody></table></div>`;
  });

  return html;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = 'Write agreement terms in Markdown...',
  minHeight = '320px',
  readOnly = false,
}: MarkdownEditorProps) {
  const [activeView, setActiveView] = useState<'split' | 'edit' | 'preview'>('split');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorId = useId();

  // Toolbar action helpers
  function insertFormatting(prefix: string, suffix: string = '', defaultPlaceholder: string = '') {
    if (!textareaRef.current || readOnly) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end) || defaultPlaceholder;

    const before = value.substring(0, start);
    const after = value.substring(end);
    const updated = `${before}${prefix}${selected}${suffix}${after}`;

    onChange(updated);

    // Restore cursor position inside formatted wrap
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  }

  function insertLinePrefix(prefix: string) {
    if (!textareaRef.current || readOnly) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const before = value.substring(0, lineStart);
    const after = value.substring(lineStart);
    const updated = `${before}${prefix}${after}`;

    onChange(updated);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  }

  function insertTable() {
    const tableTemplate =
      '\n| Clause Section | Provision Details | Effective Date |\n|---|---|---|\n| 1.0 Non-Disclosure | Confidential Information protection | Upon signing |\n| 2.0 Jurisdiction | Governing State Law | Immediate |\n';
    insertFormatting('', tableTemplate, '');
  }

  const safeValue = value ?? '';
  const wordCount = safeValue.trim() ? safeValue.trim().split(/\s+/).length : 0;
  const charCount = safeValue.length;

  return (
    <div className="flex flex-col border border-neutral-300 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* Editor Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1 p-2 bg-neutral-100 border-b border-neutral-200 text-neutral-700">
        <div className="flex flex-wrap items-center gap-1">
          {/* Headings */}
          <div className="flex items-center bg-white border border-neutral-200 rounded-lg p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => insertLinePrefix('# ')}
              className="px-2 py-1 text-xs font-black hover:bg-neutral-100 rounded text-neutral-800"
              title="Heading 1 (#)"
            >
              H1
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix('## ')}
              className="px-2 py-1 text-xs font-bold hover:bg-neutral-100 rounded text-neutral-800"
              title="Heading 2 (##)"
            >
              H2
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix('### ')}
              className="px-2 py-1 text-xs font-semibold hover:bg-neutral-100 rounded text-neutral-800"
              title="Heading 3 (###)"
            >
              H3
            </button>
          </div>

          {/* Formatting */}
          <div className="flex items-center bg-white border border-neutral-200 rounded-lg p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => insertFormatting('**', '**', 'bold text')}
              className="px-2 py-1 text-xs font-bold hover:bg-neutral-100 rounded text-neutral-800"
              title="Bold (**text**)"
            >
              B
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('*', '*', 'italic text')}
              className="px-2 py-1 text-xs italic hover:bg-neutral-100 rounded text-neutral-800"
              title="Italic (*text*)"
            >
              I
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('~~', '~~', 'strikethrough text')}
              className="px-2 py-1 text-xs line-through hover:bg-neutral-100 rounded text-neutral-800"
              title="Strikethrough (~~text~~)"
            >
              S
            </button>
          </div>

          {/* Lists & Quotes */}
          <div className="flex items-center bg-white border border-neutral-200 rounded-lg p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => insertLinePrefix('- ')}
              className="px-2 py-1 text-xs hover:bg-neutral-100 rounded text-neutral-800"
              title="Bulleted List (- item)"
            >
              • List
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix('1. ')}
              className="px-2 py-1 text-xs hover:bg-neutral-100 rounded text-neutral-800"
              title="Numbered List (1. item)"
            >
              1. List
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix('- [ ] ')}
              className="px-2 py-1 text-xs hover:bg-neutral-100 rounded text-neutral-800"
              title="Task Checklist (- [ ] item)"
            >
              ☑ Task
            </button>
            <button
              type="button"
              onClick={() => insertLinePrefix('> ')}
              className="px-2 py-1 text-xs hover:bg-neutral-100 rounded text-neutral-800"
              title="Blockquote (> quote)"
            >
              “ Quote
            </button>
          </div>

          {/* Code, Table, Divider, Link */}
          <div className="flex items-center bg-white border border-neutral-200 rounded-lg p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => insertFormatting('`', '`', 'code')}
              className="px-2 py-1 text-xs font-mono hover:bg-neutral-100 rounded text-neutral-800"
              title="Inline Code (`code`)"
            >
              &lt;/&gt;
            </button>
            <button
              type="button"
              onClick={insertTable}
              className="px-2 py-1 text-xs hover:bg-neutral-100 rounded text-neutral-800"
              title="Insert Table"
            >
              ⊞ Table
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('\n---\n')}
              className="px-2 py-1 text-xs hover:bg-neutral-100 rounded text-neutral-800"
              title="Divider (---)"
            >
              ― Line
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('[', '](https://example.com)', 'link text')}
              className="px-2 py-1 text-xs hover:bg-neutral-100 rounded text-neutral-800"
              title="Insert Link"
            >
              🔗 Link
            </button>
          </div>
        </div>

        {/* View Toggle Tabs */}
        <div className="flex items-center bg-white border border-neutral-200 rounded-lg p-0.5 shadow-2xs text-xs">
          <button
            type="button"
            onClick={() => setActiveView('edit')}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              activeView === 'edit'
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Markdown
          </button>
          <button
            type="button"
            onClick={() => setActiveView('split')}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              activeView === 'split'
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Split View
          </button>
          <button
            type="button"
            onClick={() => setActiveView('preview')}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              activeView === 'preview'
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Preview
          </button>
        </div>
      </div>

      {/* Editor Content Area */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-neutral-200"
        style={{ minHeight }}
      >
        {/* Raw Markdown Editor Pane */}
        {(activeView === 'edit' || activeView === 'split') && (
          <div className={`${activeView === 'edit' ? 'col-span-full' : ''} flex flex-col`}>
            <label htmlFor={editorId} className="sr-only">
              Markdown Editor
            </label>
            <textarea
              id={editorId}
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              readOnly={readOnly}
              className="flex-1 w-full p-4 text-xs font-mono text-neutral-900 bg-neutral-50/50 resize-y focus:outline-none focus:bg-white transition-colors leading-relaxed"
              style={{ minHeight }}
            />
          </div>
        )}

        {/* Live Formatted Markdown Preview Pane */}
        {(activeView === 'preview' || activeView === 'split') && (
          <div
            className={`${
              activeView === 'preview' ? 'col-span-full' : ''
            } p-4 bg-white overflow-y-auto`}
            style={{ minHeight }}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-1">
              <span>👁️ Live Preview</span>
            </div>
            {safeValue.trim() ? (
              <div
                className="prose prose-sm max-w-none text-neutral-800 font-sans"
                dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(safeValue) }}
              />
            ) : (
              <div className="text-xs text-neutral-400 italic py-8 text-center">
                Live markdown preview will appear here as you type...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-50 border-t border-neutral-200 text-[11px] text-neutral-500">
        <div className="flex items-center gap-4">
          <span>{wordCount} words</span>
          <span>{charCount} characters</span>
          <span>~{Math.ceil(wordCount / 200)} min read</span>
        </div>
        <div className="flex items-center gap-1.5 text-neutral-400">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
          <span>Markdown mode enabled</span>
        </div>
      </div>
    </div>
  );
}
