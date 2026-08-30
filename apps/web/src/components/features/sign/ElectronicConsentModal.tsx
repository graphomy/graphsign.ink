'use client';

import React, { useState, useEffect, useRef } from 'react';
import { orDash } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  FileCheck,
  X,
  Printer,
  Download,
  ArrowRight,
  ChevronDown,
  Copy,
  CheckCheck,
} from 'lucide-react';

export interface ElectronicConsentModalProps {
  isOpen: boolean;
  documentTitle: string;
  recipientName: string;
  senderName: string;
  organisationName?: string;
  envelopeId?: string;
  onAcceptConsent: () => void | Promise<void>;
  onDecline: (reason?: string) => void | Promise<void>;
}

export function ElectronicConsentModal({
  isOpen,
  documentTitle,
  recipientName,
  senderName,
  organisationName,
  envelopeId = 'env_sec_disclosure',
  onAcceptConsent,
  onDecline,
}: ElectronicConsentModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [copiedEnvelope, setCopiedEnvelope] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Mount with scrollTop = 0
  useEffect(() => {
    if (isOpen) {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
        const isSmallOrJSDOM =
          scrollRef.current.scrollHeight <= scrollRef.current.clientHeight ||
          scrollRef.current.clientHeight === 0;
        setHasScrolledToBottom(isSmallOrJSDOM);
        setScrollProgress(isSmallOrJSDOM ? 100 : 0);
      } else {
        setHasScrolledToBottom(true);
      }
      setAgreed(false);
      setShowDeclineConfirm(false);
    }
  }, [isOpen]);

  // Handle escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showDeclineConfirm) {
          setShowDeclineConfirm(false);
        } else {
          setShowDeclineConfirm(true);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showDeclineConfirm]);

  if (!isOpen) return null;

  function handleScroll() {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll <= 0) {
      setScrollProgress(100);
      setHasScrolledToBottom(true);
      return;
    }
    const percent = Math.min(100, Math.round((scrollTop / maxScroll) * 100));
    setScrollProgress(percent);

    if (percent >= 95 && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
      setJustUnlocked(true);
      setTimeout(() => setJustUnlocked(false), 1200);
    }
  }

  function scrollToBottom() {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }

  function handleCopyEnvelope() {
    if (envelopeId) {
      navigator.clipboard.writeText(envelopeId);
      setCopiedEnvelope(true);
      setTimeout(() => setCopiedEnvelope(false), 2000);
    }
  }

  function handlePrint() {
    window.print();
  }

  function handleDownloadDisclosure() {
    const element = document.createElement('a');
    const file = new Blob([disclosureText], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'Electronic_Record_and_Signature_Disclosure.txt';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }

  async function handleConfirm() {
    if (!agreed || submitting || !hasScrolledToBottom) return;
    setSubmitting(true);
    try {
      await onAcceptConsent();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmDecline() {
    await onDecline(declineReason);
    setShowDeclineConfirm(false);
  }

  const senderDisplay = organisationName?.trim()
    ? `${senderName} (${organisationName.trim()})`
    : senderName;

  const disclosureText = `ELECTRONIC RECORD AND SIGNATURE DISCLOSURE
Document: ${documentTitle}
Sender: ${senderDisplay}
Recipient: ${recipientName}
Envelope ID: ${envelopeId}

1. Consent to Electronic Execution (ESIGN & eIDAS)
You agree that your electronic signature, whether drawn, typed, or uploaded, is the legal equivalent of your manual physical signature, carrying full legal validity and enforceability under the U.S. Electronic Signatures in Global and National Commerce Act (ESIGN), the Uniform Electronic Transactions Act (UETA), and EU Regulation 910/2014 (eIDAS).

2. Access and Hardware / Software Requirements
To view and sign documents electronically, you require a standard web browser (Chrome, Firefox, Safari, Edge) supporting TLS 1.3 encryption and JavaScript execution. You may download and retain electronic records as PDF files using any standard PDF viewer.

3. Right to Withdraw Consent
You have the right to withdraw your consent to conduct business electronically at any time prior to submitting your completed signature. If you choose to withdraw consent, the signing session will terminate, and the requesting party will be notified.

4. Copies and Record Retention
Upon completing execution, a cryptographically sealed PDF copy of the executed document, complete with an immutable SHA-256 audit trail certificate, will be made available for download and transmitted to your verified email address.`;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink-950/55 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-y-auto"
      data-testid="ersd-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ersd-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[88dvh] flex flex-col shadow-[0_8px_16px_-4px_rgb(16_24_40/0.08),0_24px_48px_-12px_rgb(16_24_40/0.16)] border border-ink-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-7 border-b border-ink-200 shrink-0 relative bg-white">
          <Badge tone="info" size="sm" leftIcon={<FileCheck className="w-3 h-3" />} className="mb-2">
            Compliance Disclosure
          </Badge>
          <h2 id="ersd-modal-title" className="text-xl font-bold text-ink-900 tracking-tight">
            Electronic Record &amp; Signature Disclosure
          </h2>
          <p className="text-[13px] text-ink-500 mt-1">
            Review and accept these terms to view and execute this agreement.
          </p>
          <button
            type="button"
            onClick={() => setShowDeclineConfirm(true)}
            className="absolute top-6 right-6 h-8 w-8 rounded-md text-ink-400 hover:text-ink-700 hover:bg-ink-100 flex items-center justify-center transition-colors"
            aria-label="Close disclosure"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Metadata Strip */}
        <div className="mx-7 mt-5 bg-ink-50 border border-ink-200 rounded-md p-4 shrink-0">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
            <div className="flex justify-between sm:block">
              <dt className="text-ink-500">Document</dt>
              <dd className="font-semibold text-ink-900 truncate" title={documentTitle}>
                {orDash(documentTitle)}
              </dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-ink-500">Sender</dt>
              <dd className="font-semibold text-ink-900 truncate" title={senderDisplay}>
                {orDash(senderDisplay)}
              </dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-ink-500">Recipient</dt>
              <dd className="font-semibold text-ink-900 truncate">{orDash(recipientName)}</dd>
            </div>
            <div className="flex justify-between sm:block">
              <dt className="text-ink-500">Envelope ID</dt>
              <dd className="font-mono text-xs font-semibold text-ink-900 flex items-center gap-1.5 tabular-nums">
                <span>{envelopeId}</span>
                <button
                  type="button"
                  onClick={handleCopyEnvelope}
                  className="text-ink-400 hover:text-ink-700 focus:outline-none"
                  title="Copy Envelope ID"
                >
                  {copiedEnvelope ? (
                    <CheckCheck className="w-3.5 h-3.5 text-verified-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </dd>
            </div>
          </dl>
        </div>

        {/* Scroll Region with Progress Bar */}
        <div className="flex-1 mx-7 mt-4 border border-ink-200 rounded-md relative flex flex-col min-h-[220px] overflow-hidden bg-white">
          {/* Progress bar pinned to top */}
          <div className="w-full bg-ink-100 h-0.5">
            <div
              className="bg-brand-600 h-0.5 transition-all duration-150"
              style={{ width: `${scrollProgress}%` }}
            />
          </div>

          {/* Fade Mask Top */}
          <div className="absolute top-0.5 inset-x-0 h-4 bg-gradient-to-b from-white to-transparent pointer-events-none z-10" />

          {/* Scrollable Content */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            tabIndex={0}
            className="flex-1 overflow-y-auto p-5 text-[15px] leading-[1.65] text-ink-700 max-w-[62ch] space-y-4 font-sans focus:outline-none"
            data-testid="ersd-disclosure-content"
          >
            <p>
              Please read this Electronic Record and Signature Disclosure (&quot;Disclosure&quot;)
              carefully. By checking the consent box below and clicking &quot;I consent — continue&quot;,
              you consent to receive electronic records and use electronic signatures in lieu of paper
              documents for this transaction.
            </p>

            <h3 className="font-bold text-ink-900 text-base mt-5">
              1. Consent to Electronic Execution (ESIGN &amp; eIDAS)
            </h3>
            <p>
              You agree that your electronic signature, whether drawn, typed, or uploaded, is the
              legal equivalent of your manual physical signature, carrying full legal validity and
              enforceability under the U.S. Electronic Signatures in Global and National Commerce Act
              (ESIGN Act, 15 U.S.C. § 7001 et seq.), the Uniform Electronic Transactions Act (UETA),
              and Regulation (EU) No 910/2014 (eIDAS).
            </p>

            <h3 className="font-bold text-ink-900 text-base mt-5">
              2. Hardware and Software Minimum Requirements
            </h3>
            <p>
              To access and retain electronic records, you must have an internet browser capable of
              128-bit or 256-bit TLS encryption, an active email account, and software capable of
              displaying Portable Document Format (PDF) files.
            </p>

            <h3 className="font-bold text-ink-900 text-base mt-5">
              3. Right to Withdraw Consent
            </h3>
            <p>
              You have the right to withdraw your consent to execute this agreement electronically at
              any time before finalizing your signature. If you decline or withdraw consent, the
              document will be voided and the initiating party will be notified immediately.
            </p>

            <h3 className="font-bold text-ink-900 text-base mt-5">
              4. Cryptographic Record Retention and Tamper Evidence
            </h3>
            <p>
              Following completion of all signing events, an immutable audit trail certificate
              bearing RFC 3161 timestamps, cryptographic SHA-256 hash chains, signer IP addresses,
              and verification telemetry is permanently embedded into the finalized PAdES document.
            </p>
          </div>

          {/* Fade Mask Bottom */}
          <div className="absolute bottom-0 inset-x-0 h-4 bg-gradient-to-t from-white to-transparent pointer-events-none z-10" />

          {/* Sticky Scroll to Bottom Pill Button */}
          {!hasScrolledToBottom && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-xs border border-ink-200 px-3 py-1 rounded-full text-xs font-medium text-ink-700 shadow-md flex items-center gap-1 hover:bg-ink-50 transition-all z-20"
            >
              <span>Scroll to bottom</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Consent Checkbox Row */}
        <div
          className={`mx-7 my-4 p-3 rounded-md transition-colors duration-200 flex items-start gap-3 ${
            justUnlocked ? 'bg-brand-50' : 'bg-transparent'
          }`}
        >
          <div className="relative flex items-center justify-center h-5 w-5 mt-0.5 shrink-0">
            <input
              id="ersd-consent-checkbox"
              type="checkbox"
              disabled={!hasScrolledToBottom}
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="h-5 w-5 rounded border border-ink-300 text-brand-600 focus:ring-2 focus:ring-ink-950 focus:ring-offset-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              data-testid="ersd-checkbox"
            />
          </div>
          <label
            htmlFor="ersd-consent-checkbox"
            className={`text-sm leading-relaxed select-none cursor-pointer ${
              !hasScrolledToBottom ? 'text-ink-400 cursor-not-allowed' : 'text-ink-700'
            }`}
            title={!hasScrolledToBottom ? 'Scroll to the end of the disclosure to continue' : undefined}
          >
            I have read and agree to the{' '}
            <strong className="text-ink-900 font-semibold">
              Electronic Record and Signature Disclosure
            </strong>
            , and I consent to conduct this transaction electronically.
          </label>
        </div>

        {/* Aria live alert when unlocked */}
        <div className="sr-only" aria-live="polite">
          {hasScrolledToBottom ? 'You have reached the end of the disclosure. Consent checkbox is now enabled.' : ''}
        </div>

        {/* Footer */}
        <div className="p-5 px-7 border-t border-ink-200 bg-ink-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leftIcon={<X className="w-3.5 h-3.5" />}
              onClick={() => {
                onDecline();
                setShowDeclineConfirm(true);
              }}
              data-testid="ersd-decline-button"
            >
              Decline
            </Button>
            <button
              type="button"
              onClick={handlePrint}
              className="p-1.5 rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors"
              title="Print Disclosure"
              aria-label="Print Disclosure"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleDownloadDisclosure}
              className="p-1.5 rounded text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors"
              title="Download Disclosure"
              aria-label="Download Disclosure"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <Button
            type="button"
            variant="primary"
            size="md"
            rightIcon={<ArrowRight className="w-4 h-4" />}
            disabled={!agreed || !hasScrolledToBottom}
            isLoading={submitting}
            onClick={handleConfirm}
            data-testid="ersd-accept-button"
          >
            I consent — continue
          </Button>
        </div>
      </div>

      {/* Decline Confirmation Dialog */}
      {showDeclineConfirm && (
        <div className="fixed inset-0 z-60 bg-ink-950/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-ink-200 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-lg font-bold text-ink-900">Decline this agreement?</h2>
            <p className="text-sm text-ink-700 leading-relaxed">
              If you decline, the document will be permanently voided and the sender will be
              notified of your decision.
            </p>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink-700">
                Reason for declining (Optional):
              </label>
              <textarea
                rows={3}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Let the sender know why you are declining..."
                className="w-full text-xs border border-ink-200 rounded-md p-2.5 bg-white text-ink-900 focus:border-ink-900 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={() => setShowDeclineConfirm(false)}
              >
                Go back
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="md"
                onClick={handleConfirmDecline}
              >
                Decline agreement
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
