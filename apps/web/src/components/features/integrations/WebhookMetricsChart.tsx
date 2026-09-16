'use client';

import React, { useState, useEffect } from 'react';
import { BarChart3, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { getApiUrl } from '@/lib/api';

interface WebhookMetricsChartProps {
  subscriptionId: string;
  subscriptionName: string;
  onClose?: () => void;
}

interface MetricsSummary {
  period: string;
  totals: {
    dispatched: number;
    succeeded: number;
    failed: number;
    deadLettered: number;
  };
  performance: {
    avgLatencyMs: number;
    successRatePercent: number;
  };
}

export function WebhookMetricsChart({ subscriptionId, subscriptionName, onClose }: WebhookMetricsChartProps) {
  const [period, setPeriod] = useState<'24h' | '7d'>('24h');
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const reloadMetrics = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    async function loadMetrics() {
      try {
        const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || '';
        const res = await fetch(`${getApiUrl()}/api/v1/webhooks/${subscriptionId}/metrics?period=${period}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error('Failed to load metrics summary');
        }

        const data = (await res.json()) as MetricsSummary;
        setMetrics(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error fetching metrics';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    }

    void loadMetrics();
  }, [subscriptionId, period, refreshKey]);

  const handleExportCsv = async () => {
    try {
      const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || '';
      const res = await fetch(`${getApiUrl()}/api/v1/webhooks/${subscriptionId}/metrics?period=${period}&format=csv`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error('Failed to export CSV');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webhook-${subscriptionId}-metrics-${period}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Export failed: ${msg}`);
    }
  };

  return (
    <div className="space-y-4 p-5 bg-slate-900 border border-slate-800 rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Delivery Metrics & Rollup</h3>
            <p className="text-xs text-slate-400 truncate max-w-sm">{subscriptionName}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setPeriod('24h')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                period === '24h' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Last 24 Hours
            </button>
            <button
              type="button"
              onClick={() => setPeriod('7d')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                period === '7d' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Last 7 Days
            </button>
          </div>

          <button
            type="button"
            onClick={reloadMetrics}
            disabled={isLoading}
            className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg transition"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center space-x-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-lg flex items-center space-x-2 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-500 animate-pulse">Loading delivery telemetry...</div>
      ) : metrics ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total Dispatched</div>
            <div className="text-xl font-bold font-mono text-slate-100 mt-1">
              {metrics.totals.dispatched.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Attempted webhook requests</div>
          </div>

          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80">
            <div className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">Success Rate</div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
              {metrics.performance.successRatePercent}%
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {metrics.totals.succeeded.toLocaleString()} 2xx responses
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80">
            <div className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">Dead Letter (DLQ)</div>
            <div className="text-xl font-bold font-mono text-amber-400 mt-1">
              {metrics.totals.deadLettered.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Exhausted after 4 attempts</div>
          </div>

          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80">
            <div className="text-[11px] font-medium text-indigo-400 uppercase tracking-wider">Avg Latency</div>
            <div className="text-xl font-bold font-mono text-indigo-400 mt-1">
              {metrics.performance.avgLatencyMs}ms
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Round-trip execution</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
