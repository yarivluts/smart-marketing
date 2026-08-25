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

/**
 * A cross-schema condition (KAN-93, plan `14 §Gap 9`'s own "paying_no_demo"
 * example, `demos/page.tsx`'s doc comment): a segment's entity filters above
 * only ever look at the segment's own `schemaName` entity — this expresses
 * "has (or has never had) a matching *event*, in some other registered
 * event schema" instead, e.g. "no `demo_event`" or "has a
 * `support_ticket_event`". `has_event`/`no_event` join on the entity's own
 * id (an event's `client_id`/`entity_id` is expected to already be the same
 * identity a customer entity is keyed by — the same convention
 * `bridge_identity`/`fact_attribution` already rely on), never on a
 * denormalized field a connector would otherwise have to populate.
 */
export const SEGMENT_EVENT_CONDITION_KINDS = ['has_event', 'no_event'] as const;

export type SegmentEventConditionKind = (typeof SEGMENT_EVENT_CONDITION_KINDS)[number];

export function isSegmentEventConditionKind(value: unknown): value is SegmentEventConditionKind {
  return typeof value === 'string' && (SEGMENT_EVENT_CONDITION_KINDS as readonly string[]).includes(value);
}

export interface SegmentEventCondition {
  kind: SegmentEventConditionKind;
  /** Must reference an active `event`-kind `SchemaDefModel.name` in the same project — validated in `segment.service.ts`, not here, same split `SegmentModel.schema_name`'s own doc comment describes for the entity side. */
  schemaName: string;
  /** Optional ANDed field filters over the event schema's own `properties` — reuses {@link SegmentFilterCondition}'s exact shape so `segment.service.ts` compiles both with one shared code path. */
  filters?: SegmentFilterCondition[];
  /** Optional lookback window in whole days — the event must have occurred within the last N days. Omit for "ever". */
  withinDays?: number;
}

/** Structural validation only, mirroring {@link isValidSegmentFilterCondition}'s own split — `schemaName` existence/kind and each nested filter's field are re-checked by the caller against the schema registry. */
export function isValidSegmentEventCondition(value: unknown): value is SegmentEventCondition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (!isSegmentEventConditionKind(candidate.kind)) {
    return false;
  }
  if (typeof candidate.schemaName !== 'string' || candidate.schemaName.trim().length === 0) {
    return false;
  }
  if (candidate.filters !== undefined) {
    if (!Array.isArray(candidate.filters) || !candidate.filters.every((filter) => isValidSegmentFilterCondition(filter))) {
      return false;
    }
  }
  if (candidate.withinDays !== undefined) {
    if (typeof candidate.withinDays !== 'number' || !Number.isInteger(candidate.withinDays) || candidate.withinDays <= 0) {
      return false;
    }
  }
  return true;
}
