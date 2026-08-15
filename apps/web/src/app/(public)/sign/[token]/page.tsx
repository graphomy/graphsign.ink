'use client';

import React, { useState, useEffect, useRef, useMemo, use } from 'react';

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

function getApiUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:8787';
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agreement, setAgreement] = useState<AgreementDetails | null>(null);
  const [currentRecipient, setCurrentRecipient] = useState<RecipientInfo | null>(null);
  const [allRecipients, setAllRecipients] = useState<RecipientInfo[]>([]);
  const [isTurn, setIsTurn] = useState<boolean>(true);

  // Signer Form State
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean | number>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  // Decline State
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [isDeclining, setIsDeclining] = useState(false);
  const [isDeclined, setIsDeclined] = useState(false);

  // Signature Capture Modal
  const [activeSignatureFieldId, setActiveSignatureFieldId] = useState<string | null>(null);
  const [signatureTab, setSignatureTab] = useState<'draw' | 'type'>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

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
        setAllRecipients(data.data.allRecipients || []);
        setIsTurn(data.data.isTurn !== false);

        if (data.data.recipient.status === 'SIGNED' || data.data.agreement.status === 'COMPLETED') {
          setIsCompleted(true);
        } else if (data.data.recipient.status === 'DECLINED') {
          setIsDeclined(true);
        } else {
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

  // INK-96: Conditional Logic Evaluation Engine
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

  // Canvas Drawing Handlers
  function startDrawing(
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX || 0 : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY || 0 : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX || 0 : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY || 0 : e.clientY;

    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1E3A8A'; // Dark blue signature ink
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  }

  function stopDrawing() {
    setIsDrawing(false);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function handleSaveSignature() {
    if (!activeSignatureFieldId) return;

    if (signatureTab === 'draw') {
      const canvas = canvasRef.current;
      if (canvas) {
        const dataUrl = canvas.toDataURL('image/png');
        setFieldValues((prev) => ({ ...prev, [activeSignatureFieldId]: dataUrl }));
      }
    } else {
      if (typedSignature.trim()) {
        setFieldValues((prev) => ({ ...prev, [activeSignatureFieldId]: typedSignature.trim() }));
      }
    }
    setActiveSignatureFieldId(null);
  }

  // Input Change & Validation
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

  // Validate all assigned required fields
  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    const assignedFields = evaluatedFields.filter(
      (f) => f.recipientId === currentRecipient?.id && f.computedVisible,
    );

    for (const field of assignedFields) {
      const val = fieldValues[field.id];
      if (field.computedRequired && (val === undefined || val === '' || val === false)) {
        errors[field.id] = `${field.label || 'This field'} is required.`;
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
      errors['consent'] = 'You must agree to use electronic records and signatures.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Submit Signature & Fields
  async function handleSubmit() {
    if (!validateForm()) return;
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
              typeof primarySigVal === 'string' && primarySigVal.startsWith('data:')
                ? 'DRAWN'
                : 'TYPED',
            data: String(primarySigVal || currentRecipient?.name || 'Signed'),
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

  // Decline Signing
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

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
        <div className="text-center text-white space-y-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-neutral-300">
            Loading secure agreement portal...
          </p>
        </div>
      </div>
    );
  }

  if (error || !agreement) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center text-white shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-red-950/60 text-red-400 border border-red-800 flex items-center justify-center text-2xl mx-auto mb-4">
            ⚠️
          </div>
          <h1 className="text-lg font-bold mb-2">Unable to Access Agreement</h1>
          <p className="text-xs text-neutral-400 mb-6">
            {error || 'This link may have expired or was cancelled.'}
          </p>
        </div>
      </div>
    );
  }

  if (isDeclined) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center text-white shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-amber-950/60 text-amber-400 border border-amber-800 flex items-center justify-center text-2xl mx-auto mb-4">
            🛑
          </div>
          <h1 className="text-lg font-bold mb-2">Document Signing Declined</h1>
          <p className="text-xs text-neutral-400 mb-4">
            You have declined to sign &quot;{agreement.title}&quot;.
          </p>
          <p className="text-[11px] text-neutral-500">
            The document author ({agreement.senderName}) has been notified.
          </p>
        </div>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center text-white shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800 flex items-center justify-center text-2xl mx-auto mb-4">
            ✓
          </div>
          <h1 className="text-lg font-bold mb-2">Signing Completed!</h1>
          <p className="text-xs text-neutral-400 mb-6">
            Thank you, <strong>{currentRecipient?.name}</strong>. Your signature and inputs have
            been recorded in the immutable audit trail.
          </p>
          <div className="p-3 bg-neutral-800/80 rounded-lg text-left text-xs space-y-1 mb-6 border border-neutral-700">
            <div className="flex justify-between text-neutral-400">
              <span>Document:</span>
              <span className="font-semibold text-white">{agreement.title}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Organization:</span>
              <span className="font-semibold text-white">{agreement.organisationName}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-900 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="h-14 bg-white border-b border-neutral-200 px-4 md:px-8 flex items-center justify-between shadow-xs sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-black text-sm flex items-center justify-center shrink-0">
            G
          </div>
          <div className="truncate">
            <h1 className="text-sm font-bold text-neutral-900 truncate">{agreement.title}</h1>
            <p className="text-[10px] text-neutral-500">
              Sent by {agreement.senderName} ({agreement.organisationName})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDeclineModal(true)}
            className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg border border-red-200 transition-colors"
          >
            Decline
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !isTurn}
            className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
          >
            {isSubmitting ? 'Submitting...' : 'Finish & Sign ✓'}
          </button>
        </div>
      </header>

      {/* Sequential Turn Warning Banner */}
      {!isTurn && (
        <div className="bg-amber-500 text-neutral-950 text-xs font-bold py-2 px-4 text-center">
          ⏳ It is not your turn yet in sequential signing order. Preceding signers are completing
          their steps.
        </div>
      )}

      {/* Main Signing Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 flex flex-col gap-6">
        {/* Signer Welcome Card */}
        <div className="bg-white border border-neutral-200 rounded-xl p-4 md:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
              Signing As
            </span>
            <h2 className="text-base font-bold text-neutral-900">
              {currentRecipient?.name} ({currentRecipient?.email})
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Please review the document below and complete the highlighted signature fields.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-neutral-600 bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-lg">
            <span>Participants:</span>
            <div className="flex -space-x-1.5">
              {allRecipients.map((r) => (
                <div
                  key={r.id}
                  title={`${r.name} (${r.status})`}
                  style={{ backgroundColor: r.color || '#2563EB' }}
                  className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-xs"
                >
                  {r.name.charAt(0)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Document Canvas Container */}
        <div className="bg-white border border-neutral-200 rounded-xl shadow-md p-6 md:p-12 relative min-h-[750px] overflow-hidden">
          {/* Document Content */}
          <div className="prose prose-sm max-w-none text-neutral-800 leading-relaxed">
            {agreement.markdownContent ? (
              <div className="whitespace-pre-wrap font-serif text-sm">
                {agreement.markdownContent}
              </div>
            ) : (
              <div className="p-8 text-center text-neutral-400">
                <p className="font-bold text-sm text-neutral-700">
                  {agreement.fileName || 'Uploaded Agreement Document'}
                </p>
                <p className="text-xs mt-1">
                  Please complete the required fields placed on the document envelope below.
                </p>
              </div>
            )}
          </div>

          {/* Interactive Field Overlays (INK-78 to INK-85 & INK-96) */}
          <div className="mt-8 pt-8 border-t border-neutral-200 grid grid-cols-1 md:grid-cols-2 gap-4">
            {evaluatedFields
              .filter((f) => f.computedVisible)
              .map((field) => {
                const isAssignedToMe = field.recipientId === currentRecipient?.id;
                const value = fieldValues[field.id];
                const hasError = !!formErrors[field.id];

                return (
                  <div
                    key={field.id}
                    className={`p-3 rounded-lg border transition-all ${
                      isAssignedToMe
                        ? hasError
                          ? 'border-red-500 bg-red-50/50'
                          : 'border-blue-300 bg-blue-50/30'
                        : 'border-neutral-200 bg-neutral-50 opacity-60 pointer-events-none'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-neutral-800 flex items-center gap-1">
                        <span>{field.label || field.type}</span>
                        {field.computedRequired && (
                          <span className="text-red-500 font-black">*</span>
                        )}
                      </label>
                      {!isAssignedToMe && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600">
                          Other Signer
                        </span>
                      )}
                    </div>

                    {/* Signature Field */}
                    {(field.type === 'SIGNATURE' || field.type === 'INITIALS') && (
                      <div>
                        {value ? (
                          <div
                            onClick={() => isAssignedToMe && setActiveSignatureFieldId(field.id)}
                            className="h-16 bg-white border border-blue-400 rounded-lg flex items-center justify-center p-2 cursor-pointer hover:border-blue-600"
                          >
                            {typeof value === 'string' && value.startsWith('data:') ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={value}
                                alt="Signature"
                                className="max-h-full object-contain"
                              />
                            ) : (
                              <span className="font-serif italic text-lg text-blue-900">
                                {String(value)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => isAssignedToMe && setActiveSignatureFieldId(field.id)}
                            className="w-full h-14 bg-white border-2 border-dashed border-blue-400 hover:border-blue-600 rounded-lg text-xs font-bold text-blue-600 flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                          >
                            ✍️ Click to Sign
                          </button>
                        )}
                      </div>
                    )}

                    {/* Text Field */}
                    {field.type === 'TEXT' && (
                      <input
                        type="text"
                        placeholder={field.placeholder || 'Enter text...'}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full bg-white border border-neutral-300 rounded px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-blue-500"
                      />
                    )}

                    {/* Date Field */}
                    {field.type === 'DATE' && (
                      <input
                        type="date"
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full bg-white border border-neutral-300 rounded px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-blue-500"
                      />
                    )}

                    {/* Email Field */}
                    {field.type === 'EMAIL' && (
                      <input
                        type="email"
                        placeholder="signer@example.com"
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full bg-white border border-neutral-300 rounded px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-blue-500"
                      />
                    )}

                    {/* Company Field */}
                    {field.type === 'COMPANY' && (
                      <input
                        type="text"
                        placeholder="Company name..."
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full bg-white border border-neutral-300 rounded px-2.5 py-1.5 text-xs text-neutral-900 focus:outline-none focus:border-blue-500"
                      />
                    )}

                    {/* Checkbox Field */}
                    {field.type === 'CHECKBOX' && (
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <input
                          type="checkbox"
                          checked={!!value}
                          onChange={(e) => handleInputChange(field.id, e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-xs text-neutral-700">{field.label}</span>
                      </label>
                    )}

                    {/* Radio Group Field */}
                    {field.type === 'RADIO' && (
                      <div className="space-y-1 py-1">
                        {field.options?.map((opt) => (
                          <label
                            key={opt.value}
                            className="flex items-center gap-2 cursor-pointer text-xs"
                          >
                            <input
                              type="radio"
                              name={field.groupName || field.id}
                              value={opt.value}
                              checked={value === opt.value}
                              onChange={(e) => handleInputChange(field.id, e.target.value)}
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Dropdown Field */}
                    {field.type === 'DROPDOWN' && (
                      <select
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                        className="w-full bg-white border border-neutral-300 rounded px-2 py-1.5 text-xs text-neutral-900"
                      >
                        <option value="">Select option...</option>
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}

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

        {/* Electronic Consent Disclosure (FR-008.003) */}
        <div className="bg-white border border-neutral-200 rounded-xl p-4 md:p-6 shadow-xs">
          <label className="flex items-start gap-3 cursor-pointer">
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
              className="mt-0.5 w-4 h-4 text-blue-600 rounded"
            />
            <div className="text-xs text-neutral-600 leading-relaxed">
              <span className="font-bold text-neutral-900">
                Electronic Record and Signature Disclosure:{' '}
              </span>
              I agree to use electronic records and signatures for this document. I acknowledge that
              my electronic signature constitutes a legally binding execution under applicable laws
              (ESIGN &amp; eIDAS).
            </div>
          </label>
          {formErrors['consent'] && (
            <p className="text-[11px] text-red-600 font-bold mt-2 ml-7">{formErrors['consent']}</p>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="flex justify-end gap-3 pb-12">
          <button
            onClick={() => setShowDeclineModal(true)}
            className="px-4 py-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-lg hover:bg-neutral-100"
          >
            Decline Agreement
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !isTurn}
            className="px-6 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm"
          >
            {isSubmitting ? 'Recording Signature...' : 'Complete & Sign Document ✓'}
          </button>
        </div>
      </main>

      {/* Signature Capture Modal (Draw vs Type) */}
      {activeSignatureFieldId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-neutral-900">Adopt Your Signature</h3>
              <button
                onClick={() => setActiveSignatureFieldId(null)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            {/* Tab selection */}
            <div className="flex border-b border-neutral-200 text-xs font-bold">
              <button
                onClick={() => setSignatureTab('draw')}
                className={`py-2 px-4 border-b-2 transition-colors ${
                  signatureTab === 'draw'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-neutral-500'
                }`}
              >
                ✏️ Draw
              </button>
              <button
                onClick={() => setSignatureTab('type')}
                className={`py-2 px-4 border-b-2 transition-colors ${
                  signatureTab === 'type'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-neutral-500'
                }`}
              >
                ⌨️ Type
              </button>
            </div>

            {/* Draw Tab */}
            {signatureTab === 'draw' && (
              <div className="space-y-2">
                <div className="border border-neutral-300 rounded-xl overflow-hidden bg-neutral-50 touch-none">
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={160}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-40 bg-white cursor-crosshair"
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-neutral-400">
                  <span>Draw your signature above</span>
                  <button onClick={clearCanvas} className="text-blue-600 font-bold hover:underline">
                    Clear Canvas
                  </button>
                </div>
              </div>
            )}

            {/* Type Tab */}
            {signatureTab === 'type' && (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Type your full name..."
                  value={typedSignature}
                  onChange={(e) => setTypedSignature(e.target.value)}
                  className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
                />
                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl text-center min-h-[90px] flex items-center justify-center font-serif italic text-2xl text-blue-900">
                  {typedSignature || currentRecipient?.name || 'Your Signature'}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setActiveSignatureFieldId(null)}
                className="px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSignature}
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Adopt & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Reason Modal */}
      {showDeclineModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-neutral-900">Decline to Sign</h3>
            <p className="text-xs text-neutral-600">
              Please state why you are declining this agreement. The sender will be notified
              immediately.
            </p>
            <textarea
              rows={3}
              placeholder="Provide a reason for declining..."
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              className="w-full bg-white border border-neutral-300 rounded-lg p-2.5 text-xs text-neutral-900 focus:outline-none focus:border-red-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeclineModal(false)}
                className="px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDecline}
                disabled={isDeclining || !declineReason.trim()}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg"
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
