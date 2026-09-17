'use client';

import { Layers } from 'lucide-react';

export interface PayloadProjectionConfig {
  mode: 'ALL' | 'CUSTOM';
  includeFields?: string[];
}

interface WebhookPayloadPickerProps {
  value?: PayloadProjectionConfig;
  onChange: (config: PayloadProjectionConfig) => void;
}

const AVAILABLE_FIELDS = [
  { id: 'id', label: 'Delivery ID', required: true, description: 'Envelope unique UUID' },
  { id: 'event', label: 'Event Name', required: true, description: 'Event identifier string' },
  { id: 'timestamp', label: 'Timestamp', required: true, description: 'ISO 8601 generation time' },
  {
    id: 'organisationId',
    label: 'Organisation ID',
    required: false,
    description: 'Workspace UUID',
  },
  { id: 'sequence', label: 'Sequence Number', required: false, description: 'Monotonic counter' },
  {
    id: 'data.document_id',
    label: 'Document UUID',
    required: false,
    description: 'Target document identifier',
  },
  {
    id: 'data.document_name',
    label: 'Document Title',
    required: false,
    description: 'Human-readable title',
  },
  {
    id: 'data.status',
    label: 'Document Status',
    required: false,
    description: 'DRAFT, SENT, COMPLETED, etc.',
  },
  {
    id: 'data.folder',
    label: 'Document Folder',
    required: false,
    description: 'Organizational path',
  },
  {
    id: 'data.recipient_id',
    label: 'Recipient ID',
    required: false,
    description: 'Acting recipient UUID',
  },
  {
    id: 'data.recipient_email',
    label: 'Recipient Email',
    required: false,
    description: 'Signer email address',
  },
  {
    id: 'data.completed_at',
    label: 'Completed Date',
    required: false,
    description: 'Timestamp of completion',
  },
  {
    id: 'data.verification_url',
    label: 'Verification URL',
    required: false,
    description: 'Public PAdES verification link',
  },
  {
    id: 'data.reason',
    label: 'Decline / Void Reason',
    required: false,
    description: 'Optional explanation text',
  },
];

export function WebhookPayloadPicker({ value, onChange }: WebhookPayloadPickerProps) {
  const currentMode = value?.mode || 'ALL';
  const currentFields = new Set(
    value?.includeFields || ['id', 'event', 'timestamp', 'data.document_id'],
  );

  const handleModeChange = (mode: 'ALL' | 'CUSTOM') => {
    if (mode === 'ALL') {
      onChange({ mode: 'ALL' });
    } else {
      onChange({
        mode: 'CUSTOM',
        includeFields: Array.from(currentFields),
      });
    }
  };

  const toggleField = (fieldId: string) => {
    const next = new Set(currentFields);
    if (next.has(fieldId)) {
      next.delete(fieldId);
    } else {
      next.add(fieldId);
    }
    onChange({
      mode: 'CUSTOM',
      includeFields: Array.from(next),
    });
  };

  return (
    <div className="space-y-3 p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
      <div className="flex items-center space-x-2 text-sm font-medium text-slate-200">
        <Layers className="w-4 h-4 text-emerald-400" />
        <span>Payload Field Projection</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => handleModeChange('ALL')}
          className={`px-3 py-2 text-xs font-semibold rounded border transition text-left ${
            currentMode === 'ALL'
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="font-bold">ALL (Full Payload)</div>
          <div className="text-[11px] opacity-80 mt-0.5">
            Receive full envelope and standard event metadata
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleModeChange('CUSTOM')}
          className={`px-3 py-2 text-xs font-semibold rounded border transition text-left ${
            currentMode === 'CUSTOM'
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="font-bold">CUSTOM (Projected Fields)</div>
          <div className="text-[11px] opacity-80 mt-0.5">
            Select specific fields to minimize payload size
          </div>
        </button>
      </div>

      {currentMode === 'CUSTOM' && (
        <div className="mt-3 space-y-2 pt-2 border-t border-slate-800">
          <p className="text-xs text-slate-400">Select fields to project into webhook payloads:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {AVAILABLE_FIELDS.map((f) => {
              const isSelected = f.required || currentFields.has(f.id);
              return (
                <label
                  key={f.id}
                  className={`flex items-start space-x-2 p-2 rounded border text-xs cursor-pointer transition ${
                    isSelected
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-200'
                      : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={f.required}
                    onChange={() => toggleField(f.id)}
                    className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 bg-slate-900"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1.5 font-medium font-mono text-[11px]">
                      <span>{f.id}</span>
                      {f.required && (
                        <span className="text-[10px] bg-slate-800 px-1 py-0.2 rounded text-slate-400 font-sans">
                          mandatory
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{f.description}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
