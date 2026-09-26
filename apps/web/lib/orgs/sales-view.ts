import type { DemoFunnelResult } from '@growthos/firebase-orm-models';
import type { FlowEdgeSpec, FlowNodeSpec } from '@/components/viz';

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
  /**
   * The record cap these numbers were computed under, or `null` when the read
   * saw every landed `demo_event`. Carried through to the page so a sampled
   * funnel can say so rather than render as the project's totals (KAN-164).
   */
  sampledFrom: number | null;
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
    sampledFrom: result.sampledFrom,
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

export interface DemoFlowLabels {
  scheduled: string;
  held: string;
  noShow: string;
  /** The share of outcomes an edge carries, e.g. "75% of outcomes". */
  shareOfOutcomes: (percent: number) => string;
  formatCount: (value: number) => string;
  /** An edge's percentage label, e.g. "75%". */
  percent: (percent: number) => string;
}

/**
 * The demo pipeline as a flow: every scheduled demo ends held or no-show, so the two edges out of
 * "Scheduled" carry each outcome's share of the demos that reached an outcome. Only stages the
 * `demo_event` schema actually records are drawn - there is no "converted" stage in the data, so the
 * diagram does not pretend to know one. A no-show node turns amber when any demo was missed.
 */
export function buildDemoFlow(funnel: Pick<DemoFunnelView, 'demosScheduled' | 'demosHeld' | 'demosNoShow'>, labels: DemoFlowLabels): { nodes: FlowNodeSpec[]; edges: FlowEdgeSpec[] } {
  const outcomes = funnel.demosHeld + funnel.demosNoShow;
  const share = (value: number) => (outcomes > 0 ? Math.round((value / outcomes) * 100) : null);
  const heldShare = share(funnel.demosHeld);
  const noShowShare = share(funnel.demosNoShow);
  return {
    nodes: [
      { id: 'scheduled', label: labels.scheduled, value: labels.formatCount(funnel.demosScheduled), status: funnel.demosScheduled > 0 ? 'ok' : 'idle' },
      {
        id: 'held',
        label: labels.held,
        value: labels.formatCount(funnel.demosHeld),
        sublabel: heldShare !== null ? labels.shareOfOutcomes(heldShare) : undefined,
        status: funnel.demosHeld > 0 ? 'ok' : 'idle',
      },
      {
        id: 'no_show',
        label: labels.noShow,
        value: labels.formatCount(funnel.demosNoShow),
        sublabel: noShowShare !== null ? labels.shareOfOutcomes(noShowShare) : undefined,
        status: funnel.demosNoShow > 0 ? 'warn' : 'idle',
      },
    ],
    edges: [
      { source: 'scheduled', target: 'held', label: heldShare !== null ? labels.percent(heldShare) : undefined, status: funnel.demosHeld > 0 ? 'ok' : 'idle', animated: funnel.demosHeld > 0 },
      { source: 'scheduled', target: 'no_show', label: noShowShare !== null ? labels.percent(noShowShare) : undefined, status: funnel.demosNoShow > 0 ? 'warn' : 'idle' },
    ],
  };
}
