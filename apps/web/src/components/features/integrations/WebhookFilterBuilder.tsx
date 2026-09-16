'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Filter } from 'lucide-react';

export interface FilterRule {
  id: string;
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'in';
  value: string;
}

interface WebhookFilterBuilderProps {
  initialRules?: Record<string, unknown>;
  onChange: (rulesRecord: Record<string, unknown> | undefined) => void;
}

const COMMON_FIELDS = [
  { label: 'Document Folder', value: 'data.folder' },
  { label: 'Document Status', value: 'data.status' },
  { label: 'MIME Type', value: 'data.mime_type' },
  { label: 'Recipient Email', value: 'data.recipient_email' },
  { label: 'Document Title', value: 'data.document_name' },
];

export type FilterOperator = FilterRule['operator'];

export function WebhookFilterBuilder({ initialRules, onChange }: WebhookFilterBuilderProps) {
  // Convert AST record into editable rule rows
  const [rules, setRules] = useState<FilterRule[]>(() => {
    if (!initialRules || Object.keys(initialRules).length === 0) return [];
    return Object.entries(initialRules).map(([field, condition], index) => {
      if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
        const [op, val] = Object.entries(condition)[0] || ['eq', ''];
        return {
          id: `rule-${index}-${Date.now()}`,
          field,
          operator: (op as FilterOperator) || 'eq',
          value: Array.isArray(val) ? val.join(', ') : String(val ?? ''),
        };
      }
      return {
        id: `rule-${index}-${Date.now()}`,
        field,
        operator: 'eq',
        value: String(condition ?? ''),
      };
    });
  });

  const syncRules = (updatedRules: FilterRule[]) => {
    setRules(updatedRules);
    if (updatedRules.length === 0) {
      onChange(undefined);
      return;
    }

    const astRecord: Record<string, unknown> = {};
    for (const r of updatedRules) {
      if (!r.field.trim()) continue;
      if (r.operator === 'eq') {
        astRecord[r.field.trim()] = { eq: r.value.trim() };
      } else if (r.operator === 'neq') {
        astRecord[r.field.trim()] = { neq: r.value.trim() };
      } else if (r.operator === 'contains') {
        astRecord[r.field.trim()] = { contains: r.value.trim() };
      } else if (r.operator === 'in') {
        const items = r.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        astRecord[r.field.trim()] = { in: items };
      }
    }
    onChange(Object.keys(astRecord).length > 0 ? astRecord : undefined);
  };

  const addRule = () => {
    const newRule: FilterRule = {
      id: `rule-${Date.now()}`,
      field: 'data.folder',
      operator: 'eq',
      value: '',
    };
    syncRules([...rules, newRule]);
  };

  const updateRule = (id: string, updates: Partial<FilterRule>) => {
    const updated = rules.map((r) => (r.id === id ? { ...r, ...updates } : r));
    syncRules(updated);
  };

  const removeRule = (id: string) => {
    const filtered = rules.filter((r) => r.id !== id);
    syncRules(filtered);
  };

  return (
    <div className="space-y-3 p-4 bg-slate-900/50 border border-slate-800 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 text-sm font-medium text-slate-200">
          <Filter className="w-4 h-4 text-emerald-400" />
          <span>Event Filtering Rules (AST Predicate)</span>
        </div>
        <button
          type="button"
          onClick={addRule}
          className="inline-flex items-center space-x-1 text-xs font-semibold px-2.5 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-600/30 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Rule</span>
        </button>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Only events satisfying ALL rules will be dispatched. Leave empty to receive all matching events.
      </p>

      {rules.length === 0 ? (
        <div className="py-4 text-center border border-dashed border-slate-800 rounded text-xs text-slate-500">
          No active filter rules. All subscribed events are delivered.
        </div>
      ) : (
        <div className="space-y-2.5">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center space-x-2 bg-slate-950/60 p-2.5 rounded border border-slate-800/80">
              <input
                type="text"
                list="common-fields"
                value={rule.field}
                onChange={(e) => updateRule(rule.id, { field: e.target.value })}
                placeholder="Field (e.g. data.folder)"
                className="w-1/3 px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
              <datalist id="common-fields">
                {COMMON_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </datalist>

              <select
                value={rule.operator}
                onChange={(e) => updateRule(rule.id, { operator: e.target.value as FilterOperator })}
                className="w-1/4 px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="eq">Equals (==)</option>
                <option value="neq">Not Equals (!=)</option>
                <option value="contains">Contains</option>
                <option value="in">In (comma-separated)</option>
              </select>

              <input
                type="text"
                value={rule.value}
                onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                placeholder={rule.operator === 'in' ? 'value1, value2' : 'Value'}
                className="flex-1 px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-emerald-500"
              />

              <button
                type="button"
                onClick={() => removeRule(rule.id)}
                className="p-1.5 text-slate-400 hover:text-rose-400 transition rounded"
                title="Remove rule"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
