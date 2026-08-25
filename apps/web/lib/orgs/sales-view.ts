import type { DemoFunnelResult } from '@growthos/firebase-orm-models';

/** One rep's held/no-show breakdown in the funnel's plain-data client shape — never sends an `@arbel/firebase-orm` model instance to a client component. */
export interface DemoFunnelRepRowView {
  repOrgPersonId: string;
  /** Falls back to the raw id if the person was since removed from the org's people registry — same "never blank, never crash" posture `toSupportLeaderboardView` (KAN-90) takes. */
  name: string;
  photoUrl: string | null;
  demosHeld: number;
  demosNoShow: number;
  /** `demosHeld / (demosHeld + demosNoShow)`, or `null` when neither has happened yet for this rep. */
  showRate: number | null;
}

export interface DemoFunnelView {
  demosScheduled: number;
  demosHeld: number;
  demosNoShow: number;
  /** Project-wide `demosHeld / (demosHeld + demosNoShow)`, or `null` when neither has happened yet. */
  showRate: number | null;
  /** Sorted highest-`demosHeld`-first. */
  rows: DemoFunnelRepRowView[];
}

/** Resolves a funnel's per-rep rows against the org's people registry — `peopleById` is built once per page render, the same "server-mapped plain data in, plain data out" join `toSupportLeaderboardView` performs at the page layer rather than re-fetching per row. */
export function toDemoFunnelView(
  result: DemoFunnelResult,
  peopleById: ReadonlyMap<string, { name: string; photoUrl: string | null }>,
): DemoFunnelView {
  return {
    demosScheduled: result.demosScheduled,
    demosHeld: result.demosHeld,
    demosNoShow: result.demosNoShow,
    showRate: result.showRate,
    rows: result.rows.map((row) => {
      const person = peopleById.get(row.repOrgPersonId);
      return {
        repOrgPersonId: row.repOrgPersonId,
        name: person?.name ?? row.repOrgPersonId,
        photoUrl: person?.photoUrl ?? null,
        demosHeld: row.demosHeld,
        demosNoShow: row.demosNoShow,
        showRate: row.showRate,
      };
    }),
  };
}
