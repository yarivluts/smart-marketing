/**
 * A saved segment's work-list status (KAN-81, E14.x, plan `14 §Gap 5`): the
 * "live list" upgrade `segment-filter.ts`'s own doc comment flagged as a
 * separate, not-yet-scheduled Phase 2 epic — this is that epic's first
 * slice (owner assignment + status ticking; the live record feeds and
 * CRM-sync action plugin the same gap describes are still deferred). A
 * small closed set of states, the same "status enum, not free text"
 * posture `AutomationActionModel`/`OrchestrationRunModel` already use for
 * their own lifecycle tracking. Defaults to `'open'` at creation; ticked by
 * whoever's working the list.
 */
export const SEGMENT_WORK_LIST_STATUSES = ['open', 'in_progress', 'done'] as const;

export type SegmentWorkListStatus = (typeof SEGMENT_WORK_LIST_STATUSES)[number];

export function isSegmentWorkListStatus(value: unknown): value is SegmentWorkListStatus {
  return typeof value === 'string' && (SEGMENT_WORK_LIST_STATUSES as readonly string[]).includes(value);
}
