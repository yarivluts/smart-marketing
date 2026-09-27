import type { ProjectCostQuota, ProjectQueryQuotaStatus, QueryCostLogEntryModel, QueryCostLogOutcome } from '@growthos/firebase-orm-models';

/**
 * A plain, serializable projection of a project's effective cost-guardrail
 * quota (KAN-39). Client components can only ever receive plain data across
 * the RSC boundary, never an `@arbel/firebase-orm` model instance — same
 * reasoning as `toOrchestrationRunView`.
 */
export interface ProjectCostQuotaView {
  dailyQueryLimit: number;
  labels: Record<string, string>;
  setAt: string | null;
}

export function toProjectCostQuotaView(quota: ProjectCostQuota): ProjectCostQuotaView {
  return { dailyQueryLimit: quota.dailyQueryLimit, labels: quota.labels, setAt: quota.setAt };
}

export interface QueryCostLogEntryView {
  id: string;
  outcome: QueryCostLogOutcome;
  definitionRefs: Record<string, string>;
  executedAt: string;
  estimatedCostUsd: number | null;
}

export function toQueryCostLogEntryView(entry: QueryCostLogEntryModel): QueryCostLogEntryView {
  return {
    id: entry.id,
    outcome: entry.outcome,
    definitionRefs: entry.definition_refs,
    executedAt: entry.executed_at,
    estimatedCostUsd: entry.estimated_cost_usd ?? null,
  };
}

/**
 * A single query's estimated dollar cost is typically a small fraction of a
 * cent (BigQuery's on-demand price is $6.25 per TiB scanned, and most
 * GrowthOS metric queries scan far less than a TiB), so this keeps four
 * decimal places rather than the usual two — two would round almost every
 * real entry down to "$0.00", which reads as "free" rather than "small".
 */
export function formatEstimatedCostUsd(estimatedCostUsd: number): string {
  return `$${estimatedCostUsd.toFixed(4)}`;
}

/** The `CostGuardrails` translation key for one cost-log entry's outcome label. */
const OUTCOME_LABEL_KEYS: Record<QueryCostLogOutcome, 'outcomeExecuted' | 'outcomeBlockedQuotaExceeded' | 'outcomeWarehouseNotConfigured'> = {
  executed: 'outcomeExecuted',
  blocked_quota_exceeded: 'outcomeBlockedQuotaExceeded',
  warehouse_not_configured: 'outcomeWarehouseNotConfigured',
};

export function outcomeLabelKey(
  outcome: QueryCostLogOutcome,
): 'outcomeExecuted' | 'outcomeBlockedQuotaExceeded' | 'outcomeWarehouseNotConfigured' {
  return OUTCOME_LABEL_KEYS[outcome];
}

export function formatLabels(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

/**
 * One `key=value` label per line — the quota form's textarea input format.
 * Deliberately separate from {@link formatLabels} (which joins with `, ` for
 * the page's inline display): a label value may itself legitimately contain
 * the substring `, ` (labels are free-form, per `ProjectCostQuotaModel`'s own
 * doc comment), so building the textarea's initial value by string-replacing
 * `formatLabels`'s `, ` separator with a newline would corrupt any such
 * value instead of only splitting between entries.
 */
export function labelsToLines(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

/**
 * Parses the quota form's free-form `key=value` per-line labels input into a
 * record, skipping blank lines. Malformed lines (no `=`) are dropped rather
 * than rejected — labels are purely descriptive metadata (see
 * `ProjectCostQuotaModel`'s own doc comment), so a typo here shouldn't block
 * the whole quota update the way an invalid `dailyQueryLimit` does.
 */
export function parseLabelsInput(input: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const line of input.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key) {
      labels[key] = value;
    }
  }
  return labels;
}

export type { ProjectQueryQuotaStatus };

/** What a set of logged entries cost, and how much of the set that figure actually covers. */
export interface LoggedCostSummary {
  /** Sum over the entries that carry an estimate. 0 when none do - read `entriesWithCost` first. */
  totalUsd: number;
  entriesWithCost: number;
  totalEntries: number;
  /** True when some entries carry no estimate, so `totalUsd` understates the real spend. */
  isPartial: boolean;
}

/**
 * Totals the estimated cost of logged queries.
 *
 * An entry has no estimate when it ran on an executor that does not report bytes processed
 * (DuckDB in development) or when it never executed at all (a blocked or failed attempt). Those
 * contribute nothing, so the total is a lower bound whenever `isPartial` is true - which the
 * caller must say out loud. A spend figure that silently omits some of its inputs is worse than
 * showing no figure, because it reads as complete and gets budgeted against.
 */
export function summariseLoggedCost(entries: readonly QueryCostLogEntryView[]): LoggedCostSummary {
  const withCost = entries.filter((entry) => entry.estimatedCostUsd !== null);
  return {
    totalUsd: withCost.reduce((total, entry) => total + (entry.estimatedCostUsd ?? 0), 0),
    entriesWithCost: withCost.length,
    totalEntries: entries.length,
    isPartial: withCost.length > 0 && withCost.length < entries.length,
  };
}

export interface CostLogDay {
  /** UTC calendar day, `YYYY-MM-DD`. */
  day: string;
  executed: number;
  blocked_quota_exceeded: number;
  warehouse_not_configured: number;
  /** Sum of the day's estimates; entries without one add nothing (see {@link summariseLoggedCost}). */
  estimatedCostUsd: number;
}

export interface CostLogBreakdown {
  byOutcome: Record<QueryCostLogOutcome, number>;
  /** Attempts per UTC day that has any, oldest first. */
  byDay: CostLogDay[];
  /** How often each metric definition was queried across the entries, most frequent first. */
  topDefinitions: { definition: string; count: number }[];
}

/** Shapes the listed cost-log entries for the page's charts - over exactly the entries listed. */
export function breakdownCostLog(entries: readonly QueryCostLogEntryView[]): CostLogBreakdown {
  const byOutcome: Record<QueryCostLogOutcome, number> = { executed: 0, blocked_quota_exceeded: 0, warehouse_not_configured: 0 };
  const byDay = new Map<string, CostLogDay>();
  const definitions = new Map<string, number>();
  for (const entry of entries) {
    byOutcome[entry.outcome] += 1;
    const day = entry.executedAt.slice(0, 10);
    const row = byDay.get(day) ?? { day, executed: 0, blocked_quota_exceeded: 0, warehouse_not_configured: 0, estimatedCostUsd: 0 };
    row[entry.outcome] += 1;
    row.estimatedCostUsd += entry.estimatedCostUsd ?? 0;
    byDay.set(day, row);
    for (const definition of Object.values(entry.definitionRefs)) {
      definitions.set(definition, (definitions.get(definition) ?? 0) + 1);
    }
  }
  return {
    byOutcome,
    byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    topDefinitions: [...definitions.entries()].map(([definition, count]) => ({ definition, count })).sort((a, b) => b.count - a.count || a.definition.localeCompare(b.definition)),
  };
}

/** Today's quota use as a whole percentage of the limit, capped at 100; 0 when the limit is 0. */
export function quotaUsagePct(status: { attemptedToday: number; limit: number }): number {
  if (status.limit <= 0) return 0;
  return Math.min(100, Math.round((status.attemptedToday / status.limit) * 100));
}
