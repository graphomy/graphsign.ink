'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getApiUrl } from '@/lib/api';
import { formatStatus } from '@/lib/date-utils';
import { renderMarkdownToHtml } from './MarkdownEditor';
import { SendAgreementModal } from './SendAgreementModal';

export type FieldType =
  | 'SIGNATURE'
  | 'INITIALS'
  | 'TEXT'
  | 'DATE'
  | 'COMPANY'
  | 'EMAIL'
  | 'CHECKBOX'
  | 'RADIO'
  | 'DROPDOWN';

export interface FieldValidation {
  type?: 'none' | 'email' | 'number' | 'regex';
  pattern?: string;
  errorMessage?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
}

export interface FieldOption {
  label: string;
  value: string;
}

export interface DocumentField {
  id: string;
  type: FieldType;
  pageNumber: number;
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  width: number; // percentage (1 - 100)
  height: number; // percentage (1 - 100)
  label: string;
  placeholder?: string;
  defaultValue?: string | boolean;
  recipientId: string;
  isRequired: boolean;
  validation?: FieldValidation;
  options?: FieldOption[];
  groupName?: string;
  dateFormat?: string;
}

export interface Recipient {
  id: string;
  name: string;
  email: string;
  role: 'signer' | 'approver' | 'viewer';
  color: string;
}

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
  fields?: {
    fields?: DocumentField[];
    recipients?: Recipient[];
  };
}

interface DocumentEditorModalProps {
  agreement: AgreementData;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

const DEFAULT_RECIPIENT_COLORS = [
  '#2563EB', // Blue
  '#059669', // Green
  '#D97706', // Amber
  '#7C3AED', // Purple
  '#DB2777', // Pink
  '#0891B2', // Cyan
];

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

export function DocumentEditorModal({ agreement, onClose, onSuccess }: DocumentEditorModalProps) {
  // Mode: 'editor' or 'preview' (INK-85)
  const [activeMode, setActiveMode] = useState<'editor' | 'preview'>('editor');
  const [previewRecipientId, setPreviewRecipientId] = useState<string>('');

  // Recipients State
  const [recipients, setRecipients] = useState<Recipient[]>(() => {
    const existing = agreement.fields?.recipients;
    if (existing && existing.length > 0) return existing;
    return [
      {
        id: 'recipient-1',
        name: 'Signer 1',
        email: 'signer1@example.com',
        role: 'signer',
        color: DEFAULT_RECIPIENT_COLORS[0] ?? '#2563EB',
      },
    ];
  });

  const [activeRecipientId, setActiveRecipientId] = useState<string>(
    recipients[0]?.id || 'recipient-1',
  );

  // Fields State
  const [fields, setFields] = useState<DocumentField[]>(() => {
    const existing = agreement.fields?.fields;
    if (existing && Array.isArray(existing)) return existing;
    return [];
  });

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);

  // Mobile Drawer Tab
  const [mobileTab, setMobileTab] = useState<'palette' | 'properties' | 'recipients'>('palette');

