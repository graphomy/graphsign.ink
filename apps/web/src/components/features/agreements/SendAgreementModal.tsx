'use client';

import React, { useState } from 'react';
import { getApiUrl } from '@/lib/api';
import { parseCustomDate } from '@/lib/date-utils';

interface RecipientItem {
  id?: string;
  name: string;
  email: string;
  role: 'signer' | 'approver' | 'viewer';
  routingOrder?: number;
  color?: string;
}

interface SendAgreementModalProps {
  agreementId: string;
  agreementTitle: string;
  defaultRecipients?: RecipientItem[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
}

export function SendAgreementModal({
  agreementId,
  agreementTitle,
  defaultRecipients = [],
  onClose,
  onSuccess,
}: SendAgreementModalProps) {
  const [signingOrder, setSigningOrder] = useState<'PARALLEL' | 'SEQUENTIAL'>('PARALLEL');
  const [expiresAt, setExpiresAt] = useState('');
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState<RecipientItem[]>(() => {
    if (defaultRecipients && defaultRecipients.length > 0) {
      return defaultRecipients.map((r, idx) => ({
        ...r,
        email: r.email && !r.email.endsWith('@example.com') ? r.email : '',
        routingOrder: r.routingOrder || idx + 1,
      }));
    }
    return [
      {
        name: 'Signer 1',
        email: '',
        role: 'signer',
        routingOrder: 1,
        color: '#2563EB',
      },
    ];
  });

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAddRecipient() {
    const nextIdx = recipients.length + 1;
    setRecipients([
      ...recipients,
      {
        name: `Signer ${nextIdx}`,
        email: '',
        role: 'signer',
        routingOrder: nextIdx,
        color: '#059669',
      },
    ]);
  }

  function handleUpdateRecipient(index: number, updates: Partial<RecipientItem>) {
    setRecipients((prev) => prev.map((r, idx) => (idx === index ? { ...r, ...updates } : r)));
  }

  function handleRemoveRecipient(index: number) {
    if (recipients.length <= 1) {
      setError('At least one recipient is required.');
      return;
    }
    setRecipients((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validation
    for (const r of recipients) {
      if (!r.name.trim() || !r.email.trim()) {
        setError('All recipients must have a valid name and email address.');
        return;
      }
    }

    let parsedExpiresAt: string | null = null;
    if (expiresAt && expiresAt.trim()) {
      const parsedDate = parseCustomDate(expiresAt.trim());
      if (!parsedDate) {
        setError('Please enter a valid expiration date in dd-mmm-yyyy format (e.g., 25-Dec-2026).');
        return;
      }
      parsedExpiresAt = parsedDate.toISOString();
    }

    setIsSending(true);
    setError(null);

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/agreements/${agreementId}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          signingOrder,
          expiresAt: parsedExpiresAt,
          recipients: recipients.map((r) => ({
            name: r.name.trim(),
            email: r.email.trim(),
            role: r.role,
            routingOrder: signingOrder === 'SEQUENTIAL' ? Number(r.routingOrder || 1) : 1,
            color: r.color,
          })),
          message: message.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || data.message || 'Failed to send agreement.');
      }

      onSuccess(
        `Agreement "${agreementTitle}" sent to ${recipients.length} recipient(s) (${signingOrder} routing).`,
      );
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-neutral-900 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-neutral-900">Send Agreement for Signature</h2>
            <p className="text-xs text-neutral-500 truncate max-w-sm">{agreementTitle}</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Signing Order Selection (INK-91, INK-92) */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1.5">
              Signing Order Workflow
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSigningOrder('PARALLEL')}
                className={`p-3 rounded-xl border text-xs text-left transition-all ${
                  signingOrder === 'PARALLEL'
                    ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500'
                    : 'border-neutral-200 bg-white hover:bg-neutral-50'
                }`}
              >
                <div className="font-bold text-neutral-900 flex items-center gap-1.5">
                  <span>⚡ Parallel Order</span>
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">
                  All recipients receive invitations and can sign simultaneously.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSigningOrder('SEQUENTIAL')}
                className={`p-3 rounded-xl border text-xs text-left transition-all ${
                  signingOrder === 'SEQUENTIAL'
                    ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500'
                    : 'border-neutral-200 bg-white hover:bg-neutral-50'
                }`}
              >
                <div className="font-bold text-neutral-900 flex items-center gap-1.5">
                  <span>🔢 Sequential Order</span>
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">
                  Enforces step routing (Signer 1 finishes before Signer 2 is invited).
                </p>
              </button>
            </div>
          </div>

          {/* Recipients List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-neutral-700">
                Recipients &amp; Signers ({recipients.length})
              </label>
              <button
                type="button"
                onClick={handleAddRecipient}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
              >
                + Add Signer
              </button>
            </div>

            <div className="space-y-2.5 max-h-48 overflow-y-auto p-1">
              {recipients.map((r, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center gap-2 text-xs"
                >
                  {signingOrder === 'SEQUENTIAL' && (
                    <div className="w-14 shrink-0">
                      <label className="block text-[9px] font-bold text-neutral-500">Order</label>
                      <input
                        type="number"
                        min={1}
                        value={r.routingOrder || idx + 1}
                        onChange={(e) =>
                          handleUpdateRecipient(idx, { routingOrder: Number(e.target.value) })
                        }
                        className="w-full bg-white border border-neutral-300 rounded px-1.5 py-1 text-center font-bold"
                      />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      placeholder="Full Name"
                      value={r.name}
                      onChange={(e) => handleUpdateRecipient(idx, { name: e.target.value })}
                      required
                      className="w-full bg-white border border-neutral-300 rounded px-2 py-1 mb-1"
                    />
                    <input
                      type="email"
                      placeholder="signer@example.com"
                      value={r.email}
                      onChange={(e) => handleUpdateRecipient(idx, { email: e.target.value })}
                      required
                      className="w-full bg-white border border-neutral-300 rounded px-2 py-1"
                    />
                  </div>

                  <div className="shrink-0 flex flex-col gap-1 items-end">
                    <select
                      value={r.role}
                      onChange={(e) =>
                        handleUpdateRecipient(idx, {
                          role: e.target.value as 'signer' | 'approver' | 'viewer',
                        })
                      }
                      className="bg-white border border-neutral-300 rounded px-2 py-1 text-[11px]"
                    >
                      <option value="signer">Signer</option>
                      <option value="approver">Approver</option>
                      <option value="viewer">Viewer</option>
                    </select>

                    {recipients.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient(idx)}
                        className="text-red-500 hover:text-red-700 text-[11px] font-bold"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Expiration Date (INK-95) */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Expiration Date (Optional)
            </label>
            <input
              type="text"
              placeholder="dd-mmm-yyyy"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full bg-white border border-neutral-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#ba0000]"
            />
            <p className="text-[10px] text-neutral-400 mt-1">Format: dd-mmm-yyyy (e.g. 25-Dec-2026)</p>
          </div>

          {/* Custom Message */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Custom Email Note (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g., Please review and sign by end of week."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-white border border-neutral-300 rounded-lg p-2.5 text-xs focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="px-6 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm"
            >
              {isSending ? 'Dispatching Envelopes...' : 'Send for Signature 🚀'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
