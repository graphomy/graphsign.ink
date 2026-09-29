'use client';

import React, { useState } from 'react';
import { getApiUrl } from '@/lib/api';

export interface SavedPresetData {
  id: string;
  name: string;
  entityType: string;
  filters: Record<string, unknown>;
  isDefault: boolean;
}

interface SavePresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: Record<string, unknown>;
  entityType?: 'AGREEMENT' | 'TEMPLATE';
  onPresetSaved: (preset: SavedPresetData) => void;
}

export function SavePresetModal({
  isOpen,
  onClose,
  filters,
  entityType = 'AGREEMENT',
  onPresetSaved,
}: SavePresetModalProps) {
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a preset name');
      return;
    }

    setSaving(true);
    setError(null);

    const token =
      localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/search/presets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          entityType,
          filters,
          isDefault,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to save filter preset');
      }

      onPresetSaved(data.data);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-[#ba0000]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900">Save Filter Preset</h3>
              <p className="text-xs text-neutral-500">
                Save current filters for quick 1-click access
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 p-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              Preset Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Active PDFs, Pending Reviews"
              className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20 focus:border-[#ba0000] transition-all"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isDefaultPreset"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 text-[#ba0000] rounded-sm border-neutral-300 focus:ring-[#ba0000]"
            />
            <label
              htmlFor="isDefaultPreset"
              className="text-xs text-neutral-700 font-medium cursor-pointer"
            >
              Set as default filter when opening agreements
            </label>
          </div>

          {/* Active filter summary pills */}
          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-100 text-xs text-neutral-600">
            <span className="font-semibold text-neutral-800 block mb-1.5">
              Filters to be saved:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(filters).map(([k, v]) => {
                if (!v || v === 'ALL' || v === 'all') return null;
                return (
                  <span
                    key={k}
                    className="px-2 py-0.5 bg-white border border-neutral-200 rounded-md font-mono text-[11px]"
                  >
                    {k}: {String(v)}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#ba0000] hover:bg-[#a00000] rounded-xl shadow-xs transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Preset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
