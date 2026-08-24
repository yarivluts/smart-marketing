import type { RepCollectionBillingSignal, RepCollectionEntryModel, RepCollectionLeaderboardResult } from '@growthos/firebase-orm-models';
import type { RepCollectionType } from '@growthos/shared';

/**
 * A plain, serializable projection of one ledger entry (KAN-88) for the
 * rep-collections table — same "client components can only ever receive
 * plain data, never an `@arbel/firebase-orm` model instance" reasoning as
 * `toBillingOpsFeedEntryView`/`toIngestBatchView`.
 */
export interface RepCollectionEntryRow {
  id: string;
  orgPersonId: string | null;
  company: string;
  collectionType: RepCollectionType;
  planFrom: string | null;
  planTo: string | null;
  amount: number;
  occurredAt: string;
  note: string | null;
}

export function toRepCollectionEntryRow(entry: RepCollectionEntryModel): RepCollectionEntryRow {
  return {
    id: entry.id,
    orgPersonId: entry.org_person_id,
    company: entry.company,
    collectionType: entry.collection_type,
    planFrom: entry.plan_from ?? null,
    planTo: entry.plan_to ?? null,
    amount: entry.amount,
    occurredAt: entry.occurred_at,
    note: entry.note ?? null,
  };
}

/** Translation key for a collection type's own label — every caller must render through `t()`, never a hard-coded UI string (CLAUDE.md). */
export function repCollectionTypeLabelKey(collectionType: RepCollectionType): string {
  return `collectionType.${collectionType}`;
}

export interface RepCollectionLeaderboardRowView {
  orgPersonId: string;
  /** Falls back to the raw id if the person was since removed from the org's people registry — same "never blank, never crash" posture every other id-resolved view in this codebase takes. */
  name: string;
  totalAmount: number;
  entryCount: number;
}

export interface RepCollectionLeaderboardView {
  periodStart: string;
  periodEnd: string;
  rows: RepCollectionLeaderboardRowView[];
  unattributedTotal: number;
  unattributedCount: number;
}

/** Resolves a leaderboard's per-rep rows against the org's people registry — `peopleById` is built once per page render (`new Map(people.map((p) => [p.id, p.name]))`), the same "server-mapped plain data in, plain data out" join every other id-attached view in this codebase performs at the page layer rather than re-fetching per row. */
export function toRepCollectionLeaderboardView(result: RepCollectionLeaderboardResult, peopleById: ReadonlyMap<string, string>): RepCollectionLeaderboardView {
  return {
    periodStart: result.periodStart,
    periodEnd: result.periodEnd,
    rows: result.rows.map((row) => ({
      orgPersonId: row.orgPersonId,
      name: peopleById.get(row.orgPersonId) ?? row.orgPersonId,
      totalAmount: row.totalAmount,
      entryCount: row.entryCount,
    })),
    unattributedTotal: result.unattributedTotal,
    unattributedCount: result.unattributedCount,
  };
}

/** A plain projection of one billing-auto-suggest candidate (KAN-88) — passthrough shape, kept as its own named type so components never import `RepCollectionBillingSignal` (a firebase-orm-models type) directly. */
export interface RepCollectionBillingSignalRow {
  rawRecordId: string;
  amount: number;
  currency: string;
  customerId: string;
  occurredAt: string;
}

export function toRepCollectionBillingSignalRow(signal: RepCollectionBillingSignal): RepCollectionBillingSignalRow {
  return { ...signal };
}
