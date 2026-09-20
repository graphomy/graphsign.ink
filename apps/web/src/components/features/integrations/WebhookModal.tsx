'use client';

import { useState } from 'react';
import { X, Globe, Plus, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { WebhookFilterBuilder } from './WebhookFilterBuilder';
import { WebhookPayloadPicker, type PayloadProjectionConfig } from './WebhookPayloadPicker';
import { getApiUrl } from '@/lib/api';

export interface WebhookSubscription {
  id: string;
  name: string;
  description?: string | null;
  targetUrl: string;
  status: 'active' | 'disabled';
  eventTypes: string[];
  filterRules?: Record<string, unknown> | null;
  payloadProjection?: PayloadProjectionConfig | null;
  rateLimitPerMinute: number;
  customHeaders?: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

interface WebhookModalProps {
  subscription?: WebhookSubscription | null;
  onClose: () => void;
  onSuccess: (saved: WebhookSubscription, secret?: string) => void;
}

const ALL_EVENT_OPTIONS = [
  { id: 'document.created', label: 'document.created', desc: 'Draft or binary document uploaded' },
  { id: 'document.updated', label: 'document.updated', desc: 'Draft or metadata modified' },
  { id: 'document.deleted', label: 'document.deleted', desc: 'Document soft-deleted' },
  { id: 'document.sent', label: 'document.sent', desc: 'Agreement sent to participants' },
  { id: 'document.viewed', label: 'document.viewed', desc: 'Recipient viewed document link' },
  {
    id: 'document.signed',
    label: 'document.signed',
    desc: 'Recipient successfully submitted signature',
  },
  {
    id: 'document.completed',
    label: 'document.completed',
    desc: 'All recipients signed and PAdES seal finished',
  },
  {
    id: 'document.declined',
    label: 'document.declined',
    desc: 'Recipient formally declined signature',
  },
  { id: 'document.voided', label: 'document.voided', desc: 'Agreement cancelled or voided' },
];

export function WebhookModal({ subscription, onClose, onSuccess }: WebhookModalProps) {
  const isEditing = Boolean(subscription);

  const [name, setName] = useState(subscription?.name || '');
  const [description, setDescription] = useState(subscription?.description || '');
  const [targetUrl, setTargetUrl] = useState(subscription?.targetUrl || '');
  const [status, setStatus] = useState<'active' | 'disabled'>(subscription?.status || 'active');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(
    subscription?.eventTypes || ['document.completed'],
  );
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState<number>(
    subscription?.rateLimitPerMinute || 10,
  );
  const [filterRules, setFilterRules] = useState<Record<string, unknown> | undefined>(
    (subscription?.filterRules as Record<string, unknown>) || undefined,
  );
  const [payloadProjection, setPayloadProjection] = useState<PayloadProjectionConfig>(
    subscription?.payloadProjection || { mode: 'ALL' },
  );

  // Custom headers state
  const [headersList, setHeadersList] = useState<{ key: string; value: string }[]>(() => {
    if (!subscription?.customHeaders) return [];
    return Object.entries(subscription.customHeaders).map(([key, value]) => ({ key, value }));
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggleEvent = (id: string) => {
    if (selectedEvents.includes(id)) {
      setSelectedEvents(selectedEvents.filter((e) => e !== id));
    } else {
      setSelectedEvents([...selectedEvents, id]);
    }
  };

  const handleSelectAllEvents = () => {
    if (selectedEvents.length === ALL_EVENT_OPTIONS.length) {
      setSelectedEvents([]);
    } else {
      setSelectedEvents(ALL_EVENT_OPTIONS.map((e) => e.id));
    }
  };

  const handleAddHeader = () => {
    setHeadersList([...headersList, { key: '', value: '' }]);
  };

  const handleHeaderChange = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...headersList];
    updated[index]![field] = val;
    setHeadersList(updated);
  };

  const handleRemoveHeader = (index: number) => {
    setHeadersList(headersList.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Basic URL validation
    if (!targetUrl.startsWith('https://') && !targetUrl.startsWith('http://localhost')) {
      setError('Target URL must use HTTPS (unless testing on localhost).');
      setIsLoading(false);
      return;
    }

    if (selectedEvents.length === 0) {
      setError('At least one event type must be selected.');
      setIsLoading(false);
      return;
    }

    // Build customHeaders record
    const headersRecord: Record<string, string> = {};
    for (const h of headersList) {
      if (h.key.trim()) {
        headersRecord[h.key.trim()] = h.value;
      }
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      targetUrl: targetUrl.trim(),
      status,
      eventTypes: selectedEvents,
      rateLimitPerMinute,
      customHeaders: Object.keys(headersRecord).length > 0 ? headersRecord : undefined,
      filterRules: filterRules && Object.keys(filterRules).length > 0 ? filterRules : undefined,
      payloadProjection,
    };

    try {
      const token =
        localStorage.getItem('graphsign_session_token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('access_token') ||
        sessionStorage.getItem('access_token') ||
        '';
      const url = isEditing
        ? `${getApiUrl()}/api/v1/webhooks/${subscription!.id}`
        : `${getApiUrl()}/api/v1/webhooks`;
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to save webhook subscription');
      }

      onSuccess(data.subscription || data, data.secret);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error saving subscription';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-6 text-slate-100 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold">
              {isEditing ? 'Edit Webhook Subscription' : 'Create Webhook Subscription'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Receive signed, real-time HTTP event notifications with automatic exponential retry
              and DLQ routing.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-lg flex items-center space-x-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-200">
                Subscription Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Production ERP Webhook"
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-200">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'disabled')}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="active">Active (Receives Events)</option>
                <option value="disabled">Disabled (Suspended)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
              <span>
                Target HTTPS URL <span className="text-rose-400">*</span>
              </span>
              <span className="text-[11px] text-slate-400 font-normal">
                Disallows private IP addresses (SSRF protected)
              </span>
            </label>
            <div className="relative">
              <Globe className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="url"
                required
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://api.yourdomain.com/webhooks/graphsign"
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-200">Description (Optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Syncs signed agreements to Salesforce"
              className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Subscribed Event Types */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200">
                Subscribed Event Types <span className="text-rose-400">*</span>
              </label>
              <button
                type="button"
                onClick={handleSelectAllEvents}
                className="text-xs text-emerald-400 hover:text-emerald-300 transition"
              >
                {selectedEvents.length === ALL_EVENT_OPTIONS.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {ALL_EVENT_OPTIONS.map((ev) => {
                const checked = selectedEvents.includes(ev.id);
                return (
                  <label
                    key={ev.id}
                    className={`flex items-start space-x-2.5 p-2 rounded-lg border text-xs cursor-pointer transition ${
                      checked
                        ? 'bg-emerald-950/20 border-emerald-500/40 text-slate-200'
                        : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleEvent(ev.id)}
                      className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 bg-slate-900"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono font-semibold text-[11px] text-emerald-300">
                        {ev.label}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{ev.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Rate Limiting */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
              <span>Outbound Rate Limit (Requests per minute)</span>
              <span className="text-[11px] text-slate-400 font-normal">1 to 1,000 req/min</span>
            </label>
            <input
              type="number"
              min={1}
              max={1000}
              value={rateLimitPerMinute}
              onChange={(e) => setRateLimitPerMinute(parseInt(e.target.value, 10) || 10)}
              className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Custom HTTP Headers */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200">Custom HTTP Headers</label>
              <button
                type="button"
                onClick={handleAddHeader}
                className="inline-flex items-center space-x-1 text-xs text-emerald-400 hover:text-emerald-300 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Header</span>
              </button>
            </div>

            {headersList.length === 0 ? (
              <p className="text-[11px] text-slate-500">No custom headers defined.</p>
            ) : (
              <div className="space-y-2">
                {headersList.map((hdr, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="Header Name (e.g. X-Custom-Auth)"
                      value={hdr.key}
                      onChange={(e) => handleHeaderChange(idx, 'key', e.target.value)}
                      className="w-1/2 px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <input
                      type="text"
                      placeholder="Header Value"
                      value={hdr.value}
                      onChange={(e) => handleHeaderChange(idx, 'value', e.target.value)}
                      className="w-1/2 px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveHeader(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AST Filter Predicate Builder */}
          <WebhookFilterBuilder initialRules={filterRules} onChange={setFilterRules} />

          {/* Payload Projection Picker */}
          <WebhookPayloadPicker value={payloadProjection} onChange={setPayloadProjection} />

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isEditing ? 'Save Changes' : 'Create Subscription'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
