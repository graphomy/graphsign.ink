'use client';

import React, { useState, useEffect } from 'react';
import { SessionGuard } from '@/components/features/auth/SessionGuard';
import { HeaderNav } from '@/components/layout/HeaderNav';
import { Footer } from '@/components/layout/Footer';
import { WebhookSubscriptionList } from '@/components/features/integrations/WebhookSubscriptionList';
import { Webhook, Key, BookOpen, RefreshCw, Activity, ExternalLink } from 'lucide-react';
import { getApiUrl } from '@/lib/api';

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<'webhooks' | 'api-clients' | 'api-logs' | 'docs'>(
    'webhooks',
  );

  return (
    <SessionGuard>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <HeaderNav />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {/* Header */}
          <div className="border-b border-slate-800 pb-5">
            <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              <span>Settings</span>
              <span>&bull;</span>
              <span>Developer & API</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 mt-1">
              Integrations & Developer APIs
            </h1>
            <p className="text-sm text-slate-400 mt-1.5 max-w-2xl">
              Connect external systems with webhook callbacks, register trusted machine OAuth2
              client bindings, inspect redacted API request logs, and explore interactive OpenAPI
              3.1 contracts.
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center space-x-2 border-b border-slate-800 pb-px overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('webhooks')}
              className={`inline-flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition whitespace-nowrap ${
                activeTab === 'webhooks'
                  ? 'border-emerald-500 text-emerald-400 bg-slate-900/50'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Webhook className="w-4 h-4" />
              <span>Webhooks</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('api-clients')}
              className={`inline-flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition whitespace-nowrap ${
                activeTab === 'api-clients'
                  ? 'border-emerald-500 text-emerald-400 bg-slate-900/50'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Key className="w-4 h-4" />
              <span>API Client Bindings</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('api-logs')}
              className={`inline-flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition whitespace-nowrap ${
                activeTab === 'api-logs'
                  ? 'border-emerald-500 text-emerald-400 bg-slate-900/50'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>API Request Logs</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('docs')}
              className={`inline-flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition whitespace-nowrap ${
                activeTab === 'docs'
                  ? 'border-emerald-500 text-emerald-400 bg-slate-900/50'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Interactive Docs (Scalar)</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="pt-2">
            {activeTab === 'webhooks' && <WebhookSubscriptionList />}
            {activeTab === 'api-clients' && <ApiClientsTab />}
            {activeTab === 'api-logs' && <ApiLogsTab />}
            {activeTab === 'docs' && <DocsTab />}
          </div>
        </main>

        <Footer />
      </div>
    </SessionGuard>
  );
}

interface ApiClientBindingDto {
  id: string;
  name: string;
  clientId: string;
  scopes: string[];
  status: 'active' | 'disabled';
  createdAt: string;
}

interface ApiRequestLogDto {
  id: string;
  requestId: string;
  method: string;
  routeTemplate: string;
  statusCode: number;
  durationMs: number;
  ipAddress?: string;
  createdAt: string;
}

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

/**
 * API Clients Tab (INK-148, FR-016.006)
 */
function ApiClientsTab() {
  const [clients, setClients] = useState<ApiClientBindingDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const reloadClients = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    async function loadClients() {
      try {
        const token = getToken();
        const res = await fetch(`${getApiUrl()}/api/v1/organisations/me/api-clients`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load API client bindings');
        const data = (await res.json()) as {
          clients?: ApiClientBindingDto[];
          data?: ApiClientBindingDto[];
        };
        setClients(data.clients || data.data || []);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error loading API clients';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    }

    void loadClients();
  }, [refreshKey]);

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ApiClientBindingDto | null>(null);
  const [createdSecret, setCreatedSecret] = useState<{
    clientId: string;
    clientSecret: string;
    name: string;
  } | null>(null);

  const handleCreateNew = () => {
    setEditingClient(null);
    setModalOpen(true);
  };

  const handleEdit = (client: ApiClientBindingDto) => {
    setEditingClient(client);
    setModalOpen(true);
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke API client binding "${name}"?`)) return;

    try {
      const token = getToken();
      const res = await fetch(`${getApiUrl()}/api/v1/organisations/me/api-clients/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to revoke API client');
      reloadClients();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error revoking API client');
    }
  };

  const handleRotate = async (id: string, name: string) => {
    if (
      !confirm(
        `Are you sure you want to rotate secrets for "${name}"? Existing active tokens will remain valid during grace period.`,
      )
    )
      return;

    try {
      const token = getToken();
      const res = await fetch(`${getApiUrl()}/api/v1/organisations/me/api-clients/${id}/rotate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to rotate API client secret');
      const data = (await res.json()) as { clientSecret: string; clientId: string };
      setCreatedSecret({
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        name,
      });
      reloadClients();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error rotating API client secret');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Machine API Client Bindings</h2>
          <p className="text-xs text-slate-400 mt-1">
            Trusted OAuth2 client credentials allowed to authenticate without user interactive
            login.
          </p>
        </div>
        <button
          type="button"
          onClick={reloadClients}
          className="p-2 text-slate-400 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded-lg transition"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-lg text-xs text-rose-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-500 animate-pulse">
          Loading client bindings...
        </div>
      ) : clients.length === 0 ? (
        <div className="p-10 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40 space-y-2">
          <Key className="w-8 h-8 text-slate-500 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">No Machine API Clients Configured</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Machine client bindings allow external daemon scripts or services to act on behalf of
            your workspace using OAuth2 client credentials grant.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map((c) => (
            <div
              key={c.id}
              className="p-4 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between"
            >
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm text-slate-200">{c.name}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                    {c.status}
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1">Client ID: {c.clientId}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {c.scopes.map((s: string) => (
                    <span
                      key={s}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-950 border border-slate-800 text-slate-300 font-mono"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Searchable Redacted API Logs Tab (INK-152, FR-016.010)
 */
function ApiLogsTab() {
  const [logs, setLogs] = useState<ApiRequestLogDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const reloadLogs = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    async function loadLogs() {
      try {
        const token = getToken();
        const res = await fetch(`${getApiUrl()}/api/v1/organisations/me/api-logs?limit=30`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load request logs');
        const data = (await res.json()) as { logs?: ApiRequestLogDto[]; data?: ApiRequestLogDto[] };
        setLogs(data.logs || data.data || []);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error fetching API logs';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    }

    void loadLogs();
  }, [refreshKey]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Redacted API Request Logs</h2>
          <p className="text-xs text-slate-400 mt-1">
            Searchable audit trail of API calls. Secrets and sensitive headers are strictly
            redacted. Retained for 90 days.
          </p>
        </div>
        <button
          type="button"
          onClick={reloadLogs}
          className="p-2 text-slate-400 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded-lg transition"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-lg text-xs text-rose-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-500 animate-pulse">
          Loading API logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="p-10 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40 space-y-2">
          <Activity className="w-8 h-8 text-slate-500 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">No API Logs Recorded Yet</p>
          <p className="text-xs text-slate-500">
            Inbound requests to /api/v1/* and /api/v2/* will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-900">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono text-[11px]">
              <tr>
                <th className="py-3 px-4">Method & Route</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Request ID</th>
                <th className="py-3 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono text-slate-300">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition">
                  <td className="py-2.5 px-4">
                    <span className="font-bold text-emerald-400 mr-2">{log.method}</span>
                    <span className="text-slate-200">{log.routeTemplate}</span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold text-[11px] ${
                        log.statusCode < 400
                          ? 'bg-emerald-950 text-emerald-300'
                          : 'bg-rose-950 text-rose-300'
                      }`}
                    >
                      {log.statusCode}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-400">{log.durationMs}ms</td>
                  <td className="py-2.5 px-4 text-slate-500 truncate max-w-xs">{log.requestId}</td>
                  <td className="py-2.5 px-4 text-slate-400 font-sans text-xs">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Interactive API Documentation Tab (INK-146)
 */
function DocsTab() {
  const apiUrl = getApiUrl();
  const docsUrl = `${apiUrl}/api/v1/docs`;
  const openApiUrl = `${apiUrl}/api/v1/docs/openapi.json`;

  return (
    <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-6">
      <div className="flex items-center space-x-3">
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
          <BookOpen className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-100">
            Interactive OpenAPI 3.1 & Scalar Documentation
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Test endpoints interactively with authentication, inspect schemas, and download OpenAPI
            specifications.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
          <div className="text-sm font-bold text-slate-200">Interactive Scalar API Reference</div>
          <p className="text-xs text-slate-400">
            Explore and execute requests directly from your browser against the development or local
            API.
          </p>
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition mt-2"
          >
            <span>Open Scalar API Docs</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
          <div className="text-sm font-bold text-slate-200">Raw OpenAPI 3.1 Specification</div>
          <p className="text-xs text-slate-400">
            Import the machine-readable OpenAPI specification into Postman, Insomnia, or SDK code
            generators.
          </p>
          <a
            href={openApiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition mt-2"
          >
            <span>Download openapi.json</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
