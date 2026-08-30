'use client';

export const runtime = 'edge';

import React, { useState, useEffect, useMemo, useCallback, useRef, use } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api';
import { orDash, orLabel, formatHash } from '@/lib/format';
import { formatDateTime } from '@/lib/date-utils';
import { Button } from '@/components/ui/Button';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ElectronicConsentModal } from '@/components/features/sign/ElectronicConsentModal';
import { SignatureModal, AdoptedSignature } from '@/components/features/sign/SignatureModal';
import { OtpVerificationModal } from '@/components/features/sign/OtpVerificationModal';
import { renderMarkdownToHtml } from '@/components/features/agreements/MarkdownEditor';
import {
  FileText,
  ShieldCheck,
  AlertCircle,
  Download,
  Printer,
  Copy,
  Check,
  CheckCheck,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

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
  senderName?: string;
  author?: {
    name?: string;
    email?: string;
  };
  organisationName?: string;
  envelopeId?: string;
  certHash?: string;
  verificationToken?: string;
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
  const [isTurn, setIsTurn] = useState<boolean>(true);

  // Authentication & Guest Gate
  const [isAuthenticated] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(
      localStorage.getItem('graphsign_session_token') || localStorage.getItem('token'),
    );
  });
  const [signedAsGuest, setSignedAsGuest] = useState<boolean>(false);
  const [showAuthGate, setShowAuthGate] = useState<boolean>(false);
  const [showOtpModal, setShowOtpModal] = useState<boolean>(false);

  // ERSD Electronic Consent Modal Gate
  const [showConsentModal, setShowConsentModal] = useState<boolean>(false);
  const [consentAccepted, setConsentAccepted] = useState<boolean>(false);

  // Document Viewer & Zoom Controls
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [effectivePdfUrl, setEffectivePdfUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfFetchError, setPdfFetchError] = useState<string | null>(null);
  const pageContainerRef = useRef<HTMLDivElement | null>(null);

  // Adopted Signature State
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

  // Active Highlighted Field for Guide Focus
  const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(null);
  const [copiedEnvelope, setCopiedEnvelope] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // Page Navigation State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const totalPages = useMemo(() => {
    if (!agreement?.fields?.fields || agreement.fields.fields.length === 0) return 1;
    const maxPage = Math.max(
      ...agreement.fields.fields.map((f: { pageNumber?: number }) => f.pageNumber || 1),
    );
    return Math.max(1, maxPage);
  }, [agreement]);

  // Fetch signing session on mount
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
        setIsTurn(data.data.isTurn !== false);

        if (data.data.recipient.status === 'SIGNED' || data.data.agreement.status === 'COMPLETED') {
          setIsCompleted(true);
        } else if (data.data.recipient.status === 'DECLINED') {
          setIsDeclined(true);
        } else {
          // Send view tracking beacon
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

  // Fetch PDF binary for document canvas
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
  }, [rawToken, agreement]);

  const fields: DocumentField[] = useMemo(() => {
    if (!agreement?.fields?.fields) return [];
    return agreement.fields.fields;
  }, [agreement]);

  // Conditional Logic Engine
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

  // Helper to determine if a field belongs to the currently active signer
  const isFieldAssignedToMe = useCallback(
    (fieldRecipientId?: string) => {
      if (!fieldRecipientId) return true;
      if (!currentRecipient) return true;
      if (fieldRecipientId === currentRecipient.id) return true;
      if (fieldRecipientId === currentRecipient.email) return true;
      if (currentRecipient.role && fieldRecipientId === currentRecipient.role) return true;
      if (
        currentRecipient.routingOrder &&
        (fieldRecipientId === `signer-${currentRecipient.routingOrder}` ||
          fieldRecipientId === `recip-${currentRecipient.routingOrder}`)
      ) {
        return true;
      }
      if (
        (currentRecipient.routingOrder === 1 || !currentRecipient.routingOrder) &&
        (fieldRecipientId === 'signer-1' ||
          fieldRecipientId === 'recip-1' ||
          fieldRecipientId === 'signer' ||
          fieldRecipientId === 'r-1')
      ) {
        return true;
      }
      const totalRecipients = agreement?.fields?.recipients?.length || 0;
      if (totalRecipients <= 1) return true;
      return false;
    },
    [currentRecipient, agreement],
  );

  // Assigned Fields for Current Recipient
  const assignedFields = useMemo(() => {
    return evaluatedFields.filter((f) => isFieldAssignedToMe(f.recipientId) && f.computedVisible);
  }, [evaluatedFields, isFieldAssignedToMe]);

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

  // Handle ERSD Consent Acceptance
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

  // Handle Signature Field Click (Click-to-sign / Click-to-apply)
  function handleSignatureFieldClick(field: DocumentField) {
    if (!isFieldAssignedToMe(field.recipientId)) return;

    if (adoptedSignature) {
      setFieldValues((prev) => ({ ...prev, [field.id]: adoptedSignature.dataUrl }));
      if (formErrors[field.id]) {
        setFormErrors((prev) => {
          const next = { ...prev };
          delete next[field.id];
          return next;
        });
      }
    } else {
      setActiveSignatureFieldId(field.id);
      setActiveSignatureType(field.type === 'INITIALS' ? 'INITIALS' : 'SIGNATURE');
    }
  }

  // Save Adopted Signature from Modal
  function handleSaveAdoptedSignature(sig: AdoptedSignature) {
    setAdoptedSignature(sig);
    setFieldValues((prev) => {
      const next = { ...prev };
      if (activeSignatureFieldId && activeSignatureFieldId !== 'signature-sidebar') {
        next[activeSignatureFieldId] = sig.dataUrl;
      }
      // Also auto-populate any other empty signature fields
      for (const f of assignedFields) {
        if ((f.type === 'SIGNATURE' || f.type === 'INITIALS') && !next[f.id]) {
          next[f.id] = sig.dataUrl;
        }
      }
      return next;
    });

    if (activeSignatureFieldId && formErrors[activeSignatureFieldId]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[activeSignatureFieldId];
        return next;
      });
    }
    setActiveSignatureFieldId(null);
  }

  // Input Change
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

  // Next Field Auto-Scroll
  function handleNavigateNextField() {
    const nextField = assignedRequiredFields.find((f) => {
      const val = fieldValues[f.id];
      return val === undefined || val === null || val === '' || val === false;
    });

    const targetField = nextField || assignedFields[0];
    if (targetField) {
      setHighlightedFieldId(targetField.id);
      const el = document.getElementById(`field-overlay-${targetField.id}`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => setHighlightedFieldId(null), 2500);
    }
  }

  // Validate Entire Form
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

  // Submit Final Signature
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

  function handleDownloadDocument() {
    window.open(`${getApiUrl()}/api/v1/sign/${rawToken}/download`, '_blank');
  }

  const envelopeId = agreement?.envelopeId || `env_sec_${rawToken.substring(0, 8)}`;
  const certHash =
    agreement?.certHash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  // --- LOADING VIEW ---
  if (loading) {
    return (
      <div className="min-h-screen bg-ink-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-ink-300 border-t-brand-600 rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-ink-600">Establishing secure signing session…</p>
        </div>
      </div>
    );
  }

  // --- ERROR VIEW ---
  if (error || !agreement) {
    return (
      <div className="min-h-screen bg-ink-50 flex items-center justify-center p-4 font-sans">
        <Card elevation="e2" className="max-w-md w-full p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-ink-900">Unable to Access Agreement</h1>
          <p className="text-xs text-ink-500 leading-relaxed">
            {error || 'This link may have expired or was cancelled by the sender.'}
          </p>
          <div className="pt-2">
            <Link href="/">
              <Button variant="outline" size="md">
                Return to Homepage
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // --- DECLINED VIEW ---
  if (isDeclined) {
    return (
      <div className="min-h-screen bg-ink-50 flex items-center justify-center p-4 font-sans">
        <Card elevation="e2" className="max-w-md w-full p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-ink-900">Document Signing Declined</h1>
          <p className="text-xs text-ink-500 leading-relaxed">
            You have formally declined to sign{' '}
            <strong className="text-ink-900">&quot;{agreement.title}&quot;</strong>. The sender has
            been notified of your decision.
          </p>
          <div className="pt-2">
            <Link href="/">
              <Button variant="outline" size="md">
                Return to Homepage
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // --- B7: COMPLETED SUCCESS VIEW (Bright Theme) ---
  if (isCompleted) {
    return (
      <div className="min-h-screen bg-ink-50 flex flex-col items-center justify-center p-4 sm:p-6 font-sans">
        <Card elevation="e2" className="max-w-xl w-full p-8 sm:p-10 text-center space-y-6">
          {/* Green check circle */}
          <div className="w-14 h-14 rounded-full bg-verified-50 text-verified-600 border border-verified-200 flex items-center justify-center mx-auto animate-in zoom-in-50 duration-200">
            <Check className="w-7 h-7 stroke-[2.5]" />
          </div>

          <div className="space-y-1.5">
            <Badge tone="success" size="sm" className="mb-2">
              Executed &amp; Verified
            </Badge>
            <h1 className="text-2xl font-bold text-ink-900 tracking-tight">You&apos;re All Set!</h1>
            <p className="text-[13px] text-ink-500 max-w-sm mx-auto leading-relaxed">
              Document executed successfully. A cryptographically sealed copy has been sent to{' '}
              <strong className="text-ink-900 font-semibold">
                {orDash(currentRecipient?.email)}
              </strong>
              .
            </p>
          </div>

          {/* Receipt Metadata Block */}
          <div className="bg-ink-50 border border-ink-200 rounded-lg p-4 text-left text-xs space-y-2.5">
            <div className="flex justify-between items-center text-ink-500">
              <span>Document</span>
              <span
                className="font-semibold text-ink-900 truncate max-w-[240px]"
                title={agreement.title}
              >
                {orDash(agreement.title)}
              </span>
            </div>
            <div className="flex justify-between items-center text-ink-500">
              <span>Signer</span>
              <span className="font-semibold text-ink-900">
                {orLabel(currentRecipient?.name, orDash(currentRecipient?.email))}
              </span>
            </div>
            <div className="flex justify-between items-center text-ink-500">
              <span>Sender</span>
              <span className="font-semibold text-ink-900">
                {orDash(agreement.senderName || agreement.author?.name || agreement.author?.email)}
              </span>
            </div>
            <div className="flex justify-between items-center text-ink-500">
              <span>Envelope ID</span>
              <div className="flex items-center gap-1.5 font-mono text-ink-900 font-semibold tabular-nums">
                <span>{envelopeId}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(envelopeId);
                    setCopiedEnvelope(true);
                    setTimeout(() => setCopiedEnvelope(false), 2000);
                  }}
                  className="text-ink-400 hover:text-ink-700"
                  title="Copy Envelope ID"
                >
                  {copiedEnvelope ? (
                    <CheckCheck className="w-3.5 h-3.5 text-verified-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center text-ink-500">
              <span>Verification Token</span>
              <div className="flex items-center gap-1.5 font-mono text-ink-900 font-semibold tabular-nums">
                <span>{`GS-${rawToken.substring(0, 8)}`}</span>
              </div>
            </div>
            <div className="flex justify-between items-center text-ink-500">
              <span>Completed At</span>
              <span className="text-ink-900 font-medium tabular-nums">
                {formatDateTime(new Date().toISOString(), {
                  includeSeconds: true,
                  includeTimezone: true,
                })}
              </span>
            </div>
            <div className="flex justify-between items-center text-ink-500 pt-1 border-t border-ink-200">
              <span>SHA-256 Cert Hash</span>
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-ink-700 tabular-nums">
                <span>{formatHash(certHash, 8, 8)}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(certHash);
                    setCopiedHash(true);
                    setTimeout(() => setCopiedHash(false), 2000);
                  }}
                  className="text-ink-400 hover:text-ink-700"
                  title="Copy full certificate SHA-256 hash"
                >
                  {copiedHash ? (
                    <CheckCheck className="w-3.5 h-3.5 text-verified-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-2">
            <Button
              variant="primary"
              size="lg"
              leftIcon={<Download className="w-4 h-4" />}
              onClick={handleDownloadDocument}
              data-testid="download-signed-document-button"
            >
              Download executed PDF
            </Button>
            <a
              href={`/verify/${envelopeId || rawToken}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-ink-300 bg-white hover:bg-ink-50 text-ink-900 font-semibold text-xs transition-colors shadow-xs"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Verify Authenticity (/verify)
            </a>
            <Button
              variant="ghost"
              size="lg"
              leftIcon={<Printer className="w-4 h-4" />}
              onClick={() => window.print()}
            >
              Print receipt
            </Button>
          </div>

          {/* Guest Account Upsell Card */}
          {(!isAuthenticated || signedAsGuest) && (
            <div className="mt-6 p-4 bg-brand-50/50 border border-brand-200 rounded-lg text-left flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-ink-900">Track all your signed agreements</h4>
                <p className="text-[11px] text-ink-600 mt-0.5">
                  Create a free GraphSign account to store, audit, and organize documents executed
                  across any device.
                </p>
                <div className="pt-2">
                  <Link href="/register">
                    <Button variant="primary" size="sm">
                      Create free account
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  const isMarkdown = Boolean(agreement.markdownContent);

  // --- B5: MAIN FULLSCREEN SIGNING WORKSPACE ---
  return (
    <div className="h-screen w-screen bg-ink-100 text-ink-900 flex flex-col font-sans overflow-hidden select-none">
      {/* 64px Sticky Signing Top Header Bar */}
      <header className="h-16 bg-white border-b border-ink-200 px-4 sm:px-6 flex items-center justify-between shadow-xs shrink-0 z-30">
        {/* Left: Brand Lockup & Doc Meta */}
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="flex items-center gap-1 shrink-0">
            <span className="w-8 h-8 rounded-md bg-brand-600 text-white font-bold text-base flex items-center justify-center shadow-xs">
              g
            </span>
          </Link>
          <div className="truncate min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-ink-900 truncate max-w-xs sm:max-w-md">
                {agreement.title}
              </h1>
              <StatusPill status={agreement.status} />
            </div>
            <p className="text-[11px] text-ink-500 truncate">
              Sender: <span className="text-ink-700 font-medium">{agreement.senderName}</span>
              {agreement.organisationName && ` (${agreement.organisationName})`}
            </p>
          </div>
        </div>

        {/* Center: 5-Step Stepper */}
        <div className="hidden lg:flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-verified-700">
            <div className="w-5 h-5 rounded-full bg-verified-100 text-verified-700 flex items-center justify-center text-[10px] font-bold">
              <Check className="w-3 h-3" />
            </div>
            <span>1 Consent</span>
          </div>

          <span className="text-ink-300">—</span>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-verified-700">
            <div className="w-5 h-5 rounded-full bg-verified-100 text-verified-700 flex items-center justify-center text-[10px] font-bold">
              <Check className="w-3 h-3" />
            </div>
            <span>2 Review</span>
          </div>

          <span className="text-ink-300">—</span>

          <div className="flex items-center gap-1.5 text-xs font-bold text-brand-600">
            <div className="w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px]">
              3
            </div>
            <span>Sign</span>
          </div>

          <span className="text-ink-300">—</span>

          <div className="flex items-center gap-1.5 text-xs font-medium text-ink-400">
            <div className="w-5 h-5 rounded-full bg-ink-100 text-ink-500 flex items-center justify-center text-[10px]">
              4
            </div>
            <span>Verify</span>
          </div>

          <span className="text-ink-300">—</span>

          <div className="flex items-center gap-1.5 text-xs font-medium text-ink-400">
            <div className="w-5 h-5 rounded-full bg-ink-100 text-ink-500 flex items-center justify-center text-[10px]">
              5
            </div>
            <span>Executed</span>
          </div>
        </div>

        {/* Right: Studio Controls */}
        <div className="flex items-center gap-2">
          {/* Page Navigation Controls */}
          <div className="flex items-center gap-1 bg-ink-50 border border-ink-200 rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1 rounded text-ink-600 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-40"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-xs font-medium text-ink-700 tabular-nums">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1 rounded text-ink-600 hover:text-ink-900 hover:bg-ink-100 disabled:opacity-40"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="hidden sm:flex items-center border border-ink-200 rounded-md p-0.5 bg-ink-50 text-xs font-medium text-ink-700">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
              className="p-1 hover:bg-ink-200 rounded text-ink-700"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-xs font-mono text-ink-700 select-none tabular-nums">
              {zoomLevel}%
            </span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}
              className="p-1 hover:bg-ink-200 rounded text-ink-700"
              title="Zoom In"
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

          {/* Decline Button */}
          <Button variant="ghost" size="sm" onClick={() => setShowDeclineModal(true)}>
            Decline
          </Button>

          {/* Finish & Sign Button */}
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={isSubmitting || !isTurn}
            isLoading={isSubmitting}
            data-testid="guide-finish-button"
          >
            Finish &amp; sign
          </Button>
        </div>
      </header>

      {/* Sequential Turn Warning Banner */}
      {!isTurn && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs font-semibold py-2 px-4 text-center shrink-0">
          It is not your turn yet in sequential signing order. Preceding signers are currently
          completing their steps.
        </div>
      )}

      {/* Form Errors Banner */}
      {Object.keys(formErrors).length > 0 && (
        <div className="bg-brand-50 border-b border-brand-200 text-brand-700 text-xs font-medium py-2 px-4 text-center shrink-0 flex items-center justify-center gap-1.5">
          <AlertCircle className="w-4 h-4" />
          <span>Please complete all required fields highlighted in red to proceed.</span>
        </div>
      )}

      {/* Main Studio Body: Sidebar + Document Drafting Canvas */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left Sidebar: Participant Info & Field Checklist */}
        <aside className="w-full lg:w-80 bg-white border-b lg:border-b-0 lg:border-r border-ink-200 flex flex-col p-4 space-y-4 shrink-0 overflow-y-auto z-10">
          {/* Signer Profile Card */}
          <div className="p-3.5 bg-ink-50 border border-ink-200 rounded-lg space-y-1">
            <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider block">
              Signing Participant
            </span>
            <h2 className="text-sm font-bold text-ink-900 truncate">{currentRecipient?.name}</h2>
            <p className="text-xs text-ink-500 truncate">{currentRecipient?.email}</p>
            <div className="pt-1.5 flex items-center gap-2">
              <Badge tone="neutral" size="sm">
                {signedAsGuest || !isAuthenticated ? 'Guest Signer' : 'Authenticated'}
              </Badge>
              <Badge tone="info" size="sm">
                {currentRecipient?.role || 'Signer'}
              </Badge>
            </div>
          </div>

          {/* Adopted Signature Preview */}
          <div className="p-3.5 bg-ink-50 border border-ink-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                My Signature
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveSignatureFieldId('signature-sidebar');
                  setActiveSignatureType('SIGNATURE');
                }}
                className="text-xs font-bold text-brand-700 hover:underline"
              >
                {adoptedSignature ? 'Edit signature' : '+ Adopt signature'}
              </button>
            </div>

            {adoptedSignature ? (
              <div
                onClick={() => {
                  setActiveSignatureFieldId('signature-sidebar');
                  setActiveSignatureType('SIGNATURE');
                }}
                className="h-16 bg-white rounded-md p-2 flex items-center justify-center cursor-pointer border border-ink-200 shadow-xs hover:border-ink-400 transition-all"
                title="Click to modify signature"
              >
                <img
                  src={adoptedSignature.dataUrl}
                  alt="My Signature"
                  className="max-h-full object-contain"
                />
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center"
                onClick={() => {
                  setActiveSignatureFieldId('signature-sidebar');
                  setActiveSignatureType('SIGNATURE');
                }}
              >
                Create Signature (Draw/Type/Upload)
              </Button>
            )}
          </div>

          {/* Required Fields Checklist */}
          <div className="space-y-2 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-ink-400 uppercase tracking-wider block">
                Fields to complete
              </span>
              <span className="text-xs font-mono font-semibold text-ink-700 tabular-nums">
                {completedRequiredCount}/{assignedRequiredFields.length}
              </span>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {assignedFields.map((field, idx) => {
                const val = fieldValues[field.id];
                const isFilled = val !== undefined && val !== null && val !== '' && val !== false;

                return (
                  <div
                    key={field.id}
                    onClick={() => {
                      const el = document.getElementById(`field-overlay-${field.id}`);
                      if (el && typeof el.scrollIntoView === 'function') {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                      setHighlightedFieldId(field.id);
                      setTimeout(() => setHighlightedFieldId(null), 2500);
                    }}
                    className={`p-2.5 rounded-md text-xs flex items-center justify-between cursor-pointer transition-all border ${
                      isFilled
                        ? 'bg-ink-50 border-ink-200 text-ink-700 hover:bg-ink-100'
                        : 'bg-amber-50/60 border-amber-300 text-amber-900 hover:bg-amber-100 font-semibold'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-4 text-[11px] text-ink-400 font-mono">#{idx + 1}</span>
                      <span className="truncate">{field.label || field.type}</span>
                      {field.computedRequired && <span className="text-brand-600">*</span>}
                    </div>
                    {isFilled ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-verified-100 text-verified-800">
                        Done
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-900">
                        Pending
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Center Canvas Stage */}
        <main className="flex-1 overflow-auto bg-ink-100 flex justify-center p-4 sm:p-8 relative">
          <div
            ref={pageContainerRef}
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'top center',
              width: '800px',
              minHeight: '1100px',
            }}
            className="bg-white shadow-[0_4px_8px_-2px_rgb(16_24_40/0.06),0_12px_24px_-4px_rgb(16_24_40/0.08)] rounded-sm relative transition-transform duration-100 flex flex-col mb-auto select-none overflow-hidden border border-ink-200"
            data-testid="document-viewer-container"
          >
            {/* Document Content Layer */}
            {isMarkdown ? (
              <div
                className="p-12 prose prose-sm max-w-none text-ink-900 pointer-events-none"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdownToHtml(agreement.markdownContent || ''),
                }}
              />
            ) : effectivePdfUrl ? (
              <iframe
                src={`${effectivePdfUrl}#page=${currentPage}&toolbar=0&navpanes=0&scrollbar=0`}
                className="w-full h-full min-h-[1100px] border-none pointer-events-none flex-1 overflow-hidden"
                title="Document PDF Preview"
              />
            ) : isLoadingPdf ? (
              <div className="p-16 text-center text-ink-400 flex flex-col items-center justify-center min-h-[600px] space-y-3">
                <div className="w-8 h-8 border-2 border-ink-300 border-t-brand-600 rounded-full animate-spin" />
                <p className="text-xs font-semibold text-ink-600">Loading document…</p>
              </div>
            ) : (
              <div className="p-16 text-center text-ink-400 flex flex-col items-center justify-center min-h-[600px]">
                <FileText className="w-10 h-10 text-ink-400 mb-2" />
                <p className="text-xs font-semibold text-ink-600">{agreement.title}</p>
                {pdfFetchError && <p className="text-xs text-brand-600 mt-1">{pdfFetchError}</p>}
              </div>
            )}

            {/* Field Overlay Layer */}
            <div className="absolute inset-0 pointer-events-auto">
              {evaluatedFields
                .filter((f) => f.computedVisible)
                .map((field) => {
                  const isAssignedToMe = isFieldAssignedToMe(field.recipientId);
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
                      }}
                      className={`absolute rounded transition-all duration-150 flex flex-col justify-between overflow-visible ${
                        isAssignedToMe
                          ? isHighlighted
                            ? 'ring-4 ring-brand-500 border-2 border-brand-600 bg-brand-50/90 shadow-xl z-30'
                            : hasError
                              ? 'border-2 border-brand-500 bg-brand-50 shadow-md z-20 animate-pulse'
                              : value
                                ? 'border-2 border-verified-500 bg-white shadow-xs z-10'
                                : 'border-2 border-dashed border-amber-500 bg-amber-50/60 shadow-xs hover:border-solid hover:bg-amber-50 z-20'
                          : 'opacity-40 border border-dashed border-ink-300 bg-ink-100/50 pointer-events-none z-0'
                      }`}
                      data-testid={`field-container-${field.id}`}
                    >
                      {/* Header Badge */}
                      <div
                        className={`px-1.5 py-0.5 text-[10px] font-bold flex items-center justify-between shrink-0 leading-tight select-none shadow-2xs ${
                          isAssignedToMe
                            ? value
                              ? 'bg-verified-600 text-white'
                              : 'bg-amber-500 text-ink-900'
                            : 'bg-ink-400 text-white'
                        }`}
                      >
                        <div className="flex items-center gap-1 truncate">
                          <span className="truncate">{field.label || field.type}</span>
                          {field.computedRequired && (
                            <span className="text-brand-600 font-extrabold" title="Required">
                              *
                            </span>
                          )}
                        </div>
                        {!isAssignedToMe && (
                          <span className="text-[8px] opacity-80 uppercase ml-1">Other Signer</span>
                        )}
                      </div>

                      {/* Interactive Field Content Body */}
                      <div className="flex-1 bg-white/95 p-0.5 flex items-center justify-center text-center overflow-hidden">
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
                                  <img
                                    src={value}
                                    alt="Applied Signature"
                                    className="max-h-full max-w-full object-contain"
                                  />
                                ) : (
                                  <span className="font-serif italic text-sm text-ink-900 font-bold">
                                    {String(value)}
                                  </span>
                                )}
                                <span className="absolute bottom-0.5 right-1 text-[9px] text-ink-600 bg-white/90 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity font-bold shadow-2xs">
                                  Change
                                </span>
                              </div>
                            ) : isAssignedToMe ? (
                              <button
                                type="button"
                                onClick={() => handleSignatureFieldClick(field)}
                                className="w-full h-full bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold rounded flex items-center justify-center gap-1 transition-all cursor-pointer"
                                data-testid={`click-to-sign-${field.id}`}
                              >
                                <span>{adoptedSignature ? 'Apply' : 'Sign here'}</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-ink-400 italic">
                                Signature Area
                              </span>
                            )}
                          </div>
                        )}

                        {field.type === 'TEXT' && (
                          <input
                            type="text"
                            disabled={!isAssignedToMe}
                            placeholder={field.placeholder || 'Enter text…'}
                            value={typeof value === 'string' ? value : ''}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            className="w-full h-full text-xs font-medium px-1.5 bg-transparent border-0 focus:outline-none text-ink-900 text-center"
                            data-testid={`input-text-${field.id}`}
                          />
                        )}

                        {field.type === 'DATE' && (
                          <input
                            type="date"
                            disabled={!isAssignedToMe}
                            value={typeof value === 'string' ? value : ''}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            className="w-full h-full text-xs font-medium px-1 bg-transparent border-0 focus:outline-none text-ink-900 text-center"
                            data-testid={`input-date-${field.id}`}
                          />
                        )}

                        {field.type === 'EMAIL' && (
                          <input
                            type="email"
                            disabled={!isAssignedToMe}
                            placeholder="email@example.com"
                            value={typeof value === 'string' ? value : ''}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            className="w-full h-full text-xs font-medium px-1.5 bg-transparent border-0 focus:outline-none text-ink-900 text-center"
                            data-testid={`input-email-${field.id}`}
                          />
                        )}

                        {field.type === 'CHECKBOX' && (
                          <input
                            type="checkbox"
                            disabled={!isAssignedToMe}
                            checked={Boolean(value)}
                            onChange={(e) => handleInputChange(field.id, e.target.checked)}
                            className="w-4 h-4 text-brand-600 rounded cursor-pointer"
                            data-testid={`input-checkbox-${field.id}`}
                          />
                        )}

                        {field.type === 'DROPDOWN' && (
                          <select
                            disabled={!isAssignedToMe}
                            value={typeof value === 'string' ? value : ''}
                            onChange={(e) => handleInputChange(field.id, e.target.value)}
                            className="w-full h-full text-xs bg-transparent border-0 focus:outline-none text-ink-900 text-center"
                          >
                            <option value="">Select option…</option>
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

      {/* Signature Adoption Modal */}
      <SignatureModal
        isOpen={Boolean(activeSignatureFieldId)}
        fieldType={activeSignatureType}
        defaultSignerName={currentRecipient?.name || ''}
        onSave={handleSaveAdoptedSignature}
        onClose={() => setActiveSignatureFieldId(null)}
      />

      {/* Electronic Record & Signature Disclosure Consent Modal */}
      <ElectronicConsentModal
        isOpen={showConsentModal}
        documentTitle={agreement?.title || 'Agreement'}
        recipientName={currentRecipient?.name || 'Participant'}
        senderName={agreement?.senderName || 'Sender'}
        organisationName={agreement?.organisationName || 'Organization'}
        envelopeId={envelopeId}
        onAcceptConsent={handleAcceptConsent}
        onDecline={() => {
          setShowConsentModal(false);
          setShowDeclineModal(true);
        }}
      />

      {/* Decline Reason Modal */}
      {showDeclineModal && (
        <div className="fixed inset-0 z-50 bg-ink-950/55 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 text-ink-900 border border-ink-200">
            <h3 className="text-base font-bold text-brand-600">Decline this agreement?</h3>
            <p className="text-xs text-ink-500 leading-relaxed">
              Please provide an optional reason for declining to sign this agreement. This will be
              recorded in the tamper-evident audit trail and communicated to the sender.
            </p>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Enter reason for declining…"
              rows={3}
              className="w-full p-2.5 border border-ink-200 rounded-md text-xs focus:border-ink-900 focus:outline-none"
              data-testid="decline-reason-input"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setShowDeclineModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="md"
                onClick={handleDecline}
                isLoading={isDeclining}
                data-testid="confirm-decline-button"
              >
                Confirm Decline
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* B3: Signature Invitation Modal / Auth Gate */}
      {showAuthGate && !signedAsGuest && !isAuthenticated && (
        <div className="fixed inset-0 z-50 bg-ink-950/55 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-7 shadow-2xl space-y-5 text-ink-900 border border-ink-200 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 bg-brand-600 text-white rounded-lg flex items-center justify-center mx-auto text-lg font-bold shadow-xs">
              g
            </div>

            <div className="space-y-1">
              <Badge tone="brand" size="sm">
                Signature Invitation
              </Badge>
              <h2 className="text-xl font-bold text-ink-900 tracking-tight pt-1">Sign Document</h2>
              <p className="text-xs text-ink-500 leading-relaxed max-w-xs mx-auto">
                {orLabel(agreement?.senderName, 'The sender')} requested your signature on{' '}
                <strong className="text-ink-900 font-semibold">
                  &quot;{agreement?.title}&quot;
                </strong>
                .
              </p>
            </div>

            {/* Document Details Block */}
            <div className="bg-ink-50 border border-ink-200 rounded-md p-3.5 text-left text-xs space-y-1.5">
              <div className="flex justify-between items-center text-ink-500">
                <span>Document</span>
                <span className="font-semibold text-ink-900 truncate max-w-[200px]">
                  {agreement?.title}
                </span>
              </div>
              <div className="flex justify-between items-center text-ink-500">
                <span>Recipient</span>
                <span className="font-semibold text-ink-900">{currentRecipient?.email}</span>
              </div>
              <div className="flex justify-between items-center text-ink-500">
                <span>Envelope ID</span>
                <span className="font-mono text-[11px] text-ink-900 font-semibold">
                  {envelopeId}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <Button
                variant="primary"
                size="lg"
                className="w-full justify-center"
                onClick={() => {
                  setSignedAsGuest(true);
                  setShowAuthGate(false);
                  setShowConsentModal(true);
                }}
              >
                Sign as Guest (Email OTP Required)
              </Button>

              <Link
                href={`/login?returnTo=${encodeURIComponent(`/sign/${rawToken}`)}`}
                className="block w-full"
              >
                <Button variant="outline" size="md" className="w-full justify-center">
                  Log In with Existing Account
                </Button>
              </Link>
            </div>

            <p className="text-[11px] text-ink-400">
              Guest signers verify a 6-digit OTP code sent to their email ({currentRecipient?.email}
              ) upon signature confirmation.
            </p>
          </div>
        </div>
      )}

      {/* OTP Verification Modal */}
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
