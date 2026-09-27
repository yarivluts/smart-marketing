import type { SupportLeaderboardResult } from '@growthos/firebase-orm-models';

/** One agent's resolved row in the leaderboard's plain-data client shape — never sends an `@arbel/firebase-orm` model instance to a client component. */
export interface SupportLeaderboardRowView {
  agentOrgPersonId: string;
  /** Falls back to the raw id if the person was since removed from the org's people registry — same "never blank, never crash" posture `toRepCollectionLeaderboardView` (KAN-88) takes. */
  name: string;
  photoUrl: string | null;
  ticketsResolved: number;
  avgFirstResponseSeconds: number | null;
  avgResolutionSeconds: number | null;
  avgCsatScore: number | null;
}

export interface SupportLeaderboardView {
  ticketsOpened: number;
  /** `null` when the read was capped, because the backlog subtraction is not computable from a recency window — see `SupportLeaderboardResult.openBacklog` (KAN-166). */
  openBacklog: number | null;
  /** Sorted highest-`ticketsResolved`-first. */
  rows: SupportLeaderboardRowView[];
  /** The record cap these numbers were computed under, or `null` when the read saw everything. Qualifies the ranking as well as the backlog. */
  sampledFrom: number | null;
}

/** The `Support` translation key whose message supplies the unit word for a {@link formatDurationSeconds} magnitude — same "helper returns a bare number/unit-key pair, the message string supplies the unit word" posture `formatMinutesAgo`/`freshnessLabel` (ingest-health) establish, so the unit itself is never a hard-coded literal outside translation resources. */
export type SupportDurationUnitKey = 'durationSeconds' | 'durationMinutes' | 'durationHours';

export interface SupportDurationView {
  value: number;
  unitKey: SupportDurationUnitKey;
}

/** Formats a duration for display: whole seconds under a minute, whole minutes under an hour, else hours to one decimal place. Returns a magnitude + translation-key pair rather than a pre-built string — the caller supplies the unit word via `t(unitKey, { value })`. */
export function formatDurationSeconds(seconds: number): SupportDurationView {
  if (seconds < 60) return { value: Math.round(seconds), unitKey: 'durationSeconds' };
  if (seconds < 3600) return { value: Math.round(seconds / 60), unitKey: 'durationMinutes' };
  return { value: Math.round((seconds / 3600) * 10) / 10, unitKey: 'durationHours' };
}

/** Resolves a leaderboard's per-agent rows against the org's people registry — `peopleById` is built once per page render (`new Map(people.map((p) => [p.id, {name: p.name, photoUrl: p.photo_url ?? null}]))`), the same "server-mapped plain data in, plain data out" join `toRepCollectionLeaderboardView` performs at the page layer rather than re-fetching per row. */
export function toSupportLeaderboardView(
  result: SupportLeaderboardResult,
  peopleById: ReadonlyMap<string, { name: string; photoUrl: string | null }>,
): SupportLeaderboardView {
  return {
    ticketsOpened: result.ticketsOpened,
    openBacklog: result.openBacklog,
    sampledFrom: result.sampledFrom,
    rows: result.rows.map((row) => {
      const person = peopleById.get(row.agentOrgPersonId);
      return {
        agentOrgPersonId: row.agentOrgPersonId,
        name: person?.name ?? row.agentOrgPersonId,
        photoUrl: person?.photoUrl ?? null,
        ticketsResolved: row.ticketsResolved,
        avgFirstResponseSeconds: row.avgFirstResponseSeconds,
        avgResolutionSeconds: row.avgResolutionSeconds,
        avgCsatScore: row.avgCsatScore,
      };
    }),
  };
}

export interface SupportTeamSummary {
  /** Tickets resolved by an attributed agent - resolutions with no agent are not in any row. */
  ticketsResolved: number;
  /** The agent with the fastest average first response, or `null` when no agent has one. */
  fastestFirstResponse: { name: string; seconds: number } | null;
  /** The agent with the highest average CSAT, or `null` when no agent has a CSAT score. */
  topCsat: { name: string; score: number } | null;
}

/**
 * Team-level headline numbers derived only from the per-agent rows. Deliberately no "team average"
 * first response or CSAT: the rows carry per-agent averages without their sample sizes, so any
 * blend of them would be a made-up weighting. Best-agent values are exact.
 */
export function toSupportTeamSummary(rows: readonly SupportLeaderboardRowView[]): SupportTeamSummary {
  let fastestFirstResponse: SupportTeamSummary['fastestFirstResponse'] = null;
  let topCsat: SupportTeamSummary['topCsat'] = null;
  for (const row of rows) {
    if (row.avgFirstResponseSeconds !== null && (fastestFirstResponse === null || row.avgFirstResponseSeconds < fastestFirstResponse.seconds)) {
      fastestFirstResponse = { name: row.name, seconds: row.avgFirstResponseSeconds };
    }
    if (row.avgCsatScore !== null && (topCsat === null || row.avgCsatScore > topCsat.score)) {
      topCsat = { name: row.name, score: row.avgCsatScore };
    }
  }
  return { ticketsResolved: rows.reduce((sum, row) => sum + row.ticketsResolved, 0), fastestFirstResponse, topCsat };
}
