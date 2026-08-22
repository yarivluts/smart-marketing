/**
 * A saved segment's filter shape (KAN-76, E22.2, plan `13 §13.13.2` "create_segment").
 * Deliberately minimal: a segment is a **definition** — a named, ANDed set of
 * conditions over one entity schema's fields. No query executor reads this
 * shape directly either — `segment.service.ts`'s `countSegmentMembers`
 * compiles it into SQL on demand, the same "config now, execution later"
 * split `MetricDefModel`/`BoardModel` already establish elsewhere in this
 * codebase. KAN-81 (E14.x, plan `14 §Gap 5`) layers a worklist — owner
 * assignment + status ticking (`SEGMENT_STATUSES` below) — on top of this
 * same definition, in `SegmentModel`; CRM-sync and AI-suggested lists (the
 * rest of Gap 5/9) remain out of scope.
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

/**
 * A segment's worklist status (KAN-81, E14.x, `docs/plan/14-gap-analysis.md`
 * Gap 5: "status ticking"). Lives here (not in
 * `packages/firebase-orm-models`) for the same reason `GoalDirection`/
 * `GoalRhythm` do (`goals/goal-progress.ts`): a client-safe status picker
 * (`SegmentWorklistControls`, `apps/web`) needs the vocabulary without
 * pulling `@growthos/firebase-orm-models`'s Firestore/`firebase-admin`
 * dependency chain into the browser bundle — the same bug KAN-57's own
 * `@growthos/shared/observability` subpath split was created to avoid.
 *
 * `new` is what every segment starts with — always assigned explicitly at
 * creation, the same "never left implicit" convention
 * `AutomationActionModel.status`'s own doc comment documents for its own
 * first state. `in_progress`/`done`/`dismissed` are purely human-driven
 * transitions (`updateSegmentWorklist`, `segment.service.ts`) — nothing
 * automatically ticks a segment's status based on its live warehouse
 * membership, which is computed completely separately by
 * `countSegmentMembers`.
 */
export const SEGMENT_STATUSES = ['new', 'in_progress', 'done', 'dismissed'] as const;
export type SegmentStatus = (typeof SEGMENT_STATUSES)[number];
