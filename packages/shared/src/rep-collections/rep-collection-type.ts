/**
 * The "how" on a rep-attributed collections ledger entry (KAN-88, E20.x,
 * plan `14 §Gap 13`'s "Account Manager, Company, plan From->To, How, When,
 * Collection"). A small closed set, the same "status enum, not free text"
 * posture `SEGMENT_WORK_LIST_STATUSES` already establishes for its own
 * ledger-adjacent field.
 */
export const REP_COLLECTION_TYPES = ['upgrade', 'expansion', 'save', 'renewal', 'other'] as const;

export type RepCollectionType = (typeof REP_COLLECTION_TYPES)[number];

export function isRepCollectionType(value: unknown): value is RepCollectionType {
  return typeof value === 'string' && (REP_COLLECTION_TYPES as readonly string[]).includes(value);
}
