'use client';

export const runtime = 'edge';

import React, { useState, useEffect, useMemo, useRef, use } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api';
import { ElectronicConsentModal } from '@/components/features/sign/ElectronicConsentModal';
import { SignatureModal, AdoptedSignature } from '@/components/features/sign/SignatureModal';
import { OtpVerificationModal } from '@/components/features/sign/OtpVerificationModal';
import { renderMarkdownToHtml } from '@/components/features/agreements/MarkdownEditor';

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

  // Authentication & Guest Gate (INK-266)
  const [isAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(
      localStorage.getItem('graphsign_session_token') || localStorage.getItem('token'),
    );
  });
  const [signedAsGuest, setSignedAsGuest] = useState<boolean>(false);
  const [showAuthGate, setShowAuthGate] = useState<boolean>(false);
  const [showOtpModal, setShowOtpModal] = useState<boolean>(false);

  // ERSD Electronic Consent Modal Gate (INK-99)
  const [showConsentModal, setShowConsentModal] = useState<boolean>(false);
  const [consentAccepted, setConsentAccepted] = useState<boolean>(false);

  // Document Viewer & Zoom Controls (INK-98)
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [effectivePdfUrl, setEffectivePdfUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfFetchError, setPdfFetchError] = useState<string | null>(null);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);

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
          // Send view tracking beacon (INK-93)
          fetch(`${getApiUrl()}/api/v1/sign/${rawToken}/view`, { method: 'POST' }).catch(() => {});

          const hasToken = Boolean(
            typeof window !== 'undefined' &&
              (localStorage.getItem('graphsign_session_token') || localStorage.getItem('token')),
          );
          if (!hasToken) {
            setShowAuthGate(true);
          } else {
            setShowConsentModal(true);
          }
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

  // Fetch PDF binary for document canvas iframe (INK-272)
  useEffect(() => {
    let ignore = false;
    let objectUrlToRevoke: string | null = null;

    async function fetchPdfBlob() {
      if (!rawToken || agreement?.markdownContent) return;

      setIsLoadingPdf(true);
      setPdfFetchError(null);

      try {
        const res = await fetch(`${getApiUrl()}/api/v1/sign/${rawToken}/file`);
        if (!res.ok) {
          throw new Error(`Failed to stream document file (${res.status})`);
        }

        const blob = await res.blob();
        if (blob.size === 0) {
          throw new Error('Received empty document stream.');
        }

        const blobUrl = URL.createObjectURL(blob);
        objectUrlToRevoke = blobUrl;
        if (!ignore) {
          setEffectivePdfUrl(blobUrl);
        }
      } catch (err: unknown) {
        if (!ignore) {
          setPdfFetchError((err as Error).message);
        }
      } finally {
        if (!ignore) {
          setIsLoadingPdf(false);
        }
      }
    }

    if (agreement && !agreement.markdownContent) {
      fetchPdfBlob();
    }

    return () => {
      ignore = true;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [rawToken, agreement?.markdownContent, agreement?.id]);

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

  // Handle Signature Field Click (INK-100 to INK-102, INK-272)
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

  // Save Adopted Signature from Modal (INK-16, INK-272)
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
    } else {
      // If opened from sidebar, populate any empty signature fields for convenience
      for (const f of assignedFields) {
        if ((f.type === 'SIGNATURE' || f.type === 'INITIALS') && !fieldValues[f.id]) {
          setFieldValues((prev) => ({ ...prev, [f.id]: sig.dataUrl }));
        }
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
      const el = document.getElementById(`field-overlay-${targetField.id}`);
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

  // Submit Final Signature Action (INK-104, INK-266)
  async function handleSubmit() {
    if (!validateForm()) {
      handleNavigateNextField();
      return;
    }

    if (signedAsGuest || !isAuthenticated) {
      setIsSubmitting(true);
      try {
        const res = await fetch(`${getApiUrl()}/api/v1/sign/${rawToken}/otp/send`, {
          method: 'POST',
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(
            data.error?.message || data.message || 'Failed to dispatch verification code.',
          );
        }
        setShowOtpModal(true);
      } catch (err: unknown) {
        alert((err as Error).message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    await finalizeSubmission();
  }

  async function finalizeSubmission(otpCode?: string) {
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
          signedAsGuest: Boolean(signedAsGuest || !isAuthenticated),
          otpCode,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to submit signature.');
      }

      setIsCompleted(true);
      setShowOtpModal(false);
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

  // Tokenized Download Action (INK-105 & INK-272)
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
          <p className="text-xs text-neutral-400 mb-6">
            You have formally declined to sign{' '}
            <strong className="text-white">&quot;{agreement.title}&quot;</strong>. The sender has
            been notified of your decision.
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

  // --- COMPLETED SUCCESS VIEW ---
  if (isCompleted) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 font-sans">
        <div className="max-w-lg w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-8 text-center text-white shadow-2xl space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-3xl mx-auto animate-in zoom-in-50 duration-300">
            ✓
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-800">
              Signature Recorded
            </span>
            <h1 className="text-2xl font-black pt-2">You&apos;re All Set!</h1>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              Thank you, <strong className="text-white">{currentRecipient?.name}</strong>. Your
              electronic signature has been securely timestamped and applied to the agreement.
            </p>
          </div>

          <div className="p-4 bg-neutral-800/60 rounded-2xl text-left text-xs space-y-2 border border-neutral-700/60">
            <div className="flex justify-between text-neutral-400">
              <span>Document:</span>
              <span className="font-semibold text-white truncate max-w-[200px]">
                {agreement.title}
              </span>
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
              <span className="font-semibold text-emerald-400">Signed &amp; Recorded</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              type="button"
              onClick={handleDownloadDocument}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              data-testid="download-signed-document-button"
            >
              <span>📥</span> Download Copy (PDF)
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

  const isMarkdown = Boolean(agreement.markdownContent);

  // --- MAIN FULLSCREEN SIGNING STUDIO (INK-272) ---
  return (
    <div className="h-screen w-screen bg-neutral-900 text-neutral-900 flex flex-col font-sans overflow-hidden select-none">
      {/* Sticky Signing Top Header Bar (INK-106, INK-272) */}
      <header className="h-14 bg-neutral-900 border-b border-neutral-800 px-4 sm:px-6 flex items-center justify-between shadow-md shrink-0 z-30">
        {/* Left: Brand & Document Meta */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#ba0000] text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
            GS
          </div>
          <div className="truncate">
            <h1 className="text-xs sm:text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
              {agreement.title}
            </h1>
            <p className="text-[10px] text-neutral-400 truncate">
              From <span className="text-neutral-300 font-medium">{agreement.senderName}</span> •{' '}
              {agreement.organisationName}
            </p>
          </div>
        </div>

        {/* Center: Progress Bar (INK-103) */}
        <div className="hidden md:flex items-center gap-3 bg-neutral-800/80 px-3.5 py-1.5 rounded-xl border border-neutral-700/60">
          <div className="text-right">
            <div className="text-[11px] font-bold text-white">
              {completedRequiredCount} of {assignedRequiredFields.length} Required
            </div>
            <div className="text-[9px] text-neutral-400">Fields Completed</div>
          </div>
          <div className="w-24 h-2 bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{
                width: `${
                  assignedRequiredFields.length > 0
                    ? Math.min(
                        100,
                        Math.round((completedRequiredCount / assignedRequiredFields.length) * 100),
                      )
                    : 100
                }%`,
              }}
            />
          </div>
        </div>

        {/* Right: Studio Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom controls (INK-98) */}
          <div className="hidden sm:flex items-center border border-neutral-700 rounded-xl p-0.5 bg-neutral-800 text-xs font-semibold text-neutral-300">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
              className="px-2 py-1 hover:bg-neutral-700 rounded text-neutral-300"
              title="Zoom Out"
            >
              −
            </button>
            <span className="px-1.5 text-[11px] text-neutral-400 font-mono select-none">
              {zoomLevel}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}
              className="px-2 py-1 hover:bg-neutral-700 rounded text-neutral-300"
              title="Zoom In"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoomLevel(100)}
              className="px-1.5 py-1 text-[10px] hover:bg-neutral-700 rounded text-neutral-400"
              title="Reset Zoom"
            >
              100%
            </button>
          </div>

          {/* Next Field Assistant (INK-103) */}
          {assignedRequiredFields.length > 0 &&
            completedRequiredCount < assignedRequiredFields.length && (
              <button
                type="button"
                onClick={handleNavigateNextField}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-400 bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/80 rounded-xl transition-all"
                title="Scroll to next required field"
              >
                <span>Next Field</span>
                <span>↓</span>
              </button>
            )}

          {/* Decline Button */}
          <button
            type="button"
            onClick={() => setShowDeclineModal(true)}
            className="px-3 py-1.5 text-xs font-semibold text-neutral-400 hover:text-red-400 hover:bg-red-950/40 rounded-xl border border-neutral-800 hover:border-red-900 transition-colors"
          >
            Decline
          </button>

          {/* Finish & Sign Button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !isTurn}
            className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            data-testid="guide-finish-button"
          >
            {isSubmitting ? 'Recording...' : 'Finish & Sign ✓'}
          </button>
        </div>
      </header>

      {/* Sequential Turn Warning Banner */}
      {!isTurn && (
        <div className="bg-amber-500 text-neutral-950 text-xs font-bold py-2 px-4 text-center shrink-0">
          ⏳ It is not your turn yet in sequential signing order. Preceding signers are currently
          completing their steps.
        </div>
      )}

      {/* Form Errors Banner */}
      {Object.keys(formErrors).length > 0 && (
        <div className="bg-red-950/90 border-b border-red-800 text-red-200 text-xs font-semibold py-2 px-4 text-center shrink-0 flex items-center justify-center gap-2">
          <span>⚠️</span>
          <span>Please complete all required fields highlighted in red to proceed.</span>
        </div>
      )}

      {/* Main Studio Body: Sidebar + Document Drafting Canvas */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left Sidebar: Participant Info, Signature Adoption Pill, & Field Checklist */}
        <aside className="w-full lg:w-80 bg-neutral-900 border-b lg:border-b-0 lg:border-r border-neutral-800 flex flex-col p-4 space-y-4 shrink-0 overflow-y-auto z-10">
          {/* Signer Profile Card */}
          <div className="p-3.5 bg-neutral-800/80 border border-neutral-700/60 rounded-2xl space-y-1">
            <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest block">
              Signing Participant
            </span>
            <h2 className="text-sm font-bold text-white truncate">{currentRecipient?.name}</h2>
            <p className="text-[11px] text-neutral-400 truncate">{currentRecipient?.email}</p>
            <div className="pt-1.5 flex items-center gap-2">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-700 text-neutral-300">
                {signedAsGuest || !isAuthenticated ? 'Guest Signer' : 'Authenticated'}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 border border-blue-800">
                {currentRecipient?.role || 'Signer'}
              </span>
            </div>
          </div>

          {/* Adopted Signature Preview & Creator (INK-16, INK-272) */}
          <div className="p-3.5 bg-neutral-800/80 border border-neutral-700/60 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                My Signature
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveSignatureFieldId('signature-sidebar');
                  setActiveSignatureType('SIGNATURE');
                }}
                className="text-[11px] font-bold text-blue-400 hover:text-blue-300 hover:underline"
              >
                {adoptedSignature ? 'Edit ✎' : '+ Adopt'}
              </button>
            </div>

            {adoptedSignature ? (
              <div
                onClick={() => {
                  setActiveSignatureFieldId('signature-sidebar');
                  setActiveSignatureType('SIGNATURE');
                }}
                className="h-16 bg-white rounded-xl p-2 flex items-center justify-center cursor-pointer border border-neutral-300 shadow-inner hover:border-blue-400 transition-all"
                title="Click to change signature"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={adoptedSignature.dataUrl}
                  alt="My Signature"
                  className="max-h-full object-contain"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActiveSignatureFieldId('signature-sidebar');
                  setActiveSignatureType('SIGNATURE');
                }}
                className="w-full py-2.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-neutral-600"
              >
                <span>✍️</span> Create Signature (Type/Draw/Upload)
              </button>
            )}
          </div>

          {/* Required Fields Checklist (INK-103) */}
          <div className="space-y-2 flex-1">
            <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest block">
              Required Fields ({completedRequiredCount}/{assignedRequiredFields.length})
            </span>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {assignedFields.map((field, idx) => {
                const val = fieldValues[field.id];
                const isFilled = val !== undefined && val !== null && val !== '' && val !== false;

                return (
                  <div
                    key={field.id}
                    onClick={() => {
                      const el = document.getElementById(`field-overlay-${field.id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      setHighlightedFieldId(field.id);
                      setTimeout(() => setHighlightedFieldId(null), 2500);
                    }}
                    className={`p-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-all border ${
                      isFilled
                        ? 'bg-neutral-800/40 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                        : 'bg-blue-950/40 border-blue-900/60 text-blue-200 hover:bg-blue-900/40 font-semibold'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-4 text-[10px] text-neutral-500 font-mono">#{idx + 1}</span>
                      <span className="truncate">{field.label || field.type}</span>
                      {field.computedRequired && <span className="text-red-400">*</span>}
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isFilled ? 'bg-emerald-900/80 text-emerald-300' : 'bg-red-900/80 text-red-300'
                      }`}
                    >
                      {isFilled ? '✓' : 'Pending'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Envelope Participants */}
          <div className="p-3 bg-neutral-800/40 rounded-2xl border border-neutral-800 space-y-1.5 text-xs text-neutral-400">
            <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest block">
              Envelope Participants
            </span>
            <div className="space-y-1">
              {allRecipients.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      style={{ backgroundColor: r.color || '#2563EB' }}
                      className="w-2 h-2 rounded-full shrink-0"
                    />
                    <span className="truncate font-medium text-neutral-300">{r.name}</span>
                  </div>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                      r.status === 'SIGNED'
                        ? 'bg-emerald-900/60 text-emerald-400'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center / Right Drafting Stage (INK-272) */}
        <main className="flex-1 overflow-auto bg-neutral-800 flex justify-center p-4 sm:p-8 relative">
          {/* Document Canvas Sheet */}
          <div
            ref={pageContainerRef}
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'top center',
              width: '800px',
              minHeight: '1100px',
            }}
            className="bg-white shadow-2xl rounded-sm relative transition-transform duration-100 flex flex-col mb-auto select-none overflow-hidden"
            data-testid="document-viewer-container"
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
                <p className="text-xs font-semibold text-neutral-600">Loading document...</p>
              </div>
            ) : (
              <div className="p-16 text-center text-neutral-400 flex flex-col items-center justify-center min-h-[600px]">
                <span className="text-4xl mb-2">📄</span>
                <p className="text-xs font-semibold text-neutral-600">{agreement.title}</p>
                {pdfFetchError && <p className="text-[11px] text-red-500 mt-1">{pdfFetchError}</p>}
              </div>
            )}

            {/* Field Overlay Layer Positioned Directly on Top of Document Canvas (INK-78 to INK-85, INK-272) */}
            <div className="absolute inset-0 pointer-events-auto">
              {evaluatedFields
                .filter((f) => f.computedVisible)
                .map((field) => {
                  const isAssignedToMe = field.recipientId === currentRecipient?.id;
                  const assignedRecip = allRecipients.find((r) => r.id === field.recipientId);
                  const recipColor = assignedRecip?.color || '#2563EB';
                  const value = fieldValues[field.id];
                  const hasError = Boolean(formErrors[field.id]);
                  const isHighlighted = highlightedFieldId === field.id;

                  return (
                    <div
                      key={field.id}
                      id={`field-overlay-${field.id}`}
                      style={{
                        left: `${field.x}%`,
                        top: `${field.y}%`,
                        width: `${field.width}%`,
                        height: `${field.height}%`,
                        borderColor: recipColor,
                      }}
                      className={`absolute rounded transition-all duration-150 flex flex-col justify-between overflow-visible ${
                        isAssignedToMe
                          ? isHighlighted
                            ? 'ring-4 ring-blue-500 border-2 bg-blue-50/90 shadow-xl z-30'
                            : hasError
                              ? 'border-2 border-red-500 bg-red-50/90 shadow-md z-20 animate-pulse'
                              : value
                                ? 'border-2 border-emerald-500 bg-white/95 shadow-xs z-10'
                                : 'border-2 border-dashed bg-blue-50/80 shadow-xs hover:border-solid hover:bg-blue-50 z-20'
                          : 'opacity-40 border border-dashed border-neutral-400 bg-neutral-100/50 pointer-events-none z-0'
                      }`}
                      data-testid={`field-container-${field.id}`}
                    >
                      {/* Header Badge */}
                      <div
                        style={{ backgroundColor: recipColor }}
                        className="px-1.5 py-0.5 text-white text-[9px] font-bold flex items-center justify-between shrink-0 leading-tight select-none shadow-2xs"
                      >
                        <div className="flex items-center gap-1 truncate">
                          <span className="truncate">{field.label || field.type}</span>
                          {field.computedRequired && (
                            <span className="text-red-300 font-extrabold text-xs" title="Required">
                              *
                            </span>
                          )}
                        </div>
                        {!isAssignedToMe && (
                          <span className="text-[8px] opacity-80 uppercase ml-1">Other Signer</span>
                        )}
                      </div>

                      {/* Interactive Field Content Body */}
                      <div className="flex-1 bg-white/90 p-0.5 flex items-center justify-center text-center overflow-hidden">
                        {/* SIGNATURE / INITIALS FIELD (INK-16, INK-100 to INK-102, INK-272) */}
                        {(field.type === 'SIGNATURE' || field.type === 'INITIALS') && (
                          <div className="w-full h-full flex items-center justify-center">
                            {value ? (
                              <div
                                onClick={() => isAssignedToMe && handleSignatureFieldClick(field)}
                                className="w-full h-full p-1 flex items-center justify-center cursor-pointer group relative"
                                title="Click to modify signature"
                                data-testid={`signature-applied-${field.id}`}
                              >
                                {typeof value === 'string' && value.startsWith('data:') ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={value}
                                    alt="Applied Signature"
                                    className="max-h-full max-w-full object-contain"
                                  />
                                ) : (
                                  <span className="font-serif italic text-sm text-blue-950 font-bold">
                                    {String(value)}
                                  </span>
                                )}
                                <span className="absolute bottom-0.5 right-1 text-[8px] text-blue-600 bg-white/90 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity font-bold shadow-2xs">
                                  Change ✎
                                </span>
                              </div>
                            ) : isAssignedToMe ? (
                              <button
                                type="button"
                                onClick={() => handleSignatureFieldClick(field)}
                                className="w-full h-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 text-[10px] sm:text-xs font-bold rounded flex items-center justify-center gap-1 transition-all cursor-pointer animate-pulse"
                                data-testid={`click-to-sign-${field.id}`}
                              >
                                <span>✍️</span>
                                <span>{adoptedSignature ? 'Apply' : 'Sign Here'}</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-neutral-400 italic">
                                Signature Area
                              </span>
                            )}
                          </div>
                        )}

                        {/* TEXT FIELD */}
                        {field.type === 'TEXT' && (
                          <input
                            type="text"
                            disabled={!isAssignedToMe}
                            placeholder={field.placeholder || 'Enter text...'}
                            value={typeof value === 'string' ? value : ''}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            className="w-full h-full text-xs font-medium px-1.5 bg-transparent border-0 focus:outline-none text-neutral-900 text-center"
                            data-testid={`input-text-${field.id}`}
                          />
                        )}

                        {/* DATE FIELD */}
                        {field.type === 'DATE' && (
                          <input
                            type="date"
                            disabled={!isAssignedToMe}
                            value={typeof value === 'string' ? value : ''}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            className="w-full h-full text-xs font-medium px-1 bg-transparent border-0 focus:outline-none text-neutral-900 text-center"
                            data-testid={`input-date-${field.id}`}
                          />
                        )}

                        {/* EMAIL FIELD */}
                        {field.type === 'EMAIL' && (
                          <input
                            type="email"
                            disabled={!isAssignedToMe}
                            placeholder="email@example.com"
                            value={typeof value === 'string' ? value : ''}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            className="w-full h-full text-xs font-medium px-1.5 bg-transparent border-0 focus:outline-none text-neutral-900 text-center"
                            data-testid={`input-email-${field.id}`}
                          />
                        )}

                        {/* COMPANY / TITLE FIELD */}
                        {(field.type === 'COMPANY' || field.type === 'TITLE') && (
                          <input
                            type="text"
                            disabled={!isAssignedToMe}
                            placeholder={field.placeholder || field.label}
                            value={typeof value === 'string' ? value : ''}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            className="w-full h-full text-xs font-medium px-1.5 bg-transparent border-0 focus:outline-none text-neutral-900 text-center"
                          />
                        )}

                        {/* CHECKBOX FIELD */}
                        {field.type === 'CHECKBOX' && (
                          <input
                            type="checkbox"
                            disabled={!isAssignedToMe}
                            checked={Boolean(value)}
                            onChange={(e) => handleInputChange(field.id, e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                            data-testid={`input-checkbox-${field.id}`}
                          />
                        )}

                        {/* DROPDOWN FIELD */}
                        {field.type === 'DROPDOWN' && (
                          <select
                            disabled={!isAssignedToMe}
                            value={typeof value === 'string' ? value : ''}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            className="w-full h-full text-xs bg-transparent border-0 focus:outline-none text-neutral-900 text-center"
                          >
                            <option value="">Select option...</option>
                            {field.options?.map((opt, oIdx) => (
                              <option key={oIdx} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </main>
      </div>

      {/* ========================================================================= */}
      {/* MODALS & OVERLAYS (INK-16, INK-99, INK-266, INK-272) */}
      {/* ========================================================================= */}

      {/* INK-16 & INK-100 to INK-102: Signature Adoption Modal */}
      <SignatureModal
        isOpen={Boolean(activeSignatureFieldId)}
        fieldType={activeSignatureType}
        defaultSignerName={currentRecipient?.name || ''}
        onSave={handleSaveAdoptedSignature}
        onClose={() => setActiveSignatureFieldId(null)}
      />

      {/* INK-99: Electronic Record & Signature Disclosure Consent Modal */}
      <ElectronicConsentModal
        isOpen={showConsentModal}
        documentTitle={agreement?.title || 'Agreement'}
        recipientName={currentRecipient?.name || 'Participant'}
        senderName={agreement?.senderName || 'Sender'}
        organisationName={agreement?.organisationName || 'Organization'}
        onAcceptConsent={handleAcceptConsent}
        onDecline={() => {
          setShowConsentModal(false);
          setShowDeclineModal(true);
        }}
      />

      {/* Decline Reason Modal */}
      {showDeclineModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-neutral-900 border border-neutral-200">
            <h3 className="text-base font-bold text-red-600 flex items-center gap-2">
              <span>🛑</span> Decline Document
            </h3>
            <p className="text-xs text-neutral-600">
              Please provide a reason for declining to sign this agreement. This will be recorded in
              the tamper-evident audit trail and communicated to the sender.
            </p>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Enter reason for declining..."
              className="w-full h-24 p-3 border border-neutral-300 rounded-xl text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
              data-testid="decline-reason-input"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setShowDeclineModal(false)}
                className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDecline}
                disabled={isDeclining || !declineReason.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl shadow-xs"
                data-testid="confirm-decline-button"
              >
                {isDeclining ? 'Declining...' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signer Authentication & Guest Gate Modal (INK-266) */}
      {showAuthGate && !signedAsGuest && !isAuthenticated && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 text-neutral-900 border border-neutral-100 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-red-50 text-[#ba0000] rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold border border-red-100 shadow-xs">
              ✍️
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#ba0000] bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
                Signature Invitation
              </span>
              <h2 className="text-xl font-black text-neutral-900 pt-1">Sign Document</h2>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                You are invited to review and sign{' '}
                <strong className="text-neutral-900">&quot;{agreement?.title}&quot;</strong> sent by{' '}
                <strong className="text-neutral-900">{agreement?.senderName}</strong>.
              </p>
            </div>

            <div className="space-y-2.5 pt-2">
              <Link
                href={`/login?returnTo=${encodeURIComponent(`/sign/${rawToken}`)}`}
                className="w-full py-3 bg-[#ba0000] hover:bg-red-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2"
              >
                <span>🔑</span> Log In with Existing Account
              </Link>

              <Link
                href={`/register?returnTo=${encodeURIComponent(`/sign/${rawToken}`)}`}
                className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2"
              >
                <span>✨</span> Sign Up for GraphSign
              </Link>

              <div className="relative py-2 flex items-center justify-center">
                <div className="border-t border-neutral-200 w-full" />
                <span className="bg-white px-3 text-[11px] text-neutral-400 font-medium absolute">
                  or continue directly
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSignedAsGuest(true);
                  setShowAuthGate(false);
                  setShowConsentModal(true);
                }}
                className="w-full py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 border border-neutral-200 cursor-pointer"
              >
                <span>👤</span> Sign as Guest (Email OTP Required)
              </button>
            </div>

            <p className="text-[11px] text-neutral-400">
              Guest signers verify a 6-digit OTP code sent to their email (
              {currentRecipient?.email}) upon signature confirmation.
            </p>
          </div>
        </div>
      )}

      {/* 2nd-Layer Email OTP Verification Modal for Guest Signers (INK-266) */}
      <OtpVerificationModal
        token={rawToken}
        recipientEmail={currentRecipient?.email || ''}
        recipientName={currentRecipient?.name || ''}
        agreementTitle={agreement?.title || ''}
        isOpen={showOtpModal}
        onClose={() => setShowOtpModal(false)}
        onVerified={async (otpCode) => {
          await finalizeSubmission(otpCode);
        }}
      />
    </div>
  );
}
