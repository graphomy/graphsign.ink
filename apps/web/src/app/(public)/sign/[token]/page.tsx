'use client';

export const runtime = 'edge';

import React, { useState, useEffect, useMemo, use } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api';
import { ElectronicConsentModal } from '@/components/features/sign/ElectronicConsentModal';
import { SignatureModal, AdoptedSignature } from '@/components/features/sign/SignatureModal';
import { SigningFieldGuide } from '@/components/features/sign/SigningFieldGuide';

interface RecipientInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  routingOrder: number;
  status: string;
  color?: string;
}

interface ConditionalRule {
  dependsOnFieldId: string;
  condition: 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'CHECKED' | 'UNCHECKED';
  value?: string | boolean | number;
  action: 'SHOW' | 'HIDE' | 'REQUIRE';
}

interface DocumentField {
  id: string;
  type: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  placeholder?: string;
  recipientId?: string;
  isRequired?: boolean;
  options?: { label: string; value: string }[];
  groupName?: string;
  dateFormat?: string;
  validation?: {
    type?: 'none' | 'email' | 'number' | 'regex';
    pattern?: string;
    errorMessage?: string;
  };
  conditionalLogic?: ConditionalRule[];
}

interface AgreementDetails {
  id: string;
  title: string;
  description?: string;
  status: string;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
  markdownContent?: string;
  fields?: {
    fields?: DocumentField[];
    recipients?: RecipientInfo[];
  };
  signingOrder: string;
  currentStep: number;
  expiresAt?: string;
  senderName: string;
  organisationName: string;
}

