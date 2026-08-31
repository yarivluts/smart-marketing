import { describe, expect, it } from 'vitest';
import {
  getDeterministicFactor,
  calculateDaysRemaining,
  createMockEasySignFunnel,
  calculateFunnelStepItems,
  buildVisualFunnelData,
  buildDeterministicDemoGoals,
  buildUnifiedGoalsData,
  getHeatmapCellColor,
  buildFunnelGoalsCockpitData,
} from './funnel-goals-synthesizer';
import type { GoalModel } from '@growthos/firebase-orm-models';

describe('funnel-goals-synthesizer', () => {
  describe('getDeterministicFactor', () => {
    it('returns a stable deterministic number between 0.85 and 1.15 for the same seed', () => {
      const f1 = getDeterministicFactor('project-123');
      const f2 = getDeterministicFactor('project-123');
      expect(f1).toBe(f2);
      expect(f1).toBeGreaterThanOrEqual(0.85);
      expect(f1).toBeLessThanOrEqual(1.15);
    });
  });

  describe('calculateDaysRemaining', () => {
    it('calculates days remaining until deadline or returns 0 for past deadline', () => {
      const futureDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
      expect(calculateDaysRemaining(futureDate)).toBeGreaterThanOrEqual(9);

      const pastDate = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
      expect(calculateDaysRemaining(pastDate)).toBe(0);

      expect(calculateDaysRemaining('invalid-date')).toBe(0);
    });
  });

  describe('createMockEasySignFunnel', () => {
    it('returns the standard 3-step pipeline with accurate percentages and drop-offs', () => {
      const steps = createMockEasySignFunnel();
      expect(steps).toHaveLength(3);

      expect(steps[0]).toEqual({
        stageKey: 'sent',
        stageLabel: 'Document Sent',
        stepOrder: 1,
        customerCount: 1000,
        conversionPercent: 100,
        dropOffPercent: 0,
      });

      expect(steps[1]).toEqual({
        stageKey: 'viewed',
        stageLabel: 'Document Viewed',
        stepOrder: 2,
        customerCount: 380,
        conversionPercent: 38,
        dropOffPercent: 62,
      });

      expect(steps[2]).toEqual({
        stageKey: 'signed',
        stageLabel: 'Document Signed',
        stepOrder: 3,
        customerCount: 220,
        conversionPercent: 22,
        dropOffPercent: 42,
      });
    });

    it('scales customer counts proportionally with factor argument', () => {
      const steps = createMockEasySignFunnel(1.5);
      expect(steps[0].customerCount).toBe(1500);
      expect(steps[1].customerCount).toBe(570);
      expect(steps[2].customerCount).toBe(330);
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
      expect(steps).toHaveLength(3);
      expect(steps[0].stageKey).toBe('started');
      expect(steps[0].conversionPercent).toBe(100);
      expect(steps[0].dropOffPercent).toBe(0);
      expect(steps[0].stageLabel).toBe('Label: started');

      expect(steps[1].stageKey).toBe('in_progress');
      expect(steps[1].conversionPercent).toBe(50);
      expect(steps[1].dropOffPercent).toBe(50);

      expect(steps[2].stageKey).toBe('completed');
      expect(steps[2].conversionPercent).toBe(20);
      expect(steps[2].dropOffPercent).toBe(60); // (500 - 200)/500 = 60%
    });
  });

  describe('buildVisualFunnelData', () => {
    it('synthesizes EasySign pipeline when outcome is null or empty (zero-config)', () => {
      const data = buildVisualFunnelData(null, 'default-project');
      expect(data.isSimulated).toBe(true);
      expect(data.totalStarted).toBe(1000);
      expect(data.totalCompleted).toBe(220);
      expect(data.overallConversionPercent).toBe(22);
      expect(data.biggestDropOffStageKey).toBe('viewed');
      expect(data.biggestDropOffPercent).toBe(62);
      expect(data.steps).toHaveLength(3);
    });

    it('processes live warehouse outcome properly', () => {
      const outcome = {
        ok: true as const,
        steps: [
          { stageKey: 'step_1', stepOrder: 1, customerCount: 800, conversionRateFromFirst: 1.0 },
          { stageKey: 'step_2', stepOrder: 2, customerCount: 400, conversionRateFromFirst: 0.5 },
        ],
      };
      const data = buildVisualFunnelData(outcome, 'p-live');
      expect(data.isSimulated).toBe(false);
      expect(data.totalStarted).toBe(800);
      expect(data.totalCompleted).toBe(400);
      expect(data.overallConversionPercent).toBe(50);
      expect(data.biggestDropOffPercent).toBe(50);
    });
  });

  describe('buildDeterministicDemoGoals', () => {
    it('produces 5 realistic demo business goals covering maximize, minimize, and range', () => {
      const demoGoals = buildDeterministicDemoGoals('test-project');
      expect(demoGoals).toHaveLength(5);

      const mrrGoal = demoGoals.find((g) => g.id === 'demo-goal-mrr');
      expect(mrrGoal).toBeDefined();
      expect(mrrGoal?.direction).toBe('maximize');
      expect(mrrGoal?.targetValue).toBe(100000);
      expect(mrrGoal?.percentFilled).toBeGreaterThan(0);

      const cacGoal = demoGoals.find((g) => g.id === 'demo-goal-cac');
      expect(cacGoal).toBeDefined();
      expect(cacGoal?.direction).toBe('minimize');
      expect(cacGoal?.targetValue).toBe(45);

      const paybackGoal = demoGoals.find((g) => g.id === 'demo-goal-payback');
      expect(paybackGoal).toBeDefined();
      expect(paybackGoal?.direction).toBe('range');
      expect(paybackGoal?.rangeMin).toBe(30);
      expect(paybackGoal?.rangeMax).toBe(45);
    });
  });

  describe('buildUnifiedGoalsData', () => {
    it('falls back to demo goals when rawGoals is empty', () => {
      const { items, summary } = buildUnifiedGoalsData('project-empty', []);
      expect(items).toHaveLength(5);
      expect(items[0].isDemo).toBe(true);
      expect(summary.totalGoalsCount).toBe(5);
      expect(summary.averageProgressPct).toBeGreaterThan(0);
    });

    it('processes custom GoalModels when provided', () => {
      const rawGoals: GoalModel[] = [
        {
          id: 'custom-goal-1',
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
        } as unknown as GoalModel,
      ];

      const personMap = new Map([['person-1', 'Alice Leader']]);
      const { items, summary } = buildUnifiedGoalsData('p1', rawGoals, undefined, personMap);

      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('custom-goal-1');
      expect(items[0].ownerName).toBe('Alice Leader');
      expect(items[0].isDemo).toBe(false);
      expect(summary.totalGoalsCount).toBe(1);
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

  describe('buildFunnelGoalsCockpitData', () => {
    it('consolidates funnel, goals, cohort heatmap, payback velocity, and recommendations', () => {
      const cockpit = buildFunnelGoalsCockpitData({
        funnelOutcome: null,
        goals: [],
        projectId: 'demo-project',
      });

      expect(cockpit.summary.overallFunnelConversionPct).toBe(22);
      expect(cockpit.summary.topFunnelDropOffPct).toBe(62);
      expect(cockpit.summary.activeGoalsCount).toBe(5);
      expect(cockpit.funnelSteps).toHaveLength(3);
      expect(cockpit.cohortRows.length).toBeGreaterThan(0);
      expect(cockpit.paybackVelocity).toHaveLength(4);
      expect(cockpit.qualityCalibration).toHaveLength(4);
      expect(cockpit.proactiveRecommendation).not.toBeNull();
      expect(cockpit.proactiveRecommendation?.targetId).toBe('easysign_funnel_viewed');
    });
  });
});
