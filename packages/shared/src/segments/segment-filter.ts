/**
 * A saved segment's filter shape (KAN-76, E22.2, plan `13 §13.13.2` "create_segment").
 * Deliberately minimal: a segment is a **definition** — a named, ANDed set of
 * conditions over one entity schema's fields — not a live, materialized list
 * with owner/status/CRM-sync (that fuller "work list" feature is plan
 * `14 §Gap 5`, a separate, not-yet-scheduled Phase 2 epic; nothing here
 * builds toward it). No query executor reads this shape yet either — same
 * "config now, execution later" split `MetricDefModel`/`BoardModel` already
 * establish elsewhere in this codebase.
 */

export const SEGMENT_FILTER_OPERATORS = ['=', '!=', '>', '>=', '<', '<=', 'contains'] as const;

export type SegmentFilterOperator = (typeof SEGMENT_FILTER_OPERATORS)[number];

export function isSegmentFilterOperator(value: unknown): value is SegmentFilterOperator {
  return typeof value === 'string' && (SEGMENT_FILTER_OPERATORS as readonly string[]).includes(value);
}

export interface SegmentFilterCondition {
  field: string;
  op: SegmentFilterOperator;
  value: string | number | boolean;
}

/** Structural validation only — whether `field` is actually a real, declared field on the target entity schema is checked against the schema registry by the caller (`segment.service.ts`), not here. */
export function isValidSegmentFilterCondition(value: unknown): value is SegmentFilterCondition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.field !== 'string' || candidate.field.trim().length === 0) {
    return false;
  }
  if (!isSegmentFilterOperator(candidate.op)) {
    return false;
  }
  const valueType = typeof candidate.value;
  return valueType === 'string' || valueType === 'number' || valueType === 'boolean';
}
