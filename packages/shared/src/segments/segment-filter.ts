/**
 * A saved segment's filter shape (KAN-76, E22.2, plan `13 §13.13.2` "create_segment").
 * Deliberately minimal: a segment is a **definition** — a named, ANDed set of
 * conditions over one entity schema's fields. The fuller "work list" feature
 * plan `14 §Gap 5` describes (owner assignment + status, live record feeds,
 * CRM-sync) is KAN-81 — see `segment-work-list.ts` for the owner/status slice
 * of it now built on top of this definition; the live record feeds and
 * CRM-sync action plugin are still deferred.
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

/**
 * A saved filter's `field` gets compiled straight into a SQL identifier /
 * JSON-subscript key by `segment.service.ts`'s `countSegmentMembers` — the
 * same "letters/digits/underscore only" identifier-safety posture
 * `packages/shared`'s own metrics compiler applies to every compiled column
 * reference. Enforcing it here (not only at read/compile time) means a
 * segment with an unsafe field name can never be *saved* in the first
 * place, so a later count/query never has to fail on already-persisted
 * data — `createSegment`'s "collect every validation failure" pass folds
 * an unsafe field name into the exact same `InvalidSegmentError` a missing
 * name or unknown operator already produces.
 */
const SAFE_SEGMENT_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Structural validation only — whether `field` is actually a real, declared field on the target entity schema is checked against the schema registry by the caller (`segment.service.ts`), not here. */
export function isValidSegmentFilterCondition(value: unknown): value is SegmentFilterCondition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.field !== 'string' || !SAFE_SEGMENT_FIELD_PATTERN.test(candidate.field)) {
    return false;
  }
  if (!isSegmentFilterOperator(candidate.op)) {
    return false;
  }
  const valueType = typeof candidate.value;
  return valueType === 'string' || valueType === 'number' || valueType === 'boolean';
}
