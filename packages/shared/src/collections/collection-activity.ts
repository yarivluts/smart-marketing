/**
 * A rep-attributed collections activity ledger entry's kind (KAN-88, E20.x,
 * plan `14 §Gap 13`'s "activity ledger" — the log of touches a rep made
 * toward collecting on a customer's account). A small closed set, the same
 * "status enum, not free text" posture `SEGMENT_WORK_LIST_STATUSES` already
 * establishes for this codebase's other work-list-shaped features.
 */
export const COLLECTION_ACTIVITY_TYPES = ['call', 'email', 'note', 'payment_followup', 'payment_collected'] as const;

export type CollectionActivityType = (typeof COLLECTION_ACTIVITY_TYPES)[number];

export function isCollectionActivityType(value: unknown): value is CollectionActivityType {
  return typeof value === 'string' && (COLLECTION_ACTIVITY_TYPES as readonly string[]).includes(value);
}
