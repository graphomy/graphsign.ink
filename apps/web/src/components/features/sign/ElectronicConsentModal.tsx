'use client';

import React, { useState } from 'react';

export interface ElectronicConsentModalProps {
  isOpen: boolean;
  documentTitle: string;
  recipientName: string;
  senderName: string;
  organisationName: string;
  onAcceptConsent: () => void | Promise<void>;
  onDecline: () => void;
}

export function ElectronicConsentModal({
  isOpen,
  documentTitle,
  recipientName,
  senderName,
  organisationName,
  onAcceptConsent,
  onDecline,
}: ElectronicConsentModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  async function handleConfirm() {
    if (!agreed || submitting) return;
    setSubmitting(true);
    try {
      await onAcceptConsent();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      data-testid="ersd-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ersd-modal-title"
    >
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-8 shadow-2xl space-y-5 border border-neutral-200 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-neutral-100 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold uppercase tracking-wider mb-1.5 border border-blue-200">
              <span>⚖️</span> Compliance Disclosure
            </div>
            <h2 id="ersd-modal-title" className="text-lg font-bold text-neutral-900">
              Electronic Record &amp; Signature Disclosure
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Review and accept the disclosure terms to view and execute this agreement.
            </p>
          </div>
        </div>

        {/* Document Context Card */}
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 text-xs text-neutral-700 space-y-1">
          <div className="flex justify-between">
            <span className="text-neutral-500">Document:</span>
            <span className="font-semibold text-neutral-900">{documentTitle}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Sender:</span>
            <span className="font-semibold text-neutral-900">
              {senderName} ({organisationName})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Recipient:</span>
            <span className="font-semibold text-neutral-900">{recipientName}</span>
          </div>
        </div>

        {/* Scrollable Legal Disclosure Body */}
        <div
          tabIndex={0}
          className="max-h-56 overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 text-xs text-neutral-700 leading-relaxed space-y-3 font-sans focus:outline-none focus:ring-1 focus:ring-blue-500"
          data-testid="ersd-disclosure-content"
        >
          <p>
            Please read this Electronic Record and Signature Disclosure (&quot;Disclosure&quot;)
            carefully. By checking the consent box below and clicking &quot;I Consent &amp;
            Continue&quot;, you consent to receive electronic records and use electronic signatures
            in lieu of paper documents for this transaction.
          </p>

          <h4 className="font-bold text-neutral-900 text-xs">
            1. Consent to Electronic Execution (ESIGN &amp; eIDAS)
          </h4>
          <p>
            You agree that your electronic signature, whether drawn, typed, or uploaded, is the
            legal equivalent of your manual physical signature, carrying full legal validity and
            enforceability under the U.S. Electronic Signatures in Global and National Commerce Act
            (ESIGN), the Uniform Electronic Transactions Act (UETA), and European Regulation (EU) No
            910/2014 (eIDAS).
          </p>

          <h4 className="font-bold text-neutral-900 text-xs">2. Access and Retention</h4>
          <p>
            To access and retain electronic records, you must have a supported web browser (Chrome,
            Firefox, Safari, Edge), an active internet connection, and the ability to download or
            print PDF records for your files.
          </p>

          <h4 className="font-bold text-neutral-900 text-xs">3. Right to Withdraw Consent</h4>
          <p>
            You have the right to withdraw your consent prior to completion by clicking
            &quot;Decline Agreement&quot;. If you decline or withdraw consent, this electronic
            document will be voided and the sender will be notified to arrange alternative
            paper-based execution if applicable.
          </p>

          <h4 className="font-bold text-neutral-900 text-xs">4. Immutable Audit Trail</h4>
          <p>
            You acknowledge that signing timestamps, IP addresses, user agent identifiers, and
            signature coordinates are recorded in an immutable cryptographic audit log associated
            with this transaction.
          </p>
        </div>

        {/* Mandatory Agreement Checkbox */}
        <div className="pt-2">
          <label className="flex items-start gap-3 cursor-pointer select-none group">
            <input
              type="checkbox"
              id="ersd-consent-checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-blue-600 rounded border-neutral-300 focus:ring-blue-500 cursor-pointer"
              data-testid="ersd-checkbox"
            />
            <span className="text-xs text-neutral-800 leading-normal">
              I confirm that I have read and agree to the{' '}
              <strong className="text-neutral-900">
                Electronic Record and Signature Disclosure
              </strong>
              , and I consent to conduct this transaction electronically.
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-neutral-100 gap-3">
          <button
            type="button"
            onClick={onDecline}
            className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
            data-testid="ersd-decline-button"
          >
            Decline &amp; Exit
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!agreed || submitting}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5"
            data-testid="ersd-accept-button"
          >
            {submitting ? 'Recording Consent...' : 'I Consent & Continue →'}
          </button>
        </div>
      </div>
    </div>
  );
}
