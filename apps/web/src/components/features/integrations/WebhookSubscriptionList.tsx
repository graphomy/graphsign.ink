'use client';

import React, { useState, useEffect } from 'react';
import {
  Webhook,
  Plus,
  Play,
  RotateCw,
  BarChart2,
  Trash2,
  Edit2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { WebhookModal, type WebhookSubscription } from './WebhookModal';
import { WebhookSecretDisplayModal } from './WebhookSecretDisplayModal';
import { WebhookTestDialog } from './WebhookTestDialog';
import { WebhookMetricsChart } from './WebhookMetricsChart';
import { getApiUrl } from '@/lib/api';

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem('graphsign_session_token') ||
    localStorage.getItem('token') ||
    localStorage.getItem('access_token') ||
    sessionStorage.getItem('access_token') ||
    ''
  );
}

export function WebhookSubscriptionList() {
  const [subscriptions, setSubscriptions] = useState<WebhookSubscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<WebhookSubscription | null>(null);

  // Secret display modal
  const [secretDisplay, setSecretDisplay] = useState<{
    secret: string;
    subscriptionName: string;
    isRotated?: boolean;
  } | null>(null);

  // Test dialog state
  const [testSubscription, setTestSubscription] = useState<WebhookSubscription | null>(null);

  // Expanded metrics chart
  const [expandedMetricsId, setExpandedMetricsId] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const reloadSubscriptions = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    async function loadSubscriptions() {
      try {
        const token = getToken();
        const res = await fetch(`${getApiUrl()}/api/v1/webhooks`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error('Failed to load webhook subscriptions');
        }

        const data = (await res.json()) as {
          subscriptions?: WebhookSubscription[];
          data?: WebhookSubscription[];
        };
        setSubscriptions(data.subscriptions || data.data || []);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error loading webhooks';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    }

    void loadSubscriptions();
  }, [refreshKey]);

  const handleCreateNew = () => {
    setEditingSubscription(null);
    setModalOpen(true);
  };

  const handleEdit = (sub: WebhookSubscription) => {
    setEditingSubscription(sub);
    setModalOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete webhook subscription "${name}"?`)) return;

    try {
      const token = getToken();
      const res = await fetch(`${getApiUrl()}/api/v1/webhooks/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error('Failed to delete webhook');
      setSubscriptions(subscriptions.filter((s) => s.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Delete error: ${msg}`);
    }
  };

  const handleRotateSecret = async (sub: WebhookSubscription) => {
    if (
      !confirm(
        `Rotate signing secret for "${sub.name}"?\n\nA 24-hour dual-verification grace period will start immediately. Both old and new secrets will sign outbound payloads during this window.`,
      )
    ) {
      return;
    }

    try {
      const token = getToken();
      const res = await fetch(`${getApiUrl()}/api/v1/webhooks/${sub.id}/rotate-secret`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Secret rotation failed');

      setSecretDisplay({
        secret: data.secret,
        subscriptionName: sub.name,
        isRotated: true,
      });
      reloadSubscriptions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Rotation error: ${msg}`);
    }
  };

  const handleSuccessSave = (saved: WebhookSubscription, secret?: string) => {
    setModalOpen(false);
    reloadSubscriptions();

    if (secret) {
      setSecretDisplay({
        secret,
        subscriptionName: saved.name,
        isRotated: false,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <Webhook className="w-5 h-5 text-emerald-400" />
            <span>Webhook Subscriptions</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure automated HTTPS callbacks with HMAC-SHA256 signatures, AST filters, and
            delivery telemetry.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={reloadSubscriptions}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded-lg transition"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleCreateNew}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Webhook</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-500/30 rounded-lg text-xs text-rose-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-xs text-slate-500 animate-pulse">
          Loading webhook endpoints...
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40 space-y-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <Webhook className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-200">No Webhook Subscriptions Yet</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Integrate your external systems, CRM, or document archives with automated event
            notifications when agreements are sent, viewed, signed, or completed.
          </p>
          <button
            type="button"
            onClick={handleCreateNew}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition mt-2"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Webhook</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {subscriptions.map((sub) => {
            const isMetricsOpen = expandedMetricsId === sub.id;
            return (
              <div
                key={sub.id}
                className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition"
              >
                <div className="p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2.5">
                        <span className="font-bold text-sm text-slate-100">{sub.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            sub.status === 'active'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {sub.status}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                          {sub.rateLimitPerMinute} req/min
                        </span>
                      </div>
                      <div className="text-xs font-mono text-slate-400 flex items-center space-x-1">
                        <span className="text-slate-500">POST</span>
                        <span className="text-slate-300 truncate max-w-lg">{sub.targetUrl}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setTestSubscription(sub)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-medium rounded-lg transition"
                        title="Send synthetic test payload"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Test</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRotateSecret(sub)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-medium rounded-lg transition"
                        title="Rotate secret with 24-hour grace period"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Rotate</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedMetricsId(isMetricsOpen ? null : sub.id)}
                        className={`inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition ${
                          isMetricsOpen
                            ? 'bg-slate-800 text-emerald-400 border-slate-700'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 border-slate-800'
                        }`}
                        title="Toggle delivery telemetry chart"
                      >
                        <BarChart2 className="w-3.5 h-3.5" />
                        <span>Metrics</span>
                        {isMetricsOpen ? (
                          <ChevronUp className="w-3 h-3 ml-0.5" />
                        ) : (
                          <ChevronDown className="w-3 h-3 ml-0.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleEdit(sub)}
                        className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 rounded-lg transition"
                        title="Edit subscription"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(sub.id, sub.name)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-950 border border-slate-800 rounded-lg transition"
                        title="Delete subscription"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {sub.description && <p className="text-xs text-slate-400">{sub.description}</p>}

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-500 font-medium mr-1">Events:</span>
                    {sub.eventTypes.map((ev) => (
                      <span
                        key={ev}
                        className="px-2 py-0.5 rounded text-[11px] bg-slate-950 border border-slate-800 font-mono text-emerald-300"
                      >
                        {ev}
                      </span>
                    ))}
                    {sub.payloadProjection?.mode === 'CUSTOM' && (
                      <span className="px-2 py-0.5 rounded text-[11px] bg-indigo-950/60 border border-indigo-800 font-mono text-indigo-300">
                        Projected ({sub.payloadProjection.includeFields?.length || 0} fields)
                      </span>
                    )}
                    {sub.filterRules && Object.keys(sub.filterRules).length > 0 && (
                      <span className="px-2 py-0.5 rounded text-[11px] bg-amber-950/60 border border-amber-800 font-mono text-amber-300">
                        Filtered ({Object.keys(sub.filterRules).length} rules)
                      </span>
                    )}
                  </div>
                </div>

                {isMetricsOpen && (
                  <div className="border-t border-slate-800 p-4 bg-slate-950/60">
                    <WebhookMetricsChart
                      subscriptionId={sub.id}
                      subscriptionName={sub.name}
                      onClose={() => setExpandedMetricsId(null)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {modalOpen && (
        <WebhookModal
          subscription={editingSubscription}
          onClose={() => setModalOpen(false)}
          onSuccess={handleSuccessSave}
        />
      )}

      {secretDisplay && (
        <WebhookSecretDisplayModal
          secret={secretDisplay.secret}
          subscriptionName={secretDisplay.subscriptionName}
          isRotated={secretDisplay.isRotated}
          onClose={() => setSecretDisplay(null)}
        />
      )}

      {testSubscription && (
        <WebhookTestDialog
          subscriptionId={testSubscription.id}
          subscriptionName={testSubscription.name}
          targetUrl={testSubscription.targetUrl}
          onClose={() => setTestSubscription(null)}
        />
      )}
    </div>
  );
}
