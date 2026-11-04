'use client';

import { useState } from 'react';
import { X, Key, AlertCircle, Loader2 } from 'lucide-react';
import { getApiUrl } from '@/lib/api';

export interface ApiClientBinding {
  id: string;
  name: string;
  description?: string | null;
  clientId: string;
  issuer?: string;
  status: 'active' | 'disabled' | 'revoked';
  scopes: string[];
  createdAt: string;
}

interface ApiClientModalProps {
  client?: ApiClientBinding | null;
  onClose: () => void;
  onSuccess: (saved: ApiClientBinding) => void;
}

const AVAILABLE_SCOPES = [
  { id: 'documents:read', label: 'documents:read', desc: 'Read agreements, envelopes, and status' },
  { id: 'documents:create', label: 'documents:create', desc: 'Draft and upload new agreements' },
  { id: 'documents:update', label: 'documents:update', desc: 'Modify drafts and form fields' },
  { id: 'documents:delete', label: 'documents:delete', desc: 'Void or soft-delete documents' },
  { id: 'templates:read', label: 'templates:read', desc: 'Access reusable template library' },
  { id: 'audit:read', label: 'audit:read', desc: 'Export verifiable audit trail records' },
  { id: 'webhooks:read', label: 'webhooks:read', desc: 'View registered outbound webhooks' },
  {
    id: 'webhooks:manage',
    label: 'webhooks:manage',
    desc: 'Register or modify webhook subscriptions',
  },
  {
    id: 'webhooks:replay',
    label: 'webhooks:replay',
    desc: 'Trigger manual webhook event re-deliveries',
  },
  {
    id: 'api_clients:manage',
    label: 'api_clients:manage',
    desc: 'Administer machine client bindings',
  },
  { id: 'api_logs:read', label: 'api_logs:read', desc: 'Search and inspect API request logs' },
];

function getToken(): string {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return '';
  return (
    localStorage.getItem('graphsign_session_token') ||
    localStorage.getItem('token') ||
    localStorage.getItem('access_token') ||
    sessionStorage.getItem('access_token') ||
    ''
  );
}

export function ApiClientModal({ client, onClose, onSuccess }: ApiClientModalProps) {
  const isEditing = Boolean(client);

  const [name, setName] = useState(client?.name || '');
  const [description, setDescription] = useState(client?.description || '');
  const [clientId, setClientId] = useState(client?.clientId || '');
  const [issuer, setIssuer] = useState(client?.issuer || 'graphsign-local');
  const [status, setStatus] = useState<'active' | 'disabled'>(
    client?.status === 'disabled' ? 'disabled' : 'active',
  );
  const [selectedScopes, setSelectedScopes] = useState<string[]>(
    client?.scopes || ['documents:read', 'documents:create'],
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Client binding name is required.');
      return;
    }
    if (!isEditing && !clientId.trim()) {
      setError('Client ID is required.');
      return;
    }
    if (selectedScopes.length === 0) {
      setError('Select at least one permitted scope.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = getToken();
      const apiUrl = getApiUrl();

      let res: Response;
      if (isEditing && client) {
        res = await fetch(`${apiUrl}/api/v1/organisations/me/api-clients/${client.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            status,
            scopes: selectedScopes,
          }),
        });
      } else {
        res = await fetch(`${apiUrl}/api/v1/organisations/me/api-clients`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: name.trim(),
            clientId: clientId.trim(),
            description: description.trim() || undefined,
            issuer: issuer.trim() || 'graphsign-local',
            scopes: selectedScopes,
          }),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message || data.message || 'Failed to save API client binding');
      }

      const saved = (await res.json()) as ApiClientBinding;
      onSuccess(saved);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center space-x-2 text-slate-100 font-semibold text-base">
            <Key className="w-5 h-5 text-emerald-400" />
            <span>{isEditing ? 'Edit API Client Binding' : 'Register Machine API Client'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-950/50 border border-rose-500/50 rounded-xl flex items-center space-x-2 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Binding Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., ERP Background Sync Daemon"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Client ID */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              OAuth2 Client ID / Subject <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              disabled={isEditing}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g., 2918239012398@graphsign.ink"
              className={`w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 ${
                isEditing ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            />
            <p className="text-[11px] text-slate-400 mt-1">
              The matching client identifier in bearer tokens (`client_id` or `sub`).
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Primary purpose or system owner"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {!isEditing && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Token Issuer
              </label>
              <input
                type="text"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                placeholder="graphsign-local"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {isEditing && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'disabled')}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          )}

          {/* Scopes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Permitted API Scopes <span className="text-rose-400">*</span>
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {AVAILABLE_SCOPES.map((scope) => {
                const checked = selectedScopes.includes(scope.id);
                return (
                  <label
                    key={scope.id}
                    className={`flex items-start space-x-3 p-2.5 rounded-lg border cursor-pointer transition ${
                      checked
                        ? 'bg-emerald-950/30 border-emerald-500/50 text-slate-100'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleScope(scope.id)}
                      className="mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                    />
                    <div className="flex-1">
                      <div className="text-xs font-mono font-semibold text-slate-200">
                        {scope.label}
                      </div>
                      <div className="text-[11px] text-slate-400">{scope.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition disabled:opacity-50"
            >
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{isEditing ? 'Save Changes' : 'Register Client'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
