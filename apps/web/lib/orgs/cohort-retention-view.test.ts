import { describe, expect, it } from 'vitest';
import type { CohortRetentionOutcome } from '@growthos/firebase-orm-models';
import { buildCohortRetentionView } from './cohort-retention-view';

describe('buildCohortRetentionView', () => {
  it('groups rows by cohort month, preserving row order within each cohort and rounding retention rates to whole-number percentages', () => {
    const outcome: CohortRetentionOutcome = {
      ok: true,
      rows: [
        { cohortMonth: '2026-02-01', periodNumber: 0, cohortSize: 50, retainedCount: 50, retentionRate: 1 },
        { cohortMonth: '2026-02-01', periodNumber: 1, cohortSize: 50, retainedCount: 21, retentionRate: 0.423 },
        { cohortMonth: '2026-01-01', periodNumber: 0, cohortSize: 100, retainedCount: 100, retentionRate: 1 },
        { cohortMonth: '2026-01-01', periodNumber: 1, cohortSize: 100, retainedCount: 40, retentionRate: 0.4 },
      ],
    };

    expect(buildCohortRetentionView(outcome)).toEqual({
      kind: 'ok',
      periodNumbers: [0, 1],
      cohorts: [
        {
          cohortMonth: '2026-02-01',
          cohortSize: 50,
          periods: [
            { periodNumber: 0, retainedCount: 50, retentionRatePercent: 100 },
            { periodNumber: 1, retainedCount: 21, retentionRatePercent: 42 },
          ],
        },
        {
          cohortMonth: '2026-01-01',
          cohortSize: 100,
          periods: [
            { periodNumber: 0, retainedCount: 100, retentionRatePercent: 100 },
            { periodNumber: 1, retainedCount: 40, retentionRatePercent: 40 },
          ],
        },
      ],
    });
  });

  it('collects the distinct period numbers across every cohort, ascending, even when one cohort has fewer periods than another', () => {
    const outcome: CohortRetentionOutcome = {
      ok: true,
      rows: [
        { cohortMonth: '2026-02-01', periodNumber: 0, cohortSize: 10, retainedCount: 10, retentionRate: 1 },
        { cohortMonth: '2026-01-01', periodNumber: 0, cohortSize: 100, retainedCount: 100, retentionRate: 1 },
        { cohortMonth: '2026-01-01', periodNumber: 2, cohortSize: 100, retainedCount: 30, retentionRate: 0.3 },
      ],
    };

    const view = buildCohortRetentionView(outcome);
    expect(view.kind === 'ok' ? view.periodNumbers : null).toEqual([0, 2]);
  });

  it('returns an empty cohort list for an ok outcome with no rows', () => {
    expect(buildCohortRetentionView({ ok: true, rows: [] })).toEqual({ kind: 'ok', cohorts: [], periodNumbers: [] });
  });

  it.each(['warehouse_not_configured', 'quota_exceeded', 'query_error'] as const)('maps a degraded "%s" outcome to the matching view kind', (reason) => {
    const outcome: CohortRetentionOutcome = { ok: false, reason, message: 'boom' };
    expect(buildCohortRetentionView(outcome)).toEqual({ kind: reason });
  });
});
