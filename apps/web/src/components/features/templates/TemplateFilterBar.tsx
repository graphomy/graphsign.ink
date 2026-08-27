'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SavePresetModal, SavedPresetData } from '../agreements/SavePresetModal';
import { getApiUrl } from '@/lib/api';

export interface TemplateFilterState {
  keyword: string;
  status: string;
  format: string;
  tag: string;
  datePreset: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface PresetItem {
  id: string;
  name: string;
  filters: Partial<TemplateFilterState>;
  isDefault: boolean;
}

interface TemplateFilterBarProps {
  filters: TemplateFilterState;
  onFilterChange: (newFilters: TemplateFilterState) => void;
  onClearFilters: () => void;
  totalResults?: number;
  queryTimeMs?: number;
}

export function TemplateFilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  totalResults,
  queryTimeMs,
}: TemplateFilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [presetsOpen, setPresetsOpen] = useState(false);

  const presetsDropdownRef = useRef<HTMLDivElement>(null);

  const fetchPresets = async () => {
    const token =
      localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';
    if (!token) return;

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/search/presets?entityType=TEMPLATE`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setPresets(data.data);
      }
    } catch {
      // Non-blocking fallback
    }
  };

  // Close presets dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (presetsDropdownRef.current && !presetsDropdownRef.current.contains(e.target as Node)) {
        setPresetsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch saved presets on mount
  useEffect(() => {
    queueMicrotask(() => {
      fetchPresets();
    });
  }, []);

  const handleApplyPreset = (preset: PresetItem) => {
    onFilterChange({
      ...filters,
      ...preset.filters,
    });
    setPresetsOpen(false);
  };

  const handleDeletePreset = async (e: React.MouseEvent, presetId: string) => {
    e.stopPropagation();
    const token =
      localStorage.getItem('graphsign_session_token') || localStorage.getItem('token') || '';

    try {
      const res = await fetch(`${getApiUrl()}/api/v1/search/presets/${presetId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPresets((prev) => prev.filter((p) => p.id !== presetId));
      }
    } catch {
      // Non-blocking fallback
    }
  };

  const hasActiveFilters =
    Boolean(filters.keyword) ||
    (Boolean(filters.status) && filters.status !== 'ALL') ||
    (Boolean(filters.format) && filters.format !== 'ALL') ||
    (Boolean(filters.datePreset) && filters.datePreset !== 'all') ||
    Boolean(filters.tag);

  return (
    <div className="space-y-3">
      {/* Main Omnibar Search & Filter Controls */}
      <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between bg-white p-2.5 rounded-2xl border border-neutral-200/80 shadow-xs">
        {/* Search Input Omnibox */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={filters.keyword}
            onChange={(e) => onFilterChange({ ...filters, keyword: e.target.value })}
            placeholder="Search templates by title, description, content, or tags..."
            className="w-full pl-10 pr-9 py-2 bg-neutral-50 hover:bg-neutral-100/60 focus:bg-white border border-transparent focus:border-[#ba0000] rounded-xl text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#ba0000]/15 transition-all"
          />
          {filters.keyword && (
            <button
              onClick={() => onFilterChange({ ...filters, keyword: '' })}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Action Controls & Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Status Dropdown */}
          <select
            value={filters.status}
            onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
            className="px-3 py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active (Published)</option>
            <option value="DRAFT">Draft</option>
          </select>

          {/* Sort By Dropdown */}
          <select
            value={`${filters.sortBy}:${filters.sortOrder}`}
            onChange={(e) => {
              const [sortBy, sortOrder] = e.target.value.split(':');
              onFilterChange({
                ...filters,
                sortBy: sortBy || 'updatedAt',
                sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
              });
            }}
            className="px-3 py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20"
          >
            <option value="updatedAt:desc">Recently Updated</option>
            <option value="createdAt:desc">Newest First</option>
            <option value="createdAt:asc">Oldest First</option>
            <option value="title:asc">Title (A-Z)</option>
            <option value="title:desc">Title (Z-A)</option>
          </select>

          {/* Toggle Advanced Filters Button */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`px-3 py-2 border rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors ${
              showAdvanced || hasActiveFilters
                ? 'bg-red-50/70 border-red-200 text-[#ba0000]'
                : 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-700'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            <span>Filters</span>
          </button>

          {/* Saved Presets Dropdown */}
          <div className="relative" ref={presetsDropdownRef}>
            <button
              onClick={() => setPresetsOpen(!presetsOpen)}
              className="px-3 py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-700 flex items-center gap-1.5 transition-colors"
            >
              <svg
                className="w-3.5 h-3.5 text-neutral-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
              <span>Presets</span>
              <svg
                className="w-3 h-3 text-neutral-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {presetsOpen && (
              <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-neutral-200 z-50 p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-2 border-b border-neutral-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                    Saved Presets
                  </span>
                  <button
                    onClick={() => {
                      setPresetsOpen(false);
                      setShowSavePresetModal(true);
                    }}
                    className="text-[11px] font-bold text-[#ba0000] hover:underline flex items-center gap-1"
                  >
                    + Save Current
                  </button>
                </div>

                {presets.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-neutral-400">
                    No saved presets yet
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {presets.map((preset) => (
                      <div
                        key={preset.id}
                        onClick={() => handleApplyPreset(preset)}
                        className="group flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-neutral-100/80 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-medium text-neutral-800 truncate">
                            {preset.name}
                          </span>
                          {preset.isDefault && (
                            <span className="px-1.5 py-0.2 bg-neutral-200 text-neutral-700 text-[10px] rounded-sm font-semibold">
                              Default
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => handleDeletePreset(e, preset.id)}
                          className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-600 p-1 rounded-sm transition-opacity"
                          title="Delete preset"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Filter Expansion Panel */}
      {showAdvanced && (
        <div className="bg-neutral-50/70 p-4 rounded-2xl border border-neutral-200/70 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Format / Type */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-600 uppercase tracking-wider mb-1">
                Blueprint Format
              </label>
              <select
                value={filters.format}
                onChange={(e) => onFilterChange({ ...filters, format: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20"
              >
                <option value="ALL">All Formats</option>
                <option value="markdown">Markdown Blueprint (.md)</option>
                <option value="pdf">PDF Template (.pdf)</option>
              </select>
            </div>

            {/* Tag Filter */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-600 uppercase tracking-wider mb-1">
                Tag / Category
              </label>
              <input
                type="text"
                value={filters.tag}
                onChange={(e) => onFilterChange({ ...filters, tag: e.target.value })}
                placeholder="e.g. legal, employment, hr"
                className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20"
              />
            </div>

            {/* Date Preset */}
            <div>
              <label className="block text-[11px] font-bold text-neutral-600 uppercase tracking-wider mb-1">
                Date Range
              </label>
              <select
                value={filters.datePreset}
                onChange={(e) => onFilterChange({ ...filters, datePreset: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#ba0000]/20"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="last_7_days">Last 7 Days</option>
                <option value="last_30_days">Last 30 Days</option>
                <option value="last_90_days">Last 90 Days</option>
              </select>
            </div>
          </div>

          {/* Quick Filter Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-neutral-200/60">
            <button
              onClick={() => setShowSavePresetModal(true)}
              className="text-xs font-semibold text-[#ba0000] hover:text-[#900000] flex items-center gap-1.5 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
              <span>Save Current Filter Configuration as Preset</span>
            </button>

            <button
              onClick={onClearFilters}
              className="text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        </div>
      )}

      {/* Active Filter Chips & Summary Status Bar */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-0.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-neutral-500 font-medium mr-1">Active filters:</span>

            {filters.keyword && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-neutral-800 rounded-lg text-xs font-medium">
                Keyword: &quot;{filters.keyword}&quot;
                <button
                  onClick={() => onFilterChange({ ...filters, keyword: '' })}
                  className="hover:text-red-600 font-bold"
                >
                  &times;
                </button>
              </span>
            )}

            {filters.status && filters.status !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-neutral-800 rounded-lg text-xs font-medium">
                Status: {filters.status === 'ACTIVE' ? 'Active (Published)' : 'Draft'}
                <button
                  onClick={() => onFilterChange({ ...filters, status: 'ALL' })}
                  className="hover:text-red-600 font-bold"
                >
                  &times;
                </button>
              </span>
            )}

            {filters.format && filters.format !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-neutral-800 rounded-lg text-xs font-medium">
                Format: {filters.format.toUpperCase()}
                <button
                  onClick={() => onFilterChange({ ...filters, format: 'ALL' })}
                  className="hover:text-red-600 font-bold"
                >
                  &times;
                </button>
              </span>
            )}

            {filters.tag && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-neutral-800 rounded-lg text-xs font-medium">
                Tag: #{filters.tag}
                <button
                  onClick={() => onFilterChange({ ...filters, tag: '' })}
                  className="hover:text-red-600 font-bold"
                >
                  &times;
                </button>
              </span>
            )}

            {filters.datePreset && filters.datePreset !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-neutral-800 rounded-lg text-xs font-medium">
                Date: {filters.datePreset.replace(/_/g, ' ')}
                <button
                  onClick={() => onFilterChange({ ...filters, datePreset: 'all' })}
                  className="hover:text-red-600 font-bold"
                >
                  &times;
                </button>
              </span>
            )}

            <button
              onClick={onClearFilters}
              className="text-xs text-[#ba0000] font-semibold hover:underline ml-1.5"
            >
              Clear all
            </button>
          </div>

          {/* Results count & execution stats */}
          <div className="flex items-center gap-3 text-neutral-400 text-[11px] ml-auto">
            {totalResults !== undefined && (
              <span>
                Found <strong className="text-neutral-700">{totalResults}</strong> templates
              </span>
            )}
            {queryTimeMs !== undefined && <span>({queryTimeMs} ms)</span>}
          </div>
        </div>
      )}

      {/* Save Filter Preset Modal */}
      {showSavePresetModal && (
        <SavePresetModal
          isOpen={showSavePresetModal}
          onClose={() => setShowSavePresetModal(false)}
          filters={filters as unknown as Record<string, unknown>}
          entityType="TEMPLATE"
          onPresetSaved={(newPreset: SavedPresetData) => {
            setPresets((prev) => [newPreset as unknown as PresetItem, ...prev]);
          }}
        />
      )}
    </div>
  );
}
