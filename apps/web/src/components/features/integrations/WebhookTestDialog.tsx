'use client';

import React, { useState } from 'react';
import { Send, CheckCircle2, XCircle, Clock, AlertCircle, Loader2, X } from 'lucide-react';
import { getApiUrl } from '@/lib/api';

interface WebhookTestDialogProps {
  subscriptionId: string;
  subscriptionName: string;
  targetUrl: string;
  onClose: () => void;
}

const TEST_EVENT_TYPES = [
  'document.created',
  'document.sent',
  'document.signed',
  'document.completed',
  'document.declined',
  'document.voided',
];

export function WebhookTestDialog({
  subscriptionId,
  subscriptionName,
  targetUrl,
  onClose,
}: WebhookTestDialogProps) {
  const [selectedEvent, setSelectedEvent] = useState('document.completed');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    statusCode?: number;
    durationMs?: number;
    responseSnippet?: string;
    deliveryId?: string;
    error?: string;
  } | null>(null);

  const handleTestDispatch = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const token =
        localStorage.getItem('graphsign_session_token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('access_token') ||
        sessionStorage.getItem('access_token') ||
        '';
      const res = await fetch(`${getApiUrl()}/api/v1/webhooks/${subscriptionId}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          eventType: selectedEvent,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to trigger test dispatch');
      }

      setResult({
        success: data.success,
        statusCode: data.statusCode,
        durationMs: data.durationMs,
        responseSnippet: data.responseSnippet,
        deliveryId: data.deliveryId,
        error: data.error,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network failure dispatching test';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-5 text-slate-100 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
            <Send className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Test Webhook Delivery</h2>
            <p className="text-xs text-slate-400 truncate max-w-md">
              {subscriptionName} &bull;{' '}
              <span className="font-mono text-slate-300">{targetUrl}</span>
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-medium text-slate-300">Select Test Event Type</label>
          <div className="flex space-x-2">
            <select
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
              disabled={isLoading}
              className="flex-1 px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            >
              {TEST_EVENT_TYPES.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleTestDispatch}
              disabled={isLoading}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>{isLoading ? 'Dispatching...' : 'Send Test'}</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            A synthetic event payload will be HMAC-signed and sent immediately to your receiver URL
            with <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-300">test: true</code>
            .
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-lg flex items-center space-x-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="space-y-3 p-4 bg-slate-950 rounded-lg border border-slate-800 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {result.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-rose-400" />
                )}
                <span className="text-sm font-semibold text-slate-200">
                  {result.success ? 'Delivery Succeeded' : 'Delivery Failed'}
                </span>
              </div>

              <div className="flex items-center space-x-2 font-mono text-xs">
                {result.statusCode && (
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      result.statusCode >= 200 && result.statusCode < 300
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    HTTP {result.statusCode}
                  </span>
                )}
                {result.durationMs !== undefined && (
                  <span className="inline-flex items-center text-slate-400">
                    <Clock className="w-3.5 h-3.5 mr-1" />
                    {result.durationMs}ms
                  </span>
                )}
              </div>
            </div>

            {result.error && (
              <div className="text-xs text-rose-400 font-mono bg-rose-950/20 p-2.5 rounded border border-rose-900/40">
                {result.error}
              </div>
            )}

            {result.responseSnippet && (
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-slate-400">
                  Receiver Response Snippet:
                </div>
                <pre className="text-xs font-mono bg-slate-900 p-2.5 rounded text-slate-300 max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {result.responseSnippet}
                </pre>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
