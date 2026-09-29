/**
 * Webhook AST Filter Evaluation and Payload Field Projection (INK-162, INK-164).
 */

export interface FilterPredicate {
  field: string;
  op: 'eq' | 'neq' | 'in' | 'nin' | 'contains' | 'exists';
  value?: unknown;
}

export interface FilterGroup {
  and?: (FilterPredicate | FilterGroup)[];
  or?: (FilterPredicate | FilterGroup)[];
}

export type FilterRuleTree = FilterPredicate | FilterGroup | Record<string, unknown>;

export interface PayloadProjectionConfig {
  mode: 'ALL' | 'CUSTOM';
  includeFields?: string[];
}

export class WebhookFilterService {
  /**
   * Resolves dot-separated object path like "data.folder" or "folder".
   */
  static resolvePath(target: any, path: string): unknown {
    if (!target || typeof target !== 'object') return undefined;

    // Direct match
    if (path in target) return target[path];

    // Strip leading "data." if accessing plain data object directly
    if (path.startsWith('data.')) {
      const stripped = path.substring(5);
      if (stripped in target) return target[stripped];
    }

    const parts = path.split('.');
    let curr = target;
    for (const p of parts) {
      if (curr === null || curr === undefined || typeof curr !== 'object') return undefined;
      curr = curr[p];
    }
    return curr;
  }

  /**
   * Evaluates an AST filter tree against canonical event data or envelope.
   */
  static evaluateFilter(
    rule: FilterRuleTree | null | undefined,
    data: Record<string, unknown>,
    depth: number = 0,
  ): boolean {
    if (!rule || Object.keys(rule).length === 0) {
      return true;
    }

    if (depth > 5) {
      // Guard against deeply nested recursive structures
      return false;
    }

    // Check if predicate: { field, op, value }
    if ('field' in rule && 'op' in rule) {
      return this.evaluatePredicate(rule as FilterPredicate, data);
    }

    // Check if group: { and: [...] } / { or: [...] }
    const group = rule as FilterGroup;
    if (Array.isArray(group.and)) {
      return group.and.every((sub) => this.evaluateFilter(sub, data, depth + 1));
    }
    if (Array.isArray(group.or)) {
      return group.or.some((sub) => this.evaluateFilter(sub, data, depth + 1));
    }

    // Map style from UI: { 'data.folder': { eq: 'Finance' }, ... }
    for (const [field, condition] of Object.entries(rule)) {
      const actualVal = this.resolvePath(data, field);

      if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
        for (const [op, expectedVal] of Object.entries(condition as Record<string, unknown>)) {
          const pass = this.evaluateOp(op, actualVal, expectedVal);
          if (!pass) return false;
        }
      } else {
        if (actualVal !== condition) return false;
      }
    }

    return true;
  }

  /**
   * Alias for matching an envelope or data object against filter rules.
   */
  static matchesFilter(envelopeOrData: any, rules?: FilterRuleTree | null): boolean {
    return this.evaluateFilter(rules, envelopeOrData);
  }

  private static evaluateOp(op: string, actualVal: unknown, expectedVal: unknown): boolean {
    switch (op) {
      case 'eq':
        return actualVal === expectedVal;
      case 'neq':
        return actualVal !== expectedVal;
      case 'in':
        return Array.isArray(expectedVal) && expectedVal.includes(actualVal);
      case 'nin':
        return Array.isArray(expectedVal) && !expectedVal.includes(actualVal);
      case 'contains':
        return (
          typeof actualVal === 'string' &&
          typeof expectedVal === 'string' &&
          actualVal.includes(expectedVal)
        );
      case 'exists':
        return actualVal !== undefined && actualVal !== null;
      default:
        return false;
    }
  }

  private static evaluatePredicate(pred: FilterPredicate, data: Record<string, unknown>): boolean {
    const actualVal = this.resolvePath(data, pred.field);
    return this.evaluateOp(pred.op, actualVal, pred.value);
  }

  /**
   * Projects event data fields based on subscription projection config (INK-164).
   */
  static projectPayload(
    payload: any,
    projection?: PayloadProjectionConfig | null,
  ): Record<string, unknown> {
    if (!projection || projection.mode !== 'CUSTOM' || !Array.isArray(projection.includeFields)) {
      return { ...payload };
    }

    const isEnvelope = 'id' in payload && 'event' in payload && 'timestamp' in payload;
    const allowed = new Set(projection.includeFields);

    if (isEnvelope) {
      const projected: Record<string, unknown> = {};

      // Top-level envelope fields
      for (const key of Object.keys(payload)) {
        if (key !== 'data') {
          if (allowed.has(key)) {
            projected[key] = payload[key];
          }
        }
      }

      // Envelope data fields
      if (payload.data && typeof payload.data === 'object') {
        const sourceData = payload.data as Record<string, unknown>;
        const projectedData: Record<string, unknown> = {};

        for (const [k, v] of Object.entries(sourceData)) {
          if (allowed.has(`data.${k}`) || allowed.has(k)) {
            projectedData[k] = v;
          }
        }
        projected.data = projectedData;
      }

      return projected;
    }

    // Direct plain event data object
    const projected: Record<string, unknown> = {};
    for (const field of allowed) {
      const cleanField = field.startsWith('data.') ? field.substring(5) : field;
      if (payload[cleanField] !== undefined) {
        projected[cleanField] = payload[cleanField];
      }
    }
    return projected;
  }
}
