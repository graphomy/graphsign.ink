'use client';

import { useState } from 'react';
import { KeyRound, Copy, Check, AlertTriangle, X } from 'lucide-react';

interface WebhookSecretDisplayModalProps {
  secret: string;
  subscriptionName: string;
  onClose: () => void;
  isRotated?: boolean;
}

export function WebhookSecretDisplayModal({
  secret,
  subscriptionName,
  onClose,
  isRotated,
}: WebhookSecretDisplayModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-slate-100 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">
              {isRotated ? 'Signing Secret Rotated' : 'Webhook Signing Secret'}
            </h2>
            <p className="text-xs text-slate-400">{subscriptionName}</p>
          </div>
        </div>

        <div className="bg-amber-950/30 border border-amber-500/30 rounded-lg p-3.5 flex items-start space-x-3 text-xs text-amber-200/90 leading-relaxed">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-300">Save this secret immediately.</span> For security reasons, it
            cannot be viewed again. Use it to verify HMAC-SHA256 signatures on the{' '}
            <code className="bg-amber-950 px-1 py-0.5 rounded text-amber-200">X-GraphSign-Signature</code> HTTP header.
            {isRotated && (
              <p className="mt-1 text-amber-300/80">
                A 24-hour dual-verification grace period is now active. Both previous and new secrets will sign deliveries.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">Secret Token (HMAC-SHA256)</label>
          <div className="flex items-center space-x-2">
            <div className="flex-1 bg-slate-950 px-3 py-2.5 rounded-lg border border-slate-800 font-mono text-xs text-emerald-400 select-all overflow-x-auto">
              {secret}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center space-x-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-200" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
          <div className="text-slate-300 font-sans font-semibold">Node.js Verification Snippet:</div>
          <div className="text-slate-500">const crypto = require(&apos;crypto&apos;);</div>
          <div>
            const signature = crypto.createHmac(&apos;sha256&apos;, SECRET).update(rawBody).digest(&apos;hex&apos;);
          </div>
          <div>const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(receivedSig));</div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg transition"
          >
            I have saved this secret
          </button>
        </div>
      </div>
    </div>
  );
}
