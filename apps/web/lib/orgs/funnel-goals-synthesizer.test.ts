import { describe, expect, it } from 'vitest';
import {
  calculateDaysRemaining,
  boundedPercent,
  calculateFunnelStepItems,
  overallConversionPercent,
  buildVisualFunnelData,
  buildUnifiedGoalsData,
  buildPaybackVelocity,
  buildQualityCalibration,
  getHeatmapCellColor,
  buildFunnelGoalsCockpitData,
} from './funnel-goals-synthesizer';
import type { GoalModel, GoalProgressOutcome } from '@growthos/firebase-orm-models';

/*
  Jira B15. This module used to fill every absent measurement with invented data: a sample
  EasySign funnel (1000/380/220, hash-scaled per project), five demo goals, three hard-coded
  cohorts, four payback windows, four Diamond..Bronze tiers, and a `windowDays * 1200` payback
  target applied even to real revenue. The tests that asserted those samples (22% conversion,
  62% drop-off, 5 demo goals, "Diamond (Tier 1)") were asserting a fabrication; they are
  replaced below by tests that the absent path returns NOTHING numeric, and that the real path
  returns exactly what it did before.
*/

function goal(overrides: Partial<Record<string, unknown>> = {}): GoalModel {
  return {
    id: 'goal-1',
    project_id: 'p1',
    name: 'Custom MRR',
    metric_name: 'mrr',
    direction: 'maximize',
    target_value: 1000,
    range_min: null,
    range_max: null,
    start_date: '2026-01-01',
    deadline: '2026-12-31',
    rhythm: 'even',
    owner_person_id: 'person-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as unknown as GoalModel;
}

function measured(overrides: Partial<{ actualValue: number; progressRatio: number; status: 'on_track' | 'at_risk' | 'off_track'; hasMeasurements: boolean }> = {}): GoalProgressOutcome {
  return {
    ok: true,
    actualValue: overrides.actualValue ?? 640,
    hasMeasurements: overrides.hasMeasurements ?? true,
    progress: {
      expectedAtNow: 700,
      progressRatio: overrides.progressRatio ?? 0.644,
      projectedFinalValue: 915.5,
      status: overrides.status ?? 'at_risk',
      isGoalMet: false,
    },
  } as unknown as GoalProgressOutcome;
}

const REAL_FUNNEL = {
  ok: true as const,
  steps: [
    { eventSchemaName: 'sent_event', stageKey: 'sent', stepOrder: 1, customerCount: 500, conversionRateFromFirst: 1 },
    { eventSchemaName: 'viewed_event', stageKey: 'viewed', stepOrder: 2, customerCount: 200, conversionRateFromFirst: 0.4 },
    { eventSchemaName: 'signed_event', stageKey: 'signed', stepOrder: 3, customerCount: 150, conversionRateFromFirst: 0.3 },
  ],
};

describe('funnel-goals-synthesizer', () => {
  describe('calculateDaysRemaining', () => {
    it('calculates days remaining until deadline or returns 0 for past deadline', () => {
      const futureDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
      expect(calculateDaysRemaining(futureDate)).toBeGreaterThanOrEqual(9);

      const pastDate = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
      expect(calculateDaysRemaining(pastDate)).toBe(0);

      expect(calculateDaysRemaining('invalid-date')).toBe(0);
    });
  });

  describe('calculateFunnelStepItems', () => {
    it('returns empty array when raw steps are empty', () => {
      expect(calculateFunnelStepItems([])).toEqual([]);
    });

    it('sorts steps and calculates conversion and drop-off accurately', () => {
      const raw = [
        { stageKey: 'completed', stepOrder: 3, customerCount: 200 },
        { stageKey: 'started', stepOrder: 1, customerCount: 1000 },
        { stageKey: 'in_progress', stepOrder: 2, customerCount: 500 },
      ];

      const steps = calculateFunnelStepItems(raw, (k) => `Label: ${k}`);
      expect(steps.map((s) => [s.stageKey, s.conversionPercent, s.dropOffPercent])).toEqual([
        ['started', 100, 0],
        ['in_progress', 50, 50],
        ['completed', 20, 60],
      ]);
      expect(steps[0].stageLabel).toBe('Label: started');
    });

    /*
      B20: EasySign's funnel read 4 -> 6 -> 6 -> 6 -> 6 (150% overall, "-0%" drop-offs) because the query
      counted events per step. The query now returns sequential people counts, and these are the real ones.
    */
    it("renders EasySign's sequential people counts: 50% conversion, one 50% drop-off, then none", () => {
      const raw = [
        { eventSchemaName: 'touchpoint', stageKey: 'awareness', stepOrder: 0, customerCount: 4, conversionRateFromFirst: 1 },
        { eventSchemaName: 'signup', stageKey: 'signup', stepOrder: 1, customerCount: 2, conversionRateFromFirst: 0.5 },
        { eventSchemaName: 'document_created', stageKey: 'other', stepOrder: 2, customerCount: 2, conversionRateFromFirst: 0.5 },
        { eventSchemaName: 'document_sent', stageKey: 'other', stepOrder: 3, customerCount: 2, conversionRateFromFirst: 0.5 },
        { eventSchemaName: 'document_signed', stageKey: 'other', stepOrder: 4, customerCount: 2, conversionRateFromFirst: 0.5 },
      ];
      const steps = calculateFunnelStepItems(raw);
      expect(steps.map((s) => [s.customerCount, s.conversionPercent, s.dropOffPercent])).toEqual([
        [4, 100, 0],
        [2, 50, 50],
        [2, 50, 0],
        [2, 50, 0],
        [2, 50, 0],
      ]);
      expect(overallConversionPercent(steps)).toBe(50);
    });

    it('never shows more than 100% or a negative drop-off, even for counts that break the sequential invariant', () => {
      // The pre-B20 shape. The query can no longer produce it; the page must still never render it as 150%.
      const raw = [
        { stageKey: 'a', stepOrder: 0, customerCount: 4, conversionRateFromFirst: 1 },
        { stageKey: 'b', stepOrder: 1, customerCount: 6, conversionRateFromFirst: 1.5 },
        { stageKey: 'c', stepOrder: 2, customerCount: 6 },
      ];
      const steps = calculateFunnelStepItems(raw);
      for (const step of steps) {
        expect(step.conversionPercent).toBeLessThanOrEqual(100);
        expect(step.conversionPercent).toBeGreaterThanOrEqual(0);
        expect(step.dropOffPercent).toBeLessThanOrEqual(100);
        expect(step.dropOffPercent).toBeGreaterThanOrEqual(0);
      }
      expect(overallConversionPercent(steps)).toBe(100);
    });
  });

  describe('boundedPercent', () => {
    it('rounds to a whole percentage within 0..100 and is 0 for an empty whole', () => {
      expect(boundedPercent(1, 3)).toBe(33);
      expect(boundedPercent(2, 2)).toBe(100);
      expect(boundedPercent(3, 2)).toBe(100);
      expect(boundedPercent(-1, 2)).toBe(0);
      expect(boundedPercent(1, 0)).toBe(0);
      expect(boundedPercent(Number.NaN, 2)).toBe(0);
    });
  });

  describe('buildVisualFunnelData', () => {
    it('reports no_funnel - with no numbers at all - when the project has not confirmed a funnel', () => {
      // EasySign's real project: the query succeeds with zero steps. This used to return the
      // hash-scaled sample funnel (955 / 363 / 210) with "Simulated Mode (Zero-Config)".
      expect(buildVisualFunnelData({ ok: true, steps: [] })).toEqual({ kind: 'no_funnel' });
    });

    it('reports query_error for a null outcome (the page query threw), not no_funnel', () => {
      expect(buildVisualFunnelData(null)).toEqual({ kind: 'query_error' });
    });

    it('passes the warehouse degradation reason through', () => {
      expect(
        buildVisualFunnelData({ ok: false, reason: 'warehouse_not_configured', message: 'x' }),
      ).toEqual({ kind: 'warehouse_not_configured' });
      expect(buildVisualFunnelData({ ok: false, reason: 'quota_exceeded', message: 'x' })).toEqual({
        kind: 'quota_exceeded',
      });
    });

    it('processes a live warehouse outcome exactly as before', () => {
      const data = buildVisualFunnelData({
        ok: true,
        steps: [
          { eventSchemaName: 'step_1_event', stageKey: 'step_1', stepOrder: 1, customerCount: 800, conversionRateFromFirst: 1.0 },
          { eventSchemaName: 'step_2_event', stageKey: 'step_2', stepOrder: 2, customerCount: 400, conversionRateFromFirst: 0.5 },
        ],
      });
      expect(data).toMatchObject({
        kind: 'ok',
        totalStarted: 800,
        totalCompleted: 400,
        overallConversionPercent: 50,
        biggestDropOffPercent: 50,
        biggestDropOffStageKey: 'step_2',
      });
    });
  });

  describe('buildUnifiedGoalsData', () => {
    it('returns an empty list for a project with no goals - never demo goals', () => {
      // Used to return five invented goals ("Q3 Monthly Recurring Revenue (MRR)", owned by
      // "Sarah Jenkins (Growth Lead)") flagged isDemo, which rendered beside real ones.
      const { items, summary } = buildUnifiedGoalsData([]);
      expect(items).toEqual([]);
      expect(summary).toEqual({
        totalGoalsCount: 0,
        measuredGoalsCount: 0,
        onTrackCount: 0,
        atRiskCount: 0,
        offTrackCount: 0,
        averageProgressPct: null,
        activeGoalsCount: 0,
      });
    });

    it('carries measured progress through unchanged', () => {
      const personMap = new Map([['person-1', 'Alice Leader']]);
      const { items, summary } = buildUnifiedGoalsData([goal()], new Map([['goal-1', measured()]]), personMap);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: 'goal-1',
        ownerName: 'Alice Leader',
        progressKind: 'ok',
        actualValue: 640,
        expectedAtNow: 700,
        projectedFinalValue: 915.5,
        percentFilled: 64,
        status: 'at_risk',
        statusColor: 'amber',
        isGoalMet: false,
      });
      expect(summary).toMatchObject({ measuredGoalsCount: 1, atRiskCount: 1, averageProgressPct: 64 });
    });

    it.each([
      ['a failed query', { ok: false, reason: 'warehouse_not_configured', message: 'x' } as GoalProgressOutcome, 'warehouse_not_configured'],
      ['a metric with no rows in the window', measured({ actualValue: 0, hasMeasurements: false, status: 'off_track' }), 'no_measurements'],
      ['a query that threw (no outcome in the map)', undefined, 'query_error'],
    ])('reports %s as unmeasured, with no actual value and no pace', (_label, outcome, kind) => {
      // Previously an unmeasured goal was shown with actual 0 and a pace computed against it -
      // typically "Off track" in red for a project that simply had no data yet.
      const outcomes = new Map<string, GoalProgressOutcome>();
      if (outcome) outcomes.set('goal-1', outcome);

      const { items, summary } = buildUnifiedGoalsData([goal()], outcomes);
      expect(items[0]).toMatchObject({
        progressKind: kind,
        actualValue: null,
        expectedAtNow: null,
        projectedFinalValue: null,
        percentFilled: null,
        status: null,
        statusColor: null,
        isGoalMet: null,
        targetValue: 1000,
      });
      expect(summary).toMatchObject({
        totalGoalsCount: 1,
        measuredGoalsCount: 0,
        onTrackCount: 0,
        offTrackCount: 0,
        averageProgressPct: null,
      });
    });
  });

  describe('getHeatmapCellColor', () => {
    it('returns correct color class for retention rates', () => {
      expect(getHeatmapCellColor(90)).toContain('bg-emerald-500 text-white font-bold');
      expect(getHeatmapCellColor(65)).toContain('bg-emerald-500/70 text-white font-semibold');
      expect(getHeatmapCellColor(45)).toContain('bg-emerald-500/35');
      expect(getHeatmapCellColor(25)).toContain('bg-amber-500/30');
      expect(getHeatmapCellColor(10)).toContain('bg-rose-500/20');
      expect(getHeatmapCellColor(0)).toContain('bg-muted/30');
    });
  });

  describe('buildPaybackVelocity', () => {
    it('returns the real windows with no invented target or pace', () => {
      const result = buildPaybackVelocity({
        ok: true,
        windows: [
          { windowDays: 7, collectedRevenue: 310 },
          { windowDays: 14, collectedRevenue: 520 },
          { windowDays: 30, collectedRevenue: 900 },
          { windowDays: 40, collectedRevenue: 1150 },
        ],
      });
      expect(result.kind).toBe('ok');
      // Exactly the measured fields. `targetRevenue: windowDays * 1200` and a pacePercent
      // against it used to be attached here - to REAL revenue.
      expect(result.items).toEqual([
        { windowDays: 7, collectedRevenue: 310 },
        { windowDays: 14, collectedRevenue: 520 },
        { windowDays: 30, collectedRevenue: 900 },
        { windowDays: 40, collectedRevenue: 1150 },
      ]);
    });

    it('reports no_data, not $0 windows, when nothing has landed', () => {
      expect(buildPaybackVelocity({ ok: true, windows: [] })).toEqual({ kind: 'no_data', items: [] });
      expect(
        buildPaybackVelocity({
          ok: true,
          windows: [
            { windowDays: 7, collectedRevenue: 0 },
            { windowDays: 40, collectedRevenue: 0 },
          ],
        }),
      ).toEqual({ kind: 'no_data', items: [] });
    });

    it('reports why when the query failed or never ran', () => {
      expect(buildPaybackVelocity(null)).toEqual({ kind: 'query_error', items: [] });
      expect(buildPaybackVelocity({ ok: false, reason: 'not_yet_backed', message: 'x' })).toEqual({
        kind: 'not_yet_backed',
        items: [],
      });
    });
  });

  describe('buildQualityCalibration', () => {
    it('returns the real tiers, keeping an undefined paying rate null instead of 0%', () => {
      const result = buildQualityCalibration({
        ok: true,
        tiers: [
          { qualityTier: 'high', signups: 40, payingSignups: 10, payingRate: 0.25, collectedRevenue40d: 4000, avgCollectedRevenue40d: 100.4 },
          { qualityTier: 'low', signups: 0, payingSignups: 0, payingRate: null, collectedRevenue40d: 0, avgCollectedRevenue40d: null },
        ],
      } as never);
      expect(result.kind).toBe('ok');
      expect(result.items).toEqual([
        { tier: 'high', tierLabel: 'High', signups: 40, payingSignups: 10, payingRatePercent: 25, avgCollectedRevenue40d: 100 },
        { tier: 'low', tierLabel: 'Low', signups: 0, payingSignups: 0, payingRatePercent: null, avgCollectedRevenue40d: null },
      ]);
    });

    it('reports no_data or the failure reason rather than sample tiers', () => {
      expect(buildQualityCalibration({ ok: true, tiers: [] })).toEqual({ kind: 'no_data', items: [] });
      expect(buildQualityCalibration(null)).toEqual({ kind: 'query_error', items: [] });
      expect(buildQualityCalibration({ ok: false, reason: 'quota_exceeded', message: 'x' })).toEqual({
        kind: 'quota_exceeded',
        items: [],
      });
    });
  });

  describe('buildFunnelGoalsCockpitData', () => {
    it('returns an explicit no-data shape - no numbers, no alerts, no recommendation - when nothing was measured', () => {
      const cockpit = buildFunnelGoalsCockpitData({
        funnelOutcome: { ok: true, steps: [] },
        goals: [],
      });

      expect(cockpit.funnelViewKind).toBe('no_funnel');
      expect(cockpit.funnelSteps).toEqual([]);
      expect(cockpit.goals).toEqual([]);
      expect(cockpit.cohortRows).toEqual([]);
      expect(cockpit.cohortPeriodNumbers).toEqual([]);
      expect(cockpit.cohortViewKind).toBe('query_error');
      expect(cockpit.paybackVelocity).toEqual([]);
      expect(cockpit.paybackViewKind).toBe('query_error');
      expect(cockpit.qualityCalibration).toEqual([]);
      expect(cockpit.calibrationViewKind).toBe('query_error');
      expect(cockpit.proactiveRecommendation).toBeNull();
      expect(cockpit.summary).toEqual({
        overallFunnelConversionPct: null,
        topFunnelDropOffPct: null,
        activeGoalsCount: 0,
        goalsMeasuredCount: 0,
        goalsOnTrackCount: 0,
        avgMonth1RetentionPct: null,
        avgConversionVelocityDays: null,
        total40dPaybackUsd: null,
        dunningRecoveryRatePct: null,
        churnRatePct: null,
      });
    });

    it('builds the funnel figures and the drop-off recommendation from a real funnel, as before', () => {
      const cockpit = buildFunnelGoalsCockpitData({ funnelOutcome: REAL_FUNNEL, goals: [] });

      expect(cockpit.funnelViewKind).toBe('ok');
      expect(cockpit.funnelSteps.map((s) => s.customerCount)).toEqual([500, 200, 150]);
      expect(cockpit.summary.overallFunnelConversionPct).toBe(30);
      expect(cockpit.summary.topFunnelDropOffPct).toBe(60);
      expect(cockpit.proactiveRecommendation).toMatchObject({
        id: 'rec-funnel-viewed',
        targetId: 'funnel_viewed',
        beforeDiff: '60% drop-off',
        projectedImpact: '',
      });
    });

    it('builds the cohort heatmap from real cohort rows', () => {
      const cockpit = buildFunnelGoalsCockpitData({
        funnelOutcome: REAL_FUNNEL,
        goals: [],
        cohortOutcome: {
          ok: true,
          rows: [
            { cohortMonth: '2026-06-01', periodNumber: 0, cohortSize: 40, retainedCount: 40, retentionRate: 1 },
            { cohortMonth: '2026-06-01', periodNumber: 1, cohortSize: 40, retainedCount: 22, retentionRate: 0.55 },
          ],
        },
      });
      expect(cockpit.cohortViewKind).toBe('ok');
      expect(cockpit.cohortPeriodNumbers).toEqual([0, 1]);
      expect(cockpit.cohortRows).toHaveLength(1);
      expect(cockpit.cohortRows[0].retentionByPeriod.get(1)?.retentionRatePercent).toBe(55);
    });

    it('reports an ok-but-empty cohort outcome as ok with no rows (nothing landed yet)', () => {
      const cockpit = buildFunnelGoalsCockpitData({
        funnelOutcome: REAL_FUNNEL,
        goals: [],
        cohortOutcome: { ok: true, rows: [] },
      });
      expect(cockpit.cohortViewKind).toBe('ok');
      expect(cockpit.cohortRows).toEqual([]);
    });
  });
});