export default function SignDocumentPage({
  params,
}: {
  params: { token: string } | Promise<{ token: string }>;
}) {
  const resolvedParams =
    params && typeof params === 'object' && 'then' in params
      ? use(params as Promise<{ token: string }>)
      : (params as { token: string });
  const rawToken = resolvedParams?.token || '';

  // Core Data State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agreement, setAgreement] = useState<AgreementDetails | null>(null);
  const [currentRecipient, setCurrentRecipient] = useState<RecipientInfo | null>(null);
  const [allRecipients, setAllRecipients] = useState<RecipientInfo[]>([]);
  const [isTurn, setIsTurn] = useState<boolean>(true);

  // ERSD Electronic Consent Modal Gate (INK-99)
  const [showConsentModal, setShowConsentModal] = useState<boolean>(false);
  const [consentAccepted, setConsentAccepted] = useState<boolean>(false);

  // Document Viewer & Zoom Controls (INK-98)
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Adopted Signature State (INK-100, INK-101, INK-102)
  const [adoptedSignature, setAdoptedSignature] = useState<AdoptedSignature | null>(null);
  const [activeSignatureFieldId, setActiveSignatureFieldId] = useState<string | null>(null);
  const [activeSignatureType, setActiveSignatureType] = useState<'SIGNATURE' | 'INITIALS'>(
    'SIGNATURE',
  );

  // Signer Form State
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean | number>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  // Decline State
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [isDeclining, setIsDeclining] = useState(false);
  const [isDeclined, setIsDeclined] = useState(false);

  // Active Highlighted Field for Guide Focus (INK-103)
  const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(null);

  // Fetch signing session on mount (INK-97)
  useEffect(() => {
    async function loadSigningSession() {
      try {
        setLoading(true);
        const res = await fetch(`${getApiUrl()}/api/v1/sign/${rawToken}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(
            data.error?.message || data.message || 'Invalid or expired signing link.',
          );
        }

        setAgreement(data.data.agreement);
        setCurrentRecipient(data.data.recipient);
        setAllRecipients(data.data.allRecipients || []);
        setIsTurn(data.data.isTurn !== false);

        if (data.data.recipient.status === 'SIGNED' || data.data.agreement.status === 'COMPLETED') {
          setIsCompleted(true);
        } else if (data.data.recipient.status === 'DECLINED') {
          setIsDeclined(true);
        } else {
          // Open ERSD Consent Modal on initial load
          setShowConsentModal(true);
          // Send view tracking beacon (INK-93)
          fetch(`${getApiUrl()}/api/v1/sign/${rawToken}/view`, { method: 'POST' }).catch(() => {});
        }
      } catch (err: unknown) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    if (rawToken) {
      loadSigningSession();
    }
  }, [rawToken]);

  const fields: DocumentField[] = useMemo(() => {
    if (!agreement?.fields?.fields) return [];
    return agreement.fields.fields;
  }, [agreement]);

  // Conditional Logic Evaluation Engine (INK-96)
  const evaluatedFields = useMemo(() => {
    return fields.map((field) => {
      let isVisible = true;
      let isRequired = !!field.isRequired;

      if (field.conditionalLogic && Array.isArray(field.conditionalLogic)) {
        for (const rule of field.conditionalLogic) {
          const triggerValue = fieldValues[rule.dependsOnFieldId];
          let conditionMet = false;

          switch (rule.condition) {
            case 'CHECKED':
              conditionMet = triggerValue === true;
              break;
            case 'UNCHECKED':
              conditionMet = triggerValue !== true;
              break;
            case 'EQUALS':
              conditionMet = String(triggerValue || '') === String(rule.value || '');
              break;
            case 'NOT_EQUALS':
              conditionMet = String(triggerValue || '') !== String(rule.value || '');
              break;
            case 'CONTAINS':
              conditionMet = String(triggerValue || '').includes(String(rule.value || ''));
              break;
          }

          if (conditionMet) {
            if (rule.action === 'HIDE') isVisible = false;
            if (rule.action === 'SHOW') isVisible = true;
            if (rule.action === 'REQUIRE') isRequired = true;
          }
        }
      }

      return {
        ...field,
        computedVisible: isVisible,
        computedRequired: isRequired,
      };
    });
  }, [fields, fieldValues]);

  // Assigned Fields for Current Recipient
  const assignedFields = useMemo(() => {
    return evaluatedFields.filter(
      (f) => f.recipientId === currentRecipient?.id && f.computedVisible,
    );
  }, [evaluatedFields, currentRecipient?.id]);

  const assignedRequiredFields = useMemo(() => {
    return assignedFields.filter((f) => f.computedRequired);
  }, [assignedFields]);

  // Count Completed Required Fields
  const completedRequiredCount = useMemo(() => {
    let count = 0;
    for (const f of assignedRequiredFields) {
      const val = fieldValues[f.id];
      if (val !== undefined && val !== null && val !== '' && val !== false) {
        count++;
      }
    }
    return count;
  }, [assignedRequiredFields, fieldValues]);

  // Handle ERSD Consent Acceptance (INK-99)
  async function handleAcceptConsent() {
    try {
      await fetch(`${getApiUrl()}/api/v1/sign/${rawToken}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentGiven: true, ersdVersion: 'v1.0' }),
      });
      setConsentAccepted(true);
      setShowConsentModal(false);
    } catch {
      setConsentAccepted(true);
      setShowConsentModal(false);
    }
  }

  // Handle Signature Field Click (INK-100 to INK-102)
  function handleSignatureFieldClick(field: DocumentField) {
    if (field.recipientId !== currentRecipient?.id) return;

    if (adoptedSignature) {
      // Fast apply adopted signature
      setFieldValues((prev) => ({ ...prev, [field.id]: adoptedSignature.dataUrl }));
      if (formErrors[field.id]) {
        setFormErrors((prev) => {
          const next = { ...prev };
          delete next[field.id];
          return next;
        });
      }
    } else {
      // Open adoption modal
      setActiveSignatureFieldId(field.id);
      setActiveSignatureType(field.type === 'INITIALS' ? 'INITIALS' : 'SIGNATURE');
    }
  }

  // Save Adopted Signature from Modal
  function handleSaveAdoptedSignature(sig: AdoptedSignature) {
    setAdoptedSignature(sig);
    if (activeSignatureFieldId) {
      setFieldValues((prev) => ({ ...prev, [activeSignatureFieldId]: sig.dataUrl }));
      if (formErrors[activeSignatureFieldId]) {
        setFormErrors((prev) => {
          const next = { ...prev };
          delete next[activeSignatureFieldId];
          return next;
        });
      }
    }
    setActiveSignatureFieldId(null);
  }

  // Input Change & Real-Time Validation (INK-103)
  function handleInputChange(fieldId: string, val: string | boolean | number) {
    setFieldValues((prev) => ({ ...prev, [fieldId]: val }));
    if (formErrors[fieldId]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  }

  // Field Navigation Assistant: Next Field Auto-Scroll (INK-103)
  function handleNavigateNextField() {
    const nextField = assignedRequiredFields.find((f) => {
      const val = fieldValues[f.id];
      return val === undefined || val === null || val === '' || val === false;
    });

    const targetField = nextField || assignedFields[0];
    if (targetField) {
      setHighlightedFieldId(targetField.id);
      const el = document.getElementById(`field-container-${targetField.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => setHighlightedFieldId(null), 2500);
    }
  }

  // Validate Entire Form before Submission (INK-104)
  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    for (const field of assignedFields) {
      const val = fieldValues[field.id];
      if (
        field.computedRequired &&
        (val === undefined || val === '' || val === false || val === null)
      ) {
        errors[field.id] = `${field.label || field.type} is required.`;
      } else if (field.validation?.type === 'email' && typeof val === 'string' && val) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
          errors[field.id] = field.validation.errorMessage || 'Invalid email address';
        }
      } else if (field.validation?.type === 'number' && typeof val === 'string' && val) {
        if (isNaN(Number(val))) {
          errors[field.id] = field.validation.errorMessage || 'Must be a valid number';
        }
      }
    }

    if (!consentAccepted) {
      errors['consent'] = 'You must agree to the Electronic Record and Signature Disclosure.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Submit Final Signature Action (INK-104)
  async function handleSubmit() {
    if (!validateForm()) {
      handleNavigateNextField();
      return;
    }

    setIsSubmitting(true);

    try {
      const primarySigVal = Object.entries(fieldValues).find(([k]) => {
        const f = fields.find((item) => item.id === k);
        return f && (f.type === 'SIGNATURE' || f.type === 'INITIALS');
      })?.[1];

      const res = await fetch(`${getApiUrl()}/api/v1/sign/${rawToken}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldsData: fieldValues,
          signatureData: {
            type:
              adoptedSignature?.type ||
              (typeof primarySigVal === 'string' && primarySigVal.startsWith('data:')
                ? 'DRAWN'
                : 'TYPED'),
            data: String(
              primarySigVal || adoptedSignature?.dataUrl || currentRecipient?.name || 'Signed',
            ),
            fontFamily: adoptedSignature?.fontFamily,
            consentGiven: true,
            timestamp: new Date().toISOString(),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to submit signature.');
      }

      setIsCompleted(true);
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Decline Signing Action
  async function handleDecline() {
    if (!declineReason.trim()) return;
    setIsDeclining(true);

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/sign/${rawToken}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: declineReason.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to decline document.');
      }

      setIsDeclined(true);
      setShowDeclineModal(false);
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setIsDeclining(false);
    }
  }

  // Tokenized Download Action (INK-105)
  function handleDownloadDocument() {
    window.open(`${getApiUrl()}/api/v1/sign/${rawToken}/download`, '_blank');
  }

  // --- LOADING VIEW ---
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <div className="text-center text-white space-y-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-neutral-300">
            Establishing secure signing session...
          </p>
        </div>
      </div>
    );
  }

  // --- ERROR VIEW ---
  if (error || !agreement) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center text-white shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-red-950/60 text-red-400 border border-red-800 flex items-center justify-center text-2xl mx-auto mb-4">
            ⚠️
          </div>
          <h1 className="text-lg font-bold mb-2">Unable to Access Agreement</h1>
          <p className="text-xs text-neutral-400 mb-6">
            {error || 'This link may have expired or was cancelled by the sender.'}
          </p>
          <Link
            href="/"
            className="inline-block px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-lg transition-colors"
          >
            Return to Homepage
          </Link>
        </div>
      </div>
    );
  }

  // --- DECLINED VIEW ---
  if (isDeclined) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center text-white shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-amber-950/60 text-amber-400 border border-amber-800 flex items-center justify-center text-2xl mx-auto mb-4">
            🛑
          </div>
          <h1 className="text-lg font-bold mb-2">Document Signing Declined</h1>
          <p className="text-xs text-neutral-400 mb-4">
            You have formally declined to sign &quot;{agreement.title}&quot;.
          </p>
          <p className="text-[11px] text-neutral-500">
            The document sender ({agreement.senderName}) has been notified.
          </p>
        </div>
      </div>
    );
  }

  // --- SUCCESS / COMPLETION VIEW (INK-105) ---
  if (isCompleted) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 font-sans">
        <div className="max-w-lg w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-8 sm:p-10 text-center text-white shadow-2xl space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-3xl mx-auto shadow-inner">
            ✓
          </div>
          <div>
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-800">
              Legally Executed
            </span>
            <h1 className="text-2xl font-black text-white mt-3">You&apos;re All Set!</h1>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
              Thank you, <strong>{currentRecipient?.name}</strong>. Your signature and assigned
              inputs have been securely cryptographically sealed into the document audit trail.
            </p>
          </div>

          <div className="p-4 bg-neutral-800/60 rounded-2xl text-left text-xs space-y-2 border border-neutral-700/60">
            <div className="flex justify-between text-neutral-400">
              <span>Document:</span>
              <span className="font-semibold text-white">{agreement.title}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Organization:</span>
              <span className="font-semibold text-white">{agreement.organisationName}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Sender:</span>
              <span className="font-semibold text-white">{agreement.senderName}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Status:</span>
              <span className="font-semibold text-emerald-400">Execution Recorded</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              type="button"
              onClick={handleDownloadDocument}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              data-testid="download-signed-document-button"
            >
              <span>📥</span> Download Copy
            </button>
          </div>

          <p className="text-[11px] text-neutral-500">
            A finalized copy with the complete tamper-evident audit certificate will also be sent to
            your email.
          </p>
        </div>
      </div>
    );
  }

  // --- MAIN SIGNING EXPERIENCE VIEW ---
  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900 flex flex-col font-sans">
      {/* Sticky Signing Top Header Bar (INK-106) */}
      <header className="h-14 bg-white border-b border-neutral-200 px-4 sm:px-8 flex items-center justify-between shadow-xs sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-black text-sm flex items-center justify-center shrink-0">
            G
          </div>
          <div className="truncate">
            <h1 className="text-sm font-bold text-neutral-900 truncate">{agreement.title}</h1>
            <p className="text-[10px] text-neutral-500 truncate">
              {agreement.senderName} • {agreement.organisationName}
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {/* Zoom controls (INK-98) */}
          <div className="hidden sm:flex items-center border border-neutral-200 rounded-lg p-0.5 bg-neutral-50 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(50, z - 15))}
              className="px-2 py-1 hover:bg-white rounded text-neutral-600"
              title="Zoom Out"
            >
              −
            </button>
            <span className="px-1.5 text-[11px] text-neutral-500 font-mono select-none">
              {zoomLevel}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(150, z + 15))}
              className="px-2 py-1 hover:bg-white rounded text-neutral-600"
              title="Zoom In"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="px-1.5 py-1 text-[10px] hover:bg-white rounded text-neutral-400"
              title="Reset Zoom"
            >
              Reset
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowDeclineModal(true)}
            className="px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:text-red-600 hover:bg-red-50 rounded-lg border border-neutral-200 transition-colors"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !isTurn}
            className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            data-testid="header-finish-button"
          >
            {isSubmitting ? 'Recording...' : 'Finish & Sign ✓'}
          </button>
        </div>
      </header>

      {/* Sequential Turn Warning Banner */}
      {!isTurn && (
        <div className="bg-amber-500 text-neutral-950 text-xs font-bold py-2 px-4 text-center">
          ⏳ It is not your turn yet in sequential signing order. Preceding signers are currently
          completing their steps.
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8 flex flex-col gap-6">
        {/* Signer Identification Card */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
              Assigned Participant
            </span>
            <h2 className="text-base font-bold text-neutral-900">
              {currentRecipient?.name} ({currentRecipient?.email})
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Please review the document below and complete all required fields highlighted for you.
            </p>
          </div>

          {/* Participant avatars */}
          <div className="flex items-center gap-2 text-xs font-medium text-neutral-600 bg-neutral-50 border border-neutral-200 px-3.5 py-2 rounded-xl">
            <span className="text-[11px] font-semibold text-neutral-500">Envelope:</span>
            <div className="flex -space-x-1.5">
              {allRecipients.map((r) => (
                <div
                  key={r.id}
                  title={`${r.name} (${r.status})`}
                  style={{ backgroundColor: r.color || '#2563EB' }}
                  className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-xs select-none"
                >
                  {r.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Document Viewer Container with Zoom Transform (INK-98) */}
        <div
          className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-6 sm:p-12 relative min-h-[750px] transition-transform origin-top duration-150"
          style={{ transform: `scale(${zoomLevel / 100})` }}
          data-testid="document-viewer-container"
        >
          {/* Document Content */}
          <div className="prose prose-sm max-w-none text-neutral-800 leading-relaxed mb-8">
            {agreement.markdownContent ? (
              <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
                {agreement.markdownContent}
              </div>
            ) : (
              <div className="p-8 text-center text-neutral-500 bg-neutral-50 rounded-xl border border-neutral-200">
                <span className="text-2xl block mb-2">📄</span>
                <p className="font-bold text-sm text-neutral-800">
                  {agreement.fileName || 'Uploaded Document Envelope'}
                </p>
                <p className="text-xs mt-1">
                  Complete the fields assigned to you below to execute this agreement.
                </p>
              </div>
            )}
          </div>

          {/* Interactive Field Overlays Grid (INK-78 to INK-85 & INK-103) */}
          <div className="pt-8 border-t border-neutral-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {evaluatedFields
              .filter((f) => f.computedVisible)
              .map((field) => {
                const isAssignedToMe = field.recipientId === currentRecipient?.id;
                const value = fieldValues[field.id];
                const hasError = !!formErrors[field.id];
                const isHighlighted = highlightedFieldId === field.id;

                return (
                  <div
                    key={field.id}
                    id={`field-container-${field.id}`}
                    className={`p-3.5 rounded-xl border transition-all duration-200 ${
                      isAssignedToMe
                        ? isHighlighted
                          ? 'border-blue-600 ring-4 ring-blue-500/20 bg-blue-50/60 shadow-md'
                          : hasError
                            ? 'border-red-500 bg-red-50/50'
                            : value
                              ? 'border-emerald-300 bg-emerald-50/20'
                              : 'border-blue-300 bg-blue-50/30'
                        : 'border-neutral-200 bg-neutral-50/60 opacity-60 pointer-events-none'
                    }`}
                    data-testid={`field-container-${field.id}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor={`input-field-${field.id}`}
                        className="text-xs font-bold text-neutral-800 flex items-center gap-1"
                      >
                        <span>{field.label || field.type}</span>
                        {field.computedRequired && (
                          <span className="text-red-500 font-black" title="Required field">
                            *
                          </span>
                        )}
                      </label>
                      {!isAssignedToMe ? (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600">
                          Other Signer
                        </span>
                      ) : value ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          ✓ Filled
                        </span>
                      ) : null}
                    </div>

                    {/* Signature / Initials Field (INK-100 to INK-102) */}
                    {(field.type === 'SIGNATURE' || field.type === 'INITIALS') && (
                      <div>
                        {value ? (
                          <div
                            onClick={() => isAssignedToMe && handleSignatureFieldClick(field)}
                            className="h-16 bg-white border border-blue-400 rounded-xl flex items-center justify-center p-2 cursor-pointer hover:border-blue-600 hover:shadow-xs transition-all group relative"
                            title="Click to adopt a different signature"
                            data-testid={`signature-applied-${field.id}`}
                          >
                            {typeof value === 'string' && value.startsWith('data:') ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={value}
                                alt="Applied Signature"
                                className="max-h-full object-contain"
                              />
                            ) : (
                              <span className="font-serif italic text-lg text-blue-900">
                                {String(value)}
                              </span>
                            )}
                            <span className="absolute bottom-1 right-2 text-[9px] text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              Change ✎
                            </span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => isAssignedToMe && handleSignatureFieldClick(field)}
                            className="w-full h-14 bg-white border-2 border-dashed border-blue-400 hover:border-blue-600 rounded-xl text-xs font-bold text-blue-600 hover:bg-blue-50/50 flex items-center justify-center gap-1.5 transition-all shadow-xs"
                            data-testid={`click-to-sign-${field.id}`}
                          >
                            ✍️ {adoptedSignature ? 'Apply Signature' : 'Click to Sign'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Text Field */}
                    {field.type === 'TEXT' && (
                      <input
                        id={`input-field-${field.id}`}
                        type="text"
                        placeholder={field.placeholder || 'Enter text...'}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                        data-testid={`input-text-${field.id}`}
                      />
                    )}

                    {/* Date Field */}
                    {field.type === 'DATE' && (
                      <input
                        id={`input-field-${field.id}`}
                        type="date"
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-blue-600"
                        data-testid={`input-date-${field.id}`}
                      />
                    )}

                    {/* Email Field */}
                    {field.type === 'EMAIL' && (
                      <input
                        id={`input-field-${field.id}`}
                        type="email"
                        placeholder="signer@example.com"
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-blue-600"
                        data-testid={`input-email-${field.id}`}
                      />
                    )}

                    {/* Company Field */}
                    {field.type === 'COMPANY' && (
                      <input
                        id={`input-field-${field.id}`}
                        type="text"
                        placeholder="Company name..."
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-blue-600"
                        data-testid={`input-company-${field.id}`}
                      />
                    )}

                    {/* Checkbox Field */}
                    {field.type === 'CHECKBOX' && (
                      <label className="flex items-center gap-2 cursor-pointer py-1 select-none">
                        <input
                          id={`input-field-${field.id}`}
                          type="checkbox"
                          checked={!!value}
                          onChange={(e) => handleInputChange(field.id, e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded border-neutral-300 focus:ring-blue-500"
                          data-testid={`input-checkbox-${field.id}`}
                        />
                        <span className="text-xs text-neutral-700">{field.label}</span>
                      </label>
                    )}

                    {/* Radio Group Field */}
                    {field.type === 'RADIO' && (
                      <div className="space-y-1.5 py-1">
                        {field.options?.map((opt) => (
                          <label
                            key={opt.value}
                            className="flex items-center gap-2 cursor-pointer text-xs select-none"
                          >
                            <input
                              type="radio"
                              name={field.groupName || field.id}
                              value={opt.value}
                              checked={value === opt.value}
                              onChange={(e) => handleInputChange(field.id, e.target.value)}
                              className="text-blue-600"
                            />
                            <span className="text-neutral-700">{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Dropdown Field */}
                    {field.type === 'DROPDOWN' && (
                      <select
                        id={`input-field-${field.id}`}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:border-blue-600"
                        data-testid={`input-dropdown-${field.id}`}
                      >
                        <option value="">Select option...</option>
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Field Error Message */}
                    {hasError && (
                      <p className="text-[10px] text-red-600 font-semibold mt-1">
                        {formErrors[field.id]}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Electronic Consent Disclosure Box (INK-99) */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-6 shadow-xs">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => {
                setConsentAccepted(e.target.checked);
                if (formErrors['consent']) {
                  setFormErrors((prev) => {
                    const next = { ...prev };
                    delete next['consent'];
                    return next;
                  });
                }
              }}
              className="mt-0.5 w-4 h-4 text-blue-600 rounded border-neutral-300 focus:ring-blue-500"
              data-testid="page-ersd-checkbox"
            />
            <div className="text-xs text-neutral-600 leading-relaxed">
              <span className="font-bold text-neutral-900">
                Electronic Record and Signature Disclosure:{' '}
              </span>
              I agree to use electronic records and signatures for this document. I acknowledge that
              my electronic signature carries full legal validity and enforceability under
              applicable laws (ESIGN, UETA &amp; eIDAS).
            </div>
          </label>
          {formErrors['consent'] && (
            <p className="text-[11px] text-red-600 font-bold mt-2 ml-7">{formErrors['consent']}</p>
          )}
        </div>

        {/* Bottom Actions Bar */}
        <div className="flex justify-end gap-3 pb-20">
          <button
            type="button"
            onClick={() => setShowDeclineModal(true)}
            className="px-4 py-2.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-xl hover:bg-neutral-50 transition-colors"
          >
            Decline Agreement
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !isTurn}
            className="px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow-sm transition-all"
            data-testid="bottom-finish-button"
          >
            {isSubmitting ? 'Recording Signature...' : 'Complete & Sign Document ✓'}
          </button>
        </div>
      </main>

      {/* Floating Field Completion Guide (INK-103) */}
      <SigningFieldGuide
        totalRequired={assignedRequiredFields.length}
        completedRequired={completedRequiredCount}
        onNavigateNext={handleNavigateNextField}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        isTurn={isTurn}
      />

      {/* ERSD Compliance Gate Modal (INK-99) */}
      <ElectronicConsentModal
        isOpen={showConsentModal && !consentAccepted}
        documentTitle={agreement.title}
        recipientName={currentRecipient?.name || ''}
        senderName={agreement.senderName}
        organisationName={agreement.organisationName}
        onAcceptConsent={handleAcceptConsent}
        onDecline={() => {
          setShowConsentModal(false);
          setShowDeclineModal(true);
        }}
      />

      {/* Signature Adoption Modal (INK-100, INK-101, INK-102, INK-106) */}
      <SignatureModal
        isOpen={activeSignatureFieldId !== null}
        fieldType={activeSignatureType}
        defaultSignerName={currentRecipient?.name || ''}
        onSave={handleSaveAdoptedSignature}
        onClose={() => setActiveSignatureFieldId(null)}
      />

      {/* Decline Reason Modal */}
      {showDeclineModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          data-testid="decline-modal-overlay"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-neutral-200 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-neutral-900">Decline to Sign</h3>
            <p className="text-xs text-neutral-600">
              Please state why you are declining this agreement. The sender will be notified
              immediately.
            </p>
            <textarea
              rows={3}
              placeholder="Reason for declining..."
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              className="w-full bg-white border border-neutral-300 rounded-xl p-3 text-xs text-neutral-900 focus:outline-none focus:border-red-500"
              data-testid="decline-reason-input"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowDeclineModal(false)}
                className="px-3.5 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDecline}
                disabled={isDeclining || !declineReason.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg shadow-sm"
                data-testid="confirm-decline-button"
              >
                {isDeclining ? 'Declining...' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
