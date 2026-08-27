import type { CohortRetentionOutcome, CohortRetentionRow } from '@growthos/firebase-orm-models';

export interface CohortRetentionPeriodView {
  periodNumber: number;
  retainedCount: number;
  retentionRatePercent: number;
}

export interface CohortRetentionCohortView {
  cohortMonth: string;
  cohortSize: number;
  periods: CohortRetentionPeriodView[];
}

/**
 * Mirrors `CustomerSearchView`'s exact ok/degraded-kind split for the same reason — a retention-matrix
 * table degrades the same honest way the Customers search panel does rather than crashing the page.
 * `periodNumbers` is every distinct period across every cohort, ascending — a fixed column header set
 * so the page's table can render a cell (or a blank, for a cohort not yet old enough to have reached a
 * later period) per column without every cohort needing to share the exact same period list.
 */
export type CohortRetentionView =
  | { kind: 'ok'; cohorts: CohortRetentionCohortView[]; periodNumbers: number[] }
  | { kind: 'warehouse_not_configured' }
  | { kind: 'quota_exceeded' }
  | { kind: 'query_error' };

/**
 * Groups `queryProjectCohortRetention`'s flat `{ cohortMonth, periodNumber, ... }` rows (already
 * ordered `cohort_month DESC, period_number ASC` by the underlying SQL) into one row per cohort month
 * for the Cohort Retention page's table — a cohort's own `cohortSize` is read off its first row (every
 * row for one `cohortMonth` shares the same `cohortSize`, `fact_cohort_retention`'s own grain), and
 * each period's `retentionRate` fraction is rounded to a whole-number percentage for display, the same
 * "round only at the view layer, never in the stored/queried value" posture `funnel-view.ts`'s
 * conversion-percentage rounding establishes.
 */
export function buildCohortRetentionView(outcome: CohortRetentionOutcome): CohortRetentionView {
  if (!outcome.ok) {
    return { kind: outcome.reason };
  }
  const cohorts = groupCohortRetentionRows(outcome.rows);
  const periodNumbers = [...new Set(outcome.rows.map((row) => row.periodNumber))].sort((a, b) => a - b);
  return { kind: 'ok', cohorts, periodNumbers };
}

function groupCohortRetentionRows(rows: readonly CohortRetentionRow[]): CohortRetentionCohortView[] {
  const cohortsByMonth = new Map<string, CohortRetentionCohortView>();
  for (const row of rows) {
    let cohort = cohortsByMonth.get(row.cohortMonth);
    if (!cohort) {
      cohort = { cohortMonth: row.cohortMonth, cohortSize: row.cohortSize, periods: [] };
      cohortsByMonth.set(row.cohortMonth, cohort);
    }
    cohort.periods.push({
      periodNumber: row.periodNumber,
      retainedCount: row.retainedCount,
      retentionRatePercent: Math.round(row.retentionRate * 100),
    });
  }
  return [...cohortsByMonth.values()];
}