  // Preview form values state
  const [previewValues, setPreviewValues] = useState<Record<string, string | boolean | undefined>>(
    {},
  );
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});

  // Canvas interaction refs
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const dragItemTypeRef = useRef<FieldType | null>(null);
  const resizingFieldRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const draggingFieldRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  // Derive active preview recipient id without effect setState
  const effectivePreviewRecipientId =
    previewRecipientId && recipients.some((r) => r.id === previewRecipientId)
      ? previewRecipientId
      : recipients[0]?.id || '';

  // Derive document content / blob URL
  const meta = (agreement.metadata as Record<string, unknown>) || {};
  const rawFileData =
    (meta.fileData as string | undefined) || (meta.fileBase64 as string | undefined);
  const isMarkdown = !!agreement.markdownContent && !rawFileData;

  const inlinePdfUrl = useMemo(() => {
    if (rawFileData && typeof rawFileData === 'string') {
      try {
        let base64 = rawFileData;
        let mime = agreement.mimeType || 'application/pdf';
        if (rawFileData.startsWith('data:')) {
          const commaIdx = rawFileData.indexOf(',');
          if (commaIdx !== -1) {
            const mimeMatch = rawFileData.substring(0, commaIdx).match(/^data:([^;]+)/);
            if (mimeMatch && mimeMatch[1]) mime = mimeMatch[1];
            base64 = rawFileData.substring(commaIdx + 1);
          }
        }
        const byteChars = atob(base64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mime });
        return URL.createObjectURL(blob);
      } catch (e) {
        console.error('Error parsing raw base64 PDF:', e);
      }
    }
    return null;
  }, [rawFileData, agreement.mimeType]);

  const [fetchedBlobUrl, setFetchedBlobUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [pdfFetchError, setPdfFetchError] = useState<string | null>(null);

  // Fetch binary file with authorization headers when inline base64 is not present
  useEffect(() => {
    if (inlinePdfUrl || isMarkdown) {
      return;
    }

    let isMounted = true;
    let createdUrl: string | null = null;

    async function loadPdfBinary() {
      setIsLoadingPdf(true);
      setPdfFetchError(null);

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
        if (!isMounted) return;

        createdUrl = URL.createObjectURL(blob);
        setFetchedBlobUrl(createdUrl);
      } catch (err: unknown) {
        if (!isMounted) return;
        setPdfFetchError((err as Error).message);
      } finally {
        if (isMounted) {
          setIsLoadingPdf(false);
        }
      }
    }

    loadPdfBinary();

    return () => {
      isMounted = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [agreement.id, inlinePdfUrl, isMarkdown]);

  const effectivePdfUrl = inlinePdfUrl || fetchedBlobUrl;

  // Load existing fields on mount from server if not populated
  useEffect(() => {
    let ignore = false;
    async function loadFields() {
      try {
        const res = await fetch(`${getApiUrl()}/api/v1/agreements/${agreement.id}/fields`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (!ignore && data) {
            if (Array.isArray(data.fields) && data.fields.length > 0) {
              setFields(data.fields);
            }
            if (Array.isArray(data.recipients) && data.recipients.length > 0) {
              setRecipients(data.recipients);
              setActiveRecipientId(data.recipients[0].id);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load fields from API:', err);
      }
    }
    loadFields();
    return () => {
      ignore = true;
    };
  }, [agreement.id]);

  const selectedField = useMemo(() => {
    return fields.find((f) => f.id === selectedFieldId) || null;
  }, [fields, selectedFieldId]);

  const activeRecipient = useMemo(() => {
    return recipients.find((r) => r.id === activeRecipientId) || recipients[0] || null;
  }, [recipients, activeRecipientId]);

  // Add Recipient (Max 10 Limit)
  function handleAddRecipient() {
    if (recipients.length >= 10) {
      setErrorMessage('Maximum limit of 10 signers reached for this document.');
      return;
    }
    const nextIdx = recipients.length + 1;
    const newColor =
      DEFAULT_RECIPIENT_COLORS[(nextIdx - 1) % DEFAULT_RECIPIENT_COLORS.length] || '#2563EB';
    const newRecip: Recipient = {
      id: `recipient-${Date.now()}`,
      name: `Signer ${nextIdx}`,
      email: `signer${nextIdx}@example.com`,
      role: 'signer',
      color: newColor,
    };
    setRecipients([...recipients, newRecip]);
    setActiveRecipientId(newRecip.id);
  }

  // Update Recipient
  function handleUpdateRecipient(id: string, updates: Partial<Recipient>) {
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  }

  // Remove Recipient
  function handleRemoveRecipient(id: string) {
    if (recipients.length <= 1) {
      setErrorMessage('At least one recipient is required.');
      return;
    }
    setRecipients((prev) => prev.filter((r) => r.id !== id));
    // Reassign orphan fields to first remaining recipient
    const remainingFirstId = recipients.find((r) => r.id !== id)?.id || '';
    setFields((prev) =>
      prev.map((f) => (f.recipientId === id ? { ...f, recipientId: remainingFirstId } : f)),
    );
    if (activeRecipientId === id) {
      setActiveRecipientId(remainingFirstId);
    }
  }

  // Create & Place Field at (x%, y%)
  const createFieldAt = useCallback(
    (type: FieldType, xPct: number, yPct: number, pageNum: number = 1) => {
      const fieldId = `field-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      let defaultW = 24;
      let defaultH = 6;
      let label = 'Text Field';

      switch (type) {
        case 'SIGNATURE':
          defaultW = 25;
          defaultH = 9;
          label = 'Signature';
          break;
        case 'INITIALS':
          defaultW = 14;
          defaultH = 8;
          label = 'Initials';
          break;
        case 'DATE':
          defaultW = 20;
          defaultH = 6;
          label = 'Date';
          break;
        case 'COMPANY':
          defaultW = 25;
          defaultH = 6;
          label = 'Company';
          break;
        case 'EMAIL':
          defaultW = 25;
          defaultH = 6;
          label = 'Email Address';
          break;
        case 'CHECKBOX':
          defaultW = 16;
          defaultH = 5;
          label = 'I agree';
          break;
        case 'RADIO':
          defaultW = 28;
          defaultH = 12;
          label = 'Select option';
          break;
        case 'DROPDOWN':
          defaultW = 26;
          defaultH = 6;
          label = 'Choose item';
          break;
      }

      // Clamp so field stays inside canvas boundaries
      const clampedX = Math.max(0, Math.min(100 - defaultW, xPct));
      const clampedY = Math.max(0, Math.min(100 - defaultH, yPct));

      const newField: DocumentField = {
        id: fieldId,
        type,
        pageNumber: pageNum,
        x: Math.round(clampedX * 10) / 10,
        y: Math.round(clampedY * 10) / 10,
        width: defaultW,
        height: defaultH,
        label,
        placeholder: type === 'TEXT' || type === 'COMPANY' ? 'Enter text...' : undefined,
        recipientId: activeRecipientId,
        isRequired: true,
        validation:
          type === 'EMAIL'
            ? { type: 'email', errorMessage: 'Must be a valid email' }
            : { type: 'none' },
        options:
          type === 'DROPDOWN' || type === 'RADIO'
            ? [
                { label: 'Option 1', value: 'opt_1' },
                { label: 'Option 2', value: 'opt_2' },
              ]
            : undefined,
        groupName: type === 'RADIO' ? `group_${Date.now()}` : undefined,
        dateFormat: type === 'DATE' ? 'YYYY-MM-DD' : undefined,
      };

      setFields((prev) => [...prev, newField]);
      setSelectedFieldId(fieldId);
      setMobileTab('properties');
    },
    [activeRecipientId],
  );

  // Click-to-place button from palette
  function handlePaletteItemClick(type: FieldType) {
    // Default place in center of active viewport
    createFieldAt(type, 35, 40, 1);
  }

  // Drag-and-drop start from toolbar
  function handleDragStartFromToolbar(e: React.DragEvent, type: FieldType) {
    dragItemTypeRef.current = type;
    e.dataTransfer.setData('text/plain', type);
    e.dataTransfer.effectAllowed = 'copy';
  }

  // Drag over document page canvas
  function handleCanvasDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  // Drop onto document canvas (INK-78)
  function handleCanvasDrop(e: React.DragEvent) {
    e.preventDefault();
    const type = dragItemTypeRef.current || (e.dataTransfer.getData('text/plain') as FieldType);
    if (!type || !pageContainerRef.current) return;

    const rect = pageContainerRef.current.getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;

    const xPct = ((clientX - rect.left) / rect.width) * 100;
    const yPct = ((clientY - rect.top) / rect.height) * 100;

    createFieldAt(type, xPct, yPct, 1);
    dragItemTypeRef.current = null;
  }

  // Start field repositioning drag (INK-84)
  function handleFieldMouseDown(e: React.MouseEvent, field: DocumentField) {
    if (activeMode === 'preview') return;
    e.stopPropagation();
    setSelectedFieldId(field.id);

    draggingFieldRef.current = {
      id: field.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: field.x,
      initialY: field.y,
    };
  }

  // Start resize drag (INK-84)
  function handleResizeMouseDown(e: React.MouseEvent, field: DocumentField) {
    if (activeMode === 'preview') return;
    e.stopPropagation();
    setSelectedFieldId(field.id);

    resizingFieldRef.current = {
      id: field.id,
      startX: e.clientX,
      startY: e.clientY,
      startW: field.width,
      startH: field.height,
    };
  }

  // Global mouse move for resizing & moving
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!pageContainerRef.current) return;
      const rect = pageContainerRef.current.getBoundingClientRect();

      // Handle Repositioning
      if (draggingFieldRef.current) {
        const { id, startX, startY, initialX, initialY } = draggingFieldRef.current;
        const deltaXPct = ((e.clientX - startX) / rect.width) * 100;
        const deltaYPct = ((e.clientY - startY) / rect.height) * 100;

        setFields((prev) =>
          prev.map((f) => {
            if (f.id !== id) return f;
            const newX = Math.max(0, Math.min(100 - f.width, initialX + deltaXPct));
            const newY = Math.max(0, Math.min(100 - f.height, initialY + deltaYPct));
            return {
              ...f,
              x: Math.round(newX * 10) / 10,
              y: Math.round(newY * 10) / 10,
            };
          }),
        );
      }

      // Handle Resizing (INK-84)
      if (resizingFieldRef.current) {
        const { id, startX, startY, startW, startH } = resizingFieldRef.current;
        const deltaWPct = ((e.clientX - startX) / rect.width) * 100;
        const deltaHPct = ((e.clientY - startY) / rect.height) * 100;

        setFields((prev) =>
          prev.map((f) => {
            if (f.id !== id) return f;
            const newW = Math.max(5, Math.min(100 - f.x, startW + deltaWPct));
            const newH = Math.max(3, Math.min(100 - f.y, startH + deltaHPct));
            return {
              ...f,
              width: Math.round(newW * 10) / 10,
              height: Math.round(newH * 10) / 10,
            };
          }),
        );
      }
    }

    function handleMouseUp() {
      draggingFieldRef.current = null;
      resizingFieldRef.current = null;
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Update Field Property
  function updateFieldProperty(id: string, updates: Partial<DocumentField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }

  // Delete Field
  function handleDeleteField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (selectedFieldId === id) {
      setSelectedFieldId(null);
    }
  }

  // Preview form input change and validation test (INK-85)
  function handlePreviewInputChange(field: DocumentField, val: string | boolean) {
    setPreviewValues((prev) => ({ ...prev, [field.id]: val }));

    // Real-time validation test
    const errors = { ...previewErrors };
    if (field.isRequired && (!val || val === '')) {
      errors[field.id] = 'This field is required';
    } else if (field.validation?.type === 'email' && typeof val === 'string' && val) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(val)) {
        errors[field.id] = field.validation.errorMessage || 'Invalid email address';
      } else {
        delete errors[field.id];
      }
    } else if (field.validation?.type === 'number' && typeof val === 'string' && val) {
      if (isNaN(Number(val))) {
        errors[field.id] = field.validation.errorMessage || 'Must be a valid number';
      } else {
        delete errors[field.id];
      }
    } else if (
      field.validation?.type === 'regex' &&
      field.validation.pattern &&
      typeof val === 'string' &&
      val
    ) {
      try {
        const customReg = new RegExp(field.validation.pattern);
        if (!customReg.test(val)) {
          errors[field.id] = field.validation.errorMessage || 'Validation pattern failed';
        } else {
          delete errors[field.id];
        }
      } catch (_e) {
        delete errors[field.id];
      }
    } else {
      delete errors[field.id];
    }
    setPreviewErrors(errors);
  }

  // Save Fields to API
  async function handleSaveFields(exitOnSave: boolean = false) {
    setIsSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${agreement.id}/fields`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          fields,
          recipients,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error?.message || errData?.message || 'Failed to save fields.');
      }

      setSaveMessage('Document fields and recipients saved successfully.');
      if (onSuccess) {
        onSuccess(`Document fields saved (${fields.length} fields, ${recipients.length} signers).`);
      }
      if (exitOnSave) {
        onClose();
      }
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/90 backdrop-blur-md flex flex-col h-screen w-screen overflow-hidden text-neutral-900 select-none">
      {/* Top Navigation Bar */}
      <header className="h-14 bg-white border-b border-neutral-200 px-4 flex items-center justify-between gap-3 shrink-0 shadow-sm">
        {/* Left: Document Info & Back */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors text-xs font-semibold flex items-center gap-1"
          >
            <span>←</span> Back
          </button>
          <div className="h-4 w-px bg-neutral-200" />
          <div className="truncate">
            <h1 className="text-sm font-bold text-neutral-900 truncate flex items-center gap-2">
              <span>{agreement.title}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-300 text-neutral-600 uppercase">
                {formatStatus(agreement.status)}
              </span>
            </h1>
            <p className="text-[10px] text-neutral-400">
              Visual Document Editor • {fields.length} fields placed
            </p>
          </div>
        </div>

        {/* Center: Mode Switcher (Editor vs Preview) - INK-85 */}
        <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg border border-neutral-200">
          <button
            onClick={() => setActiveMode('editor')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeMode === 'editor'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <span>✏️</span> Edit Fields
          </button>
          <button
            onClick={() => setActiveMode('preview')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeMode === 'preview'
                ? 'bg-[#ba0000] text-white shadow-sm'
                : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <span>👁️</span> Preview as Signer
          </button>
        </div>

        {/* Right: Zoom & Save Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center gap-1 bg-neutral-50 border border-neutral-200 px-2 py-1 rounded-lg text-xs">
            <button
              onClick={() => setZoomLevel((z) => Math.max(50, z - 15))}
              className="text-neutral-600 hover:text-neutral-900 px-1 font-bold"
              title="Zoom out"
            >
              −
            </button>
            <span className="font-mono text-[11px] font-semibold text-neutral-700 min-w-[36px] text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(175, z + 15))}
              className="text-neutral-600 hover:text-neutral-900 px-1 font-bold"
              title="Zoom in"
            >
              +
            </button>
          </div>

          <button
            onClick={() => handleSaveFields(false)}
            disabled={isSaving}
            className="px-3.5 py-1.5 bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 text-xs font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSaving ? <span className="animate-spin text-neutral-700">⏳</span> : <span>💾</span>}
            Save Draft
          </button>

          <button
            onClick={async () => {
              await handleSaveFields(false);
              setShowSendModal(true);
            }}
            disabled={isSaving}
            className="px-4 py-1.5 bg-[#ba0000] hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            <span>✓</span> Done
          </button>
        </div>
      </header>

      {/* Banner Notifications */}
      {saveMessage && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-2 text-xs font-semibold text-green-800 flex items-center justify-between">
          <span>✓ {saveMessage}</span>
          <button
            onClick={() => setSaveMessage(null)}
            className="text-green-600 hover:text-green-900"
          >
            ×
          </button>
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs font-semibold text-red-800 flex items-center justify-between">
          <span>⚠️ {errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-600 hover:text-red-900">
            ×
          </button>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ========================================================================= */}
        {/* LEFT SIDEBAR: FIELD PALETTE & RECIPIENTS (Editor Mode Only) */}
        {/* ========================================================================= */}
        {activeMode === 'editor' && (
          <aside className="w-64 bg-white border-r border-neutral-200 flex flex-col shrink-0 overflow-y-auto hidden md:flex">
            {/* Recipient Manager Section (INK-79 / INK-270) */}
            <div className="p-3.5 border-b border-neutral-200 bg-neutral-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                  Select Signer ({recipients.length}/10)
                </span>
                <button
                  onClick={handleAddRecipient}
                  disabled={recipients.length >= 10}
                  className={`text-[11px] font-bold flex items-center gap-0.5 ${
                    recipients.length >= 10
                      ? 'text-neutral-400 cursor-not-allowed'
                      : 'text-[#ba0000] hover:underline'
                  }`}
                  title={recipients.length >= 10 ? 'Maximum 10 signers allowed' : 'Add a new signer'}
                >
                  + Add Signer
                </button>
              </div>

              {/* Signer Dropdown */}
              <div>
                <select
                  aria-label="Active Signer Selector"
                  value={activeRecipientId}
                  onChange={(e) => setActiveRecipientId(e.target.value)}
                  className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-xs font-semibold text-neutral-900 focus:outline-none focus:border-[#ba0000] shadow-2xs"
                >
                  {recipients.map((recip) => (
                    <option key={recip.id} value={recip.id}>
                      {recip.name} ({recip.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Active Selected Signer Editor Card */}
              {activeRecipient && (
                <div className="p-2.5 bg-white border border-neutral-200 rounded-lg shadow-2xs space-y-2">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-white shadow-xs"
                        style={{ backgroundColor: activeRecipient.color }}
                      />
                      <input
                        type="text"
                        value={activeRecipient.name}
                        onChange={(e) =>
                          handleUpdateRecipient(activeRecipient.id, { name: e.target.value })
                        }
                        placeholder="e.g. Author, Approver"
                        className="w-full bg-neutral-50 hover:bg-neutral-100 focus:bg-white border border-neutral-200 focus:border-neutral-400 rounded px-2 py-1 text-xs font-bold text-neutral-900 focus:outline-none"
                        title="Edit signer label (e.g. Author, Signer 1)"
                      />
                    </div>
                    {recipients.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient(activeRecipient.id)}
                        className="text-neutral-400 hover:text-red-600 p-1 rounded text-xs font-bold shrink-0"
                        title="Remove signer"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-neutral-400 px-1 font-normal">
                    <span className="capitalize">{activeRecipient.role}</span>
                    <span className="truncate max-w-[120px]">
                      {activeRecipient.email || 'Pending email'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Field Palette Toolbar (INK-78 to INK-81) */}
            <div className="p-3.5 space-y-4 flex-1">
              {/* Signatures & Initials */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-2">
                  Signature Fields
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  <div
                    draggable
                    onDragStart={(e) => handleDragStartFromToolbar(e, 'SIGNATURE')}
                    onClick={() => handlePaletteItemClick('SIGNATURE')}
                    className="p-2.5 bg-blue-50/60 border border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-blue-900 rounded-lg cursor-grab active:cursor-grabbing flex items-center gap-2.5 transition-all text-xs font-semibold shadow-2xs"
                  >
                    <span className="text-base select-none">✍️</span>
                    <div>
                      <span className="block font-bold">Signature</span>
                      <span className="text-[10px] text-blue-600 block">
                        Signer e-signature block
                      </span>
                    </div>
                  </div>

                  <div
                    draggable
                    onDragStart={(e) => handleDragStartFromToolbar(e, 'INITIALS')}
                    onClick={() => handlePaletteItemClick('INITIALS')}
                    className="p-2.5 bg-blue-50/60 border border-blue-200 hover:border-blue-400 hover:bg-blue-50 text-blue-900 rounded-lg cursor-grab active:cursor-grabbing flex items-center gap-2.5 transition-all text-xs font-semibold shadow-2xs"
                  >
                    <span className="text-base select-none">✒️</span>
                    <div>
                      <span className="block font-bold">Initials</span>
                      <span className="text-[10px] text-blue-600 block">Initial placement box</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Standard Fields (INK-80) */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-2">
                  Text & Information
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  <div
                    draggable
                    onDragStart={(e) => handleDragStartFromToolbar(e, 'TEXT')}
                    onClick={() => handlePaletteItemClick('TEXT')}
                    className="p-2 bg-neutral-50 border border-neutral-200 hover:border-neutral-400 hover:bg-white text-neutral-800 rounded-lg cursor-grab active:cursor-grabbing flex items-center gap-2 transition-all text-xs font-medium"
                  >
                    <span>📝</span>
                    <span>Text Field</span>
                  </div>

                  <div
                    draggable
                    onDragStart={(e) => handleDragStartFromToolbar(e, 'DATE')}
                    onClick={() => handlePaletteItemClick('DATE')}
                    className="p-2 bg-neutral-50 border border-neutral-200 hover:border-neutral-400 hover:bg-white text-neutral-800 rounded-lg cursor-grab active:cursor-grabbing flex items-center gap-2 transition-all text-xs font-medium"
                  >
                    <span>📅</span>
                    <span>Date Signed</span>
                  </div>

                  <div
                    draggable
                    onDragStart={(e) => handleDragStartFromToolbar(e, 'COMPANY')}
                    onClick={() => handlePaletteItemClick('COMPANY')}
                    className="p-2 bg-neutral-50 border border-neutral-200 hover:border-neutral-400 hover:bg-white text-neutral-800 rounded-lg cursor-grab active:cursor-grabbing flex items-center gap-2 transition-all text-xs font-medium"
                  >
                    <span>🏢</span>
                    <span>Company Name</span>
                  </div>

                  <div
                    draggable
                    onDragStart={(e) => handleDragStartFromToolbar(e, 'EMAIL')}
                    onClick={() => handlePaletteItemClick('EMAIL')}
                    className="p-2 bg-neutral-50 border border-neutral-200 hover:border-neutral-400 hover:bg-white text-neutral-800 rounded-lg cursor-grab active:cursor-grabbing flex items-center gap-2 transition-all text-xs font-medium"
                  >
                    <span>✉️</span>
                    <span>Email Address</span>
                  </div>
                </div>
              </div>

              {/* Choices & Selection (INK-81) */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-2">
                  Choice Elements
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  <div
                    draggable
                    onDragStart={(e) => handleDragStartFromToolbar(e, 'CHECKBOX')}
                    onClick={() => handlePaletteItemClick('CHECKBOX')}
                    className="p-2 bg-neutral-50 border border-neutral-200 hover:border-neutral-400 hover:bg-white text-neutral-800 rounded-lg cursor-grab active:cursor-grabbing flex items-center gap-2 transition-all text-xs font-medium"
                  >
                    <span>☑️</span>
                    <span>Checkbox</span>
                  </div>

                  <div
                    draggable
                    onDragStart={(e) => handleDragStartFromToolbar(e, 'RADIO')}
                    onClick={() => handlePaletteItemClick('RADIO')}
                    className="p-2 bg-neutral-50 border border-neutral-200 hover:border-neutral-400 hover:bg-white text-neutral-800 rounded-lg cursor-grab active:cursor-grabbing flex items-center gap-2 transition-all text-xs font-medium"
                  >
                    <span>🔘</span>
                    <span>Radio Group</span>
                  </div>

                  <div
                    draggable
                    onDragStart={(e) => handleDragStartFromToolbar(e, 'DROPDOWN')}
                    onClick={() => handlePaletteItemClick('DROPDOWN')}
                    className="p-2 bg-neutral-50 border border-neutral-200 hover:border-neutral-400 hover:bg-white text-neutral-800 rounded-lg cursor-grab active:cursor-grabbing flex items-center gap-2 transition-all text-xs font-medium"
                  >
                    <span>▼</span>
                    <span>Dropdown Select</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* ========================================================================= */}
        {/* CENTER VIEWPORT: DOCUMENT CANVAS & FIELD OVERLAYS */}
        {/* ========================================================================= */}
        <main className="flex-1 overflow-auto bg-neutral-800 flex justify-center p-4 sm:p-8 relative">
          {/* Document Canvas Sheet */}
          <div
            ref={pageContainerRef}
            onDragOver={handleCanvasDragOver}
            onDrop={handleCanvasDrop}
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'top center',
              width: '800px',
              minHeight: '1100px',
            }}
            className="bg-white shadow-2xl rounded-sm relative transition-transform duration-100 flex flex-col mb-auto select-none overflow-hidden"
          >
            {/* Document Content Layer */}
            {isMarkdown ? (
              <div
                className="p-12 prose prose-sm max-w-none text-neutral-900 pointer-events-none"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdownToHtml(agreement.markdownContent || ''),
                }}
              />
            ) : effectivePdfUrl ? (
              <iframe
                src={`${effectivePdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                className="w-full h-full min-h-[1100px] border-none pointer-events-none flex-1 overflow-hidden"
                title="Document PDF Preview"
              />
            ) : isLoadingPdf ? (
              <div className="p-16 text-center text-neutral-400 flex flex-col items-center justify-center min-h-[600px] space-y-3">
                <div className="w-8 h-8 border-3 border-neutral-300 border-t-neutral-800 rounded-full animate-spin" />
                <p className="text-xs font-semibold text-neutral-600">Loading PDF document...</p>
              </div>
            ) : (
              <div className="p-16 text-center text-neutral-400 flex flex-col items-center justify-center min-h-[600px]">
                <span className="text-4xl mb-2">📄</span>
                <p className="text-xs font-semibold text-neutral-600">{agreement.title}</p>
                {pdfFetchError && <p className="text-[11px] text-red-500 mt-1">{pdfFetchError}</p>}
                <p className="text-[11px] text-neutral-400 mt-1">
                  Drag & drop fields anywhere onto this page canvas.
                </p>
              </div>
            )}

            {/* Field Overlay Layer */}
            <div className="absolute inset-0 pointer-events-auto">
              {fields.map((field) => {
                const assignedRecip = recipients.find((r) => r.id === field.recipientId);
                const recipColor = assignedRecip?.color || '#2563EB';
                const isSelected = selectedFieldId === field.id && activeMode === 'editor';

                // In Preview Mode (INK-85): only fields assigned to active preview recipient are interactable
                const isCurrentRecipientInPreview =
                  activeMode === 'preview' && field.recipientId === effectivePreviewRecipientId;

                const fieldValue = previewValues[field.id];
                const fieldError = previewErrors[field.id];

                return (
                  <div
                    key={field.id}
                    onMouseDown={(e) => handleFieldMouseDown(e, field)}
                    onClick={(e) => {
                      if (activeMode === 'editor') {
                        e.stopPropagation();
                        setSelectedFieldId(field.id);
                      }
                    }}
                    style={{
                      left: `${field.x}%`,
                      top: `${field.y}%`,
                      width: `${field.width}%`,
                      height: `${field.height}%`,
                      borderColor: recipColor,
                    }}
                    className={`absolute rounded transition-shadow flex flex-col justify-between overflow-visible ${
                      activeMode === 'editor'
                        ? 'cursor-move border-2 shadow-xs'
                        : isCurrentRecipientInPreview
                          ? 'border-2 border-dashed bg-white/90 shadow-md cursor-pointer'
                          : 'opacity-40 border border-neutral-300 pointer-events-none'
                    } ${isSelected ? 'ring-2 ring-offset-1 ring-blue-500 z-30' : 'z-10'}`}
                  >
                    {/* Header Badge */}
                    <div
                      style={{ backgroundColor: recipColor }}
                      className="px-1.5 py-0.5 text-white text-[9px] font-bold flex items-center justify-between shrink-0 leading-tight"
                    >
                      <div className="flex items-center gap-1 truncate">
                        <span className="truncate">
                          {field.label} • {recipients.find((r) => r.id === field.recipientId)?.name || 'Signer'}
                        </span>
                        {field.isRequired && (
                          <span className="text-red-300 font-extrabold text-xs" title="Required">
                            *
                          </span>
                        )}
                      </div>
                      {activeMode === 'editor' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteField(field.id);
                          }}
                          className="hover:text-red-200 text-[10px] ml-1 font-bold"
                          title="Delete field"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Field Content / Preview Inputs (INK-85) */}
                    <div className="flex-1 bg-white/80 p-1 flex items-center justify-center text-center overflow-hidden">
                      {activeMode === 'preview' ? (
                        <div className="w-full h-full flex flex-col justify-center">
                          {field.type === 'SIGNATURE' && (
                            <div className="border border-neutral-300 bg-neutral-50 rounded p-1 text-center text-xs font-semibold text-neutral-600 hover:bg-neutral-100">
                              {fieldValue ? (
                                <span className="font-serif italic text-sm text-blue-900">
                                  {fieldValue}
                                </span>
                              ) : (
                                <span>✍️ Click to Sign</span>
                              )}
                            </div>
                          )}

                          {field.type === 'INITIALS' && (
                            <div className="border border-neutral-300 bg-neutral-50 rounded p-1 text-center text-xs font-bold text-neutral-700">
                              {fieldValue || 'Initials'}
                            </div>
                          )}

                          {field.type === 'TEXT' && (
                            <input
                              type="text"
                              placeholder={field.placeholder || 'Enter text...'}
                              value={typeof fieldValue === 'string' ? fieldValue : ''}
                              onChange={(e) => handlePreviewInputChange(field, e.target.value)}
                              className="w-full bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-xs text-neutral-900 focus:outline-none focus:border-blue-500"
                            />
                          )}

                          {field.type === 'DATE' && (
                            <input
                              type="date"
                              value={typeof fieldValue === 'string' ? fieldValue : ''}
                              onChange={(e) => handlePreviewInputChange(field, e.target.value)}
                              className="w-full bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-xs text-neutral-900 focus:outline-none focus:border-blue-500"
                            />
                          )}

                          {field.type === 'EMAIL' && (
                            <input
                              type="email"
                              placeholder="signer@example.com"
                              value={typeof fieldValue === 'string' ? fieldValue : ''}
                              onChange={(e) => handlePreviewInputChange(field, e.target.value)}
                              className="w-full bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-xs text-neutral-900 focus:outline-none focus:border-blue-500"
                            />
                          )}

                          {field.type === 'COMPANY' && (
                            <input
                              type="text"
                              placeholder="Company name..."
                              value={typeof fieldValue === 'string' ? fieldValue : ''}
                              onChange={(e) => handlePreviewInputChange(field, e.target.value)}
                              className="w-full bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-xs text-neutral-900 focus:outline-none focus:border-blue-500"
                            />
                          )}

                          {field.type === 'CHECKBOX' && (
                            <label className="flex items-center gap-1.5 justify-center cursor-pointer text-xs">
                              <input
                                type="checkbox"
                                checked={!!fieldValue}
                                onChange={(e) => handlePreviewInputChange(field, e.target.checked)}
                                className="w-3.5 h-3.5 text-blue-600 rounded"
                              />
                              <span className="text-[10px] text-neutral-700">{field.label}</span>
                            </label>
                          )}

                          {field.type === 'RADIO' && (
                            <div className="flex flex-col gap-1 text-left text-[10px]">
                              {field.options?.map((opt) => (
                                <label
                                  key={opt.value}
                                  className="flex items-center gap-1 cursor-pointer"
                                >
                                  <input
                                    type="radio"
                                    name={field.groupName || field.id}
                                    value={opt.value}
                                    checked={fieldValue === opt.value}
                                    onChange={(e) =>
                                      handlePreviewInputChange(field, e.target.value)
                                    }
                                  />
                                  <span>{opt.label}</span>
                                </label>
                              ))}
                            </div>
                          )}

                          {field.type === 'DROPDOWN' && (
                            <select
                              value={typeof fieldValue === 'string' ? fieldValue : ''}
                              onChange={(e) => handlePreviewInputChange(field, e.target.value)}
                              className="w-full bg-white border border-neutral-300 rounded px-1 py-0.5 text-[11px]"
                            >
                              <option value="">Select option...</option>
                              {field.options?.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          )}

                          {fieldError && (
                            <span className="text-[9px] font-bold text-red-600 mt-0.5 block">
                              {fieldError}
                            </span>
                          )}
                        </div>
                      ) : (
                        /* Editor Static Placeholder Display */
                        <div className="text-center truncate text-[11px] font-medium text-neutral-600">
                          {field.type === 'SIGNATURE' && <span>✍️ Signature</span>}
                          {field.type === 'INITIALS' && <span>✒️ Initials</span>}
                          {field.type === 'TEXT' && (
                            <span>{field.placeholder || 'Text field'}</span>
                          )}
                          {field.type === 'DATE' && (
                            <span>📅 {field.dateFormat || 'YYYY-MM-DD'}</span>
                          )}
                          {field.type === 'EMAIL' && <span>✉️ Email</span>}
                          {field.type === 'COMPANY' && <span>🏢 Company</span>}
                          {field.type === 'CHECKBOX' && <span>☑️ Checkbox</span>}
                          {field.type === 'RADIO' && (
                            <span>🔘 Radio ({field.options?.length || 2} options)</span>
                          )}
                          {field.type === 'DROPDOWN' && (
                            <span>▼ Dropdown ({field.options?.length || 2} options)</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Resizing Handle (Bottom-Right) - INK-84 */}
                    {activeMode === 'editor' && (
                      <div
                        onMouseDown={(e) => handleResizeMouseDown(e, field)}
                        style={{ backgroundColor: recipColor }}
                        className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize rounded-tl-xs shadow-xs"
                        title="Drag to resize"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </main>

        {/* ========================================================================= */}
        {/* RIGHT SIDEBAR: FIELD PROPERTIES & VALIDATIONS (INK-80, 81, 82, 83) */}
        {/* ========================================================================= */}
        {activeMode === 'editor' && (
          <aside className="w-80 bg-white border-l border-neutral-200 flex flex-col shrink-0 overflow-y-auto p-4 space-y-4 shadow-xs">
            {selectedField ? (
              <>
                <div className="flex items-center justify-between border-b border-neutral-200 pb-2.5">
                  <div>
                    <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                      Field Settings
                    </h3>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      {selectedField.type}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedFieldId(null)}
                    className="text-neutral-400 hover:text-neutral-700 text-sm font-bold"
                    title="Deselect field"
                  >
                    ✕
                  </button>
                </div>

                {/* Recipient Assignment (INK-79) */}
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                    Assigned Recipient *
                  </label>
                  <select
                    value={selectedField.recipientId}
                    onChange={(e) =>
                      updateFieldProperty(selectedField.id, { recipientId: e.target.value })
                    }
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-blue-600"
                  >
                    {recipients.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.email})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Field Label */}
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                    Field Label
                  </label>
                  <input
                    type="text"
                    value={selectedField.label}
                    onChange={(e) =>
                      updateFieldProperty(selectedField.id, { label: e.target.value })
                    }
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-blue-600"
                  />
                </div>

                {/* Placeholder Text */}
                {(selectedField.type === 'TEXT' || selectedField.type === 'COMPANY') && (
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                      Placeholder Text
                    </label>
                    <input
                      type="text"
                      value={selectedField.placeholder || ''}
                      onChange={(e) =>
                        updateFieldProperty(selectedField.id, { placeholder: e.target.value })
                      }
                      className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                )}

                {/* Date Format (INK-80) */}
                {selectedField.type === 'DATE' && (
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                      Date Format
                    </label>
                    <select
                      value={selectedField.dateFormat || 'YYYY-MM-DD'}
                      onChange={(e) =>
                        updateFieldProperty(selectedField.id, { dateFormat: e.target.value })
                      }
                      className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-blue-600"
                    >
                      <option value="YYYY-MM-DD">YYYY-MM-DD (2026-08-16)</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY (16/08/2026)</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY (08/16/2026)</option>
                      <option value="MMM D, YYYY">MMM D, YYYY (Aug 16, 2026)</option>
                    </select>
                  </div>
                )}

                {/* Options list for Dropdown / Radio (INK-81) */}
                {(selectedField.type === 'DROPDOWN' || selectedField.type === 'RADIO') && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-neutral-700">Options List</label>
                      <button
                        type="button"
                        onClick={() => {
                          const cur = selectedField.options || [];
                          updateFieldProperty(selectedField.id, {
                            options: [
                              ...cur,
                              { label: `Option ${cur.length + 1}`, value: `opt_${Date.now()}` },
                            ],
                          });
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:underline"
                      >
                        + Add Option
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {selectedField.options?.map((opt, oIdx) => (
                        <div key={oIdx} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={opt.label}
                            onChange={(e) => {
                              const updated = [...(selectedField.options || [])];
                              updated[oIdx] = {
                                label: e.target.value,
                                value: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                              };
                              updateFieldProperty(selectedField.id, { options: updated });
                            }}
                            className="flex-1 bg-neutral-50 border border-neutral-300 rounded px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (selectedField.options || []).filter(
                                (_, idx) => idx !== oIdx,
                              );
                              updateFieldProperty(selectedField.id, { options: updated });
                            }}
                            className="text-neutral-400 hover:text-red-600 font-bold px-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Required Toggle (INK-83) */}
                <div className="flex items-center justify-between p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <div>
                    <span className="text-xs font-bold text-neutral-900 block">Required Field</span>
                    <span className="text-[10px] text-neutral-500 block">
                      Signer must complete to submit
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedField.isRequired}
                    onChange={(e) =>
                      updateFieldProperty(selectedField.id, { isRequired: e.target.checked })
                    }
                    className="w-4 h-4 text-[#ba0000] rounded"
                  />
                </div>

                {/* Validation Rules (INK-82) */}
                {(selectedField.type === 'TEXT' || selectedField.type === 'EMAIL') && (
                  <div className="space-y-2 p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg">
                    <span className="text-xs font-bold text-neutral-900 block">
                      Validation Rules
                    </span>
                    <div>
                      <label className="block text-[10px] font-semibold text-neutral-600 mb-1">
                        Rule Type
                      </label>
                      <select
                        value={selectedField.validation?.type || 'none'}
                        onChange={(e) =>
                          updateFieldProperty(selectedField.id, {
                            validation: {
                              ...selectedField.validation,
                              type: e.target.value as 'none' | 'email' | 'number' | 'regex',
                            },
                          })
                        }
                        className="w-full bg-white border border-neutral-300 rounded px-2 py-1 text-xs"
                      >
                        <option value="none">None (Free text)</option>
                        <option value="email">Email Address</option>
                        <option value="number">Numbers Only</option>
                        <option value="regex">Custom Regular Expression</option>
                      </select>
                    </div>

                    {selectedField.validation?.type === 'regex' && (
                      <div>
                        <label className="block text-[10px] font-semibold text-neutral-600 mb-1">
                          Regex Pattern
                        </label>
                        <input
                          type="text"
                          placeholder="^[0-9]{5}$ (e.g. ZIP code)"
                          value={selectedField.validation.pattern || ''}
                          onChange={(e) =>
                            updateFieldProperty(selectedField.id, {
                              validation: {
                                ...selectedField.validation,
                                pattern: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-white border border-neutral-300 rounded px-2 py-1 text-xs font-mono"
                        />
                      </div>
                    )}

                    {selectedField.validation?.type !== 'none' && (
                      <div>
                        <label className="block text-[10px] font-semibold text-neutral-600 mb-1">
                          Custom Error Message
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Please enter a valid 5-digit ZIP"
                          value={selectedField.validation?.errorMessage || ''}
                          onChange={(e) =>
                            updateFieldProperty(selectedField.id, {
                              validation: {
                                ...selectedField.validation,
                                errorMessage: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-white border border-neutral-300 rounded px-2 py-1 text-xs"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Position Metrics (INK-84) */}
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-neutral-500 p-2 bg-neutral-100/70 rounded">
                  <span>X: {selectedField.x}%</span>
                  <span>Y: {selectedField.y}%</span>
                  <span>W: {selectedField.width}%</span>
                  <span>H: {selectedField.height}%</span>
                </div>

                {/* Delete Field Button */}
                <button
                  onClick={() => handleDeleteField(selectedField.id)}
                  className="w-full py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-200"
                >
                  Delete Field
                </button>
              </>
            ) : (
              <div className="space-y-4 py-1">
                <div className="border-b border-neutral-200 pb-2.5">
                  <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                    Field Inspector
                  </h3>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Click any field on the document to edit its settings, required rules, or
                    assigned signer.
                  </p>
                </div>

                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 space-y-2">
                  <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <span>💡</span> Quick Guide
                  </span>
                  <ul className="text-[11px] text-neutral-600 space-y-1.5 list-disc list-inside">
                    <li>Drag elements from the left palette onto the document sheet.</li>
                    <li>Click placed fields to open detailed property settings.</li>
                    <li>Drag bottom-right corner to resize any field.</li>
                  </ul>
                </div>

                <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 space-y-2">
                  <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <span>👥</span> Document Signers ({recipients.length})
                  </span>
                  <div className="space-y-1.5 pt-1">
                    {recipients.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-xs">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: r.color }}
                        />
                        <span className="font-semibold text-neutral-800 truncate">{r.name}</span>
                        <span className="text-[10px] text-neutral-400 truncate">({r.email})</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
                  <span className="font-bold block mb-0.5">Document Fields</span>
                  <p className="text-[11px] text-blue-700">
                    {fields.length} {fields.length === 1 ? 'field' : 'fields'} placed across{' '}
                    {recipients.length} {recipients.length === 1 ? 'signer' : 'signers'}.
                  </p>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* ========================================================================= */}
        {/* PREVIEW MODE SIDEBAR: RECIPIENT SWITCHER (INK-85) */}
        {/* ========================================================================= */}
        {activeMode === 'preview' && (
          <aside className="w-80 bg-white border-l border-neutral-200 flex flex-col shrink-0 p-4 space-y-4 shadow-sm">
            <div>
              <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider mb-1">
                Preview Controls
              </h3>
              <p className="text-[11px] text-neutral-500">
                Experience the document from the recipient’s perspective.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                Viewing as Signer:
              </label>
              <select
                value={effectivePreviewRecipientId}
                onChange={(e) => setPreviewRecipientId(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-xs font-bold text-neutral-900 focus:outline-none focus:border-blue-600"
              >
                {recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1.5">
              <span className="font-bold flex items-center gap-1">
                <span>ℹ️</span> Interactive Simulation
              </span>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                Only fields assigned to the selected signer are active and editable. You can type in
                test data and verify field validation rules.
              </p>
            </div>

            <div className="pt-4 border-t border-neutral-200">
              <button
                onClick={() => setActiveMode('editor')}
                className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-lg transition-all"
              >
                ← Return to Field Editor
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Mobile Drawer Navigation (Visible on mobile/tablet) */}
      <div className="md:hidden bg-white border-t border-neutral-200 p-2 flex justify-around text-xs font-bold text-neutral-700">
        <button
          onClick={() => setMobileTab('palette')}
          className={`py-1 px-3 rounded ${mobileTab === 'palette' ? 'bg-neutral-100 text-[#ba0000]' : ''}`}
        >
          ➕ Fields
        </button>
        {selectedField && (
          <button
            onClick={() => setMobileTab('properties')}
            className={`py-1 px-3 rounded ${mobileTab === 'properties' ? 'bg-neutral-100 text-[#ba0000]' : ''}`}
          >
            ⚙️ Properties
          </button>
        )}
        <button
          onClick={() => setMobileTab('recipients')}
          className={`py-1 px-3 rounded ${mobileTab === 'recipients' ? 'bg-neutral-100 text-[#ba0000]' : ''}`}
        >
          👥 Signers ({recipients.length})
        </button>
      </div>

      {/* Specify Signer Emails & Send Modal (INK-266) */}
      {showSendModal && (
        <SendAgreementModal
          agreementId={agreement.id}
          agreementTitle={agreement.title}
          defaultRecipients={recipients}
          onClose={() => setShowSendModal(false)}
          onSuccess={(msg) => {
            setShowSendModal(false);
            if (onSuccess) {
              onSuccess(msg);
            }
            onClose();
          }}
        />
      )}
    </div>
  );
}
