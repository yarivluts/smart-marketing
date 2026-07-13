import type { SegmentModel } from '@growthos/firebase-orm-models';

/** A segment's own list-page card — never sends the full `@arbel/firebase-orm` model instance to a client component. */
export interface SegmentSummaryView {
  id: string;
  name: string;
  schemaName: string;
  filterCount: number;
  createdAt: string;
}

export function toSegmentSummaryView(segment: SegmentModel): SegmentSummaryView {
  return {
    id: segment.id,
    name: segment.name,
    schemaName: segment.schema_name,
    filterCount: segment.filters.length,
    createdAt: segment.created_at,
  };
}
