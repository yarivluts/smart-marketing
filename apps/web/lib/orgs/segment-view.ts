import type { SegmentMemberCountOutcome, SegmentModel } from '@growthos/firebase-orm-models';
import type { SegmentWorkListStatus } from '@growthos/shared';

/** A segment's own list-page card — never sends the full `@arbel/firebase-orm` model instance to a client component. */
export interface SegmentSummaryView {
  id: string;
  name: string;
  schemaName: string;
  filterCount: number;
  createdAt: string;
  ownerPersonId: string | null;
  status: SegmentWorkListStatus;
}

/** `owner_person_id`/`status` default to `null`/`'open'` when absent — a segment saved before KAN-81 added these fields loads with them simply missing, never throws. */
export function toSegmentSummaryView(segment: SegmentModel): SegmentSummaryView {
  return {
    id: segment.id,
    name: segment.name,
    schemaName: segment.schema_name,
    filterCount: segment.filters.length,
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
