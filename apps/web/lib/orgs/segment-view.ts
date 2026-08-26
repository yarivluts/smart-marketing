import { schemaDefMapKey, type SchemaDefModel, type SegmentMemberCountOutcome, type SegmentMemberListOutcome, type SegmentMemberRow, type SegmentModel, type SchemaFieldDef } from '@growthos/firebase-orm-models';
import type { SegmentWorkListStatus } from '@growthos/shared';

/** A redaction placeholder standing in for any `is_pii` field's value — same fixed placeholder `record-feed-view.ts` uses for the same reason (never actually read the real value into a view that reaches the client). */
const REDACTED_VALUE = '••••••';

function stringifyPropertyValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

/** A segment's own list-page card — never sends the full `@arbel/firebase-orm` model instance to a client component. */
export interface SegmentSummaryView {
  id: string;
  name: string;
  schemaName: string;
  filterCount: number;
  /** KAN-93 — count of cross-schema `has_event`/`no_event` conditions ANDed alongside `filters`. */
  eventConditionCount: number;
  createdAt: string;
  ownerPersonId: string | null;
  status: SegmentWorkListStatus;
}

/** `owner_person_id`/`status`/`event_conditions` default to `null`/`'open'`/`[]` when absent — a segment saved before KAN-81/KAN-93 added these fields loads with them simply missing, never throws. */
export function toSegmentSummaryView(segment: SegmentModel): SegmentSummaryView {
  return {
    id: segment.id,
    name: segment.name,
    schemaName: segment.schema_name,
    filterCount: segment.filters.length,
    eventConditionCount: (segment.event_conditions ?? []).length,
    createdAt: segment.created_at,
    ownerPersonId: segment.owner_person_id ?? null,
    status: segment.status ?? 'open',
  };
}

/** Mirrors `GoalThermometerView`'s (`goal-view.ts`) ok/degraded-outcome split — a segment's member-count badge degrades the same way a goal thermometer does, rather than crashing the page, for the same expected-not-buggy failure modes. */
export type SegmentMemberCountView = { kind: 'ok'; count: number } | { kind: 'warehouse_not_configured' } | { kind: 'quota_exceeded' } | { kind: 'query_error' };

export function buildSegmentMemberCountView(outcome: SegmentMemberCountOutcome): SegmentMemberCountView {
  if (!outcome.ok) {
    return { kind: outcome.reason };
  }
  return { kind: 'ok', count: outcome.count };
}

export interface SegmentMemberFieldView {
  name: string;
  value: string;
  isPii: boolean;
}

/** One matching entity row, projected for the Segments page's own "view members" panel (KAN-107). Same "walk the schema's own declared field_defs, never read a PII field's real value into the view" posture `record-feed-view.ts`'s `toRecordFeedEntryView` establishes — `SegmentMemberRow.properties` is already a flat field map (the `entities` core table's `attributes` column, no ingest-envelope unwrapping needed, unlike a `RawRecordModel.payload`), so this is simpler than that sibling. */
export interface SegmentMemberEntryView {
  entityId: string;
  lastSeenAt: string;
  fields: SegmentMemberFieldView[];
}

export function toSegmentMemberEntryView(row: SegmentMemberRow, fieldDefs: readonly SchemaFieldDef[]): SegmentMemberEntryView {
  const properties = (row.properties ?? {}) as Record<string, unknown>;
  return {
    entityId: row.entityId,
    lastSeenAt: row.lastSeenAt,
    fields: fieldDefs.map((fieldDef) => ({
      name: fieldDef.name,
      value: fieldDef.is_pii ? REDACTED_VALUE : stringifyPropertyValue(properties[fieldDef.name]),
      isPii: fieldDef.is_pii,
    })),
  };
}

/** Mirrors `SegmentMemberCountView`'s exact ok/degraded-kind split for the same reason — a members panel degrades the same honest way a member-count badge does rather than crashing the page. */
export type SegmentMemberListView =
  | { kind: 'ok'; entries: SegmentMemberEntryView[] }
  | { kind: 'warehouse_not_configured' }
  | { kind: 'quota_exceeded' }
  | { kind: 'query_error' };

/** `activeSchemaDefsByKindAndName` is the same precomputed lookup `segments/page.tsx` already builds once per page load (`buildActiveSchemaDefsByKindAndName`) for the member-count fan-out — reused here rather than re-fetched, since the entity schema field_defs needed to redact PII are the same ones every other segment feature on this page already resolved. */
export function buildSegmentMemberListView(outcome: SegmentMemberListOutcome, activeSchemaDefsByKindAndName: ReadonlyMap<string, SchemaDefModel>): SegmentMemberListView {
  if (!outcome.ok) {
    return { kind: outcome.reason };
  }
  const fieldDefs = activeSchemaDefsByKindAndName.get(schemaDefMapKey('entity', outcome.schemaName))?.field_defs ?? [];
  return { kind: 'ok', entries: outcome.members.map((member) => toSegmentMemberEntryView(member, fieldDefs)) };
}
