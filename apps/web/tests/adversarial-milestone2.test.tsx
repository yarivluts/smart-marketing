import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from './e2e/helpers/test-harness';
import {
  calculateGoalProgress,
  computeElapsedFraction,
  isGoalDirection,
  isGoalRhythm,
} from '@growthos/shared';
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
  type FunnelStepItem,
  type UnifiedGoalItem,
  type CohortHeatmapRow,
} from '../lib/orgs/funnel-goals-synthesizer';
import { VisualFunnelSteps } from '../components/orgs/visual-funnel-steps';
import { GoalThermometerCard } from '../components/orgs/goal-thermometer-card';
import { CohortRetentionMatrix } from '../components/orgs/cohort-retention-matrix';
import { FunnelGoalsDashboard } from '../components/orgs/funnel-goals-dashboard';

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  });
});

describe('Adversarial & Edge-Case Stress Harness: Milestone 2 (Funnel & Goals)', () => {
  describe('1. Funnel Calculations & Boundary Conditions', () => {
    it('1.1 handles empty raw steps array gracefully without division by zero', () => {
      const items = calculateFunnelStepItems([]);
      expect(items).toEqual([]);

      const data = buildVisualFunnelData({ ok: true, steps: [] }, 'proj-zero');
      expect(data.isSimulated).toBe(true);
      expect(data.steps.length).toBe(3);
    });

    it('1.2 handles single-step funnel with 100% conversion and 0% drop-off', () => {
      const raw = [{ stageKey: 'step_only', stepOrder: 1, customerCount: 450, conversionRateFromFirst: 1.0 }];
      const items = calculateFunnelStepItems(raw);

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        stageKey: 'step_only',
        stageLabel: 'step_only',
        stepOrder: 1,
        customerCount: 450,
        conversionPercent: 100,
        dropOffPercent: 0,
      });

      const data = buildVisualFunnelData({ ok: true, steps: raw });
      expect(data.isSimulated).toBe(false);
      expect(data.totalStarted).toBe(450);
      expect(data.totalCompleted).toBe(450);
      expect(data.overallConversionPercent).toBe(100);
      expect(data.biggestDropOffPercent).toBe(0);
      expect(data.biggestDropOffStageKey).toBeUndefined();
    });

    it('1.3 handles initial stage with 0 customers without NaN or throw', () => {
      const raw = [
        { stageKey: 's1', stepOrder: 1, customerCount: 0, conversionRateFromFirst: 0 },
        { stageKey: 's2', stepOrder: 2, customerCount: 0, conversionRateFromFirst: 0 },
      ];
      const items = calculateFunnelStepItems(raw);

      expect(items).toHaveLength(2);
      expect(items[0].conversionPercent).toBe(0);
      expect(items[0].dropOffPercent).toBe(0);
      expect(items[1].conversionPercent).toBe(0);
      expect(items[1].dropOffPercent).toBe(0);

      const data = buildVisualFunnelData({ ok: true, steps: raw });
      expect(data.totalStarted).toBe(0);
      expect(data.totalCompleted).toBe(0);
      expect(data.overallConversionPercent).toBe(0);
    });

    it('1.4 handles total drop-off (100% loss after first step)', () => {
      const raw = [
        { stageKey: 's1', stepOrder: 1, customerCount: 1000, conversionRateFromFirst: 1.0 },
        { stageKey: 's2', stepOrder: 2, customerCount: 0, conversionRateFromFirst: 0.0 },
        { stageKey: 's3', stepOrder: 3, customerCount: 0, conversionRateFromFirst: 0.0 },
      ];
      const items = calculateFunnelStepItems(raw);

      expect(items[0].conversionPercent).toBe(100);
      expect(items[0].dropOffPercent).toBe(0);

      expect(items[1].customerCount).toBe(0);
      expect(items[1].conversionPercent).toBe(0);
      expect(items[1].dropOffPercent).toBe(100);

      expect(items[2].customerCount).toBe(0);
      expect(items[2].conversionPercent).toBe(0);
      expect(items[2].dropOffPercent).toBe(0); // 0 from 0 is 0 drop-off

      const data = buildVisualFunnelData({ ok: true, steps: raw });
      expect(data.biggestDropOffPercent).toBe(100);
      expect(data.biggestDropOffStageKey).toBe('s2');
      expect(data.overallConversionPercent).toBe(0);
    });

    it('1.5 handles inverted / expanding funnel stages (growth at later step)', () => {
      // e.g. viral expansion or multi-attendee invitations
      const raw = [
        { stageKey: 's1', stepOrder: 1, customerCount: 100, conversionRateFromFirst: 1.0 },
        { stageKey: 's2', stepOrder: 2, customerCount: 250, conversionRateFromFirst: 2.5 },
      ];
      const items = calculateFunnelStepItems(raw);

      expect(items[1].conversionPercent).toBe(250);
      expect(items[1].dropOffPercent).toBe(0); // clamped at min 0, not negative

      const data = buildVisualFunnelData({ ok: true, steps: raw });
      expect(data.overallConversionPercent).toBe(250);
      expect(data.biggestDropOffPercent).toBe(0);
    });

    it('1.6 handles out-of-order stepOrder inputs correctly', () => {
      const raw = [
        { stageKey: 'signed', stepOrder: 3, customerCount: 100 },
        { stageKey: 'sent', stepOrder: 1, customerCount: 1000 },
        { stageKey: 'viewed', stepOrder: 2, customerCount: 400 },
      ];
      const items = calculateFunnelStepItems(raw);

      expect(items[0].stageKey).toBe('sent');
      expect(items[1].stageKey).toBe('viewed');
      expect(items[2].stageKey).toBe('signed');

      expect(items[1].dropOffPercent).toBe(60); // (1000 - 400)/1000 = 60%
      expect(items[2].dropOffPercent).toBe(75); // (400 - 100)/400 = 75%
    });

    it('1.7 renders VisualFunnelSteps UI under extreme conditions (0 counts, 1 step, inverted counts)', () => {
      // Single step with 0 counts
      const singleStep: FunnelStepItem[] = [
        { stageKey: 'solo', stageLabel: 'Solo Step', stepOrder: 1, customerCount: 0, conversionPercent: 0, dropOffPercent: 0 },
      ];

      const { unmount } = renderWithIntl(<VisualFunnelSteps steps={singleStep} />);
      expect(screen.getByTestId('visual-funnel-container')).toBeInTheDocument();
      expect(screen.getByTestId('count-solo')).toHaveTextContent('0 users');
      expect(screen.getByTestId('pct-solo')).toHaveTextContent('0%');
      expect(screen.queryByTestId('funnel-dropoff-alert-card')).not.toBeInTheDocument();
      unmount();

      // High drop-off triggering alert card & copilot button
      const alertSteps: FunnelStepItem[] = [
        { stageKey: 'sent', stageLabel: 'Sent', stepOrder: 1, customerCount: 1000, conversionPercent: 100, dropOffPercent: 0 },
        { stageKey: 'viewed', stageLabel: 'Viewed', stepOrder: 2, customerCount: 100, conversionPercent: 10, dropOffPercent: 90 },
      ];
      const onCopilot = vi.fn();
      renderWithIntl(<VisualFunnelSteps steps={alertSteps} onAskCopilot={onCopilot} />);

      expect(screen.getByTestId('funnel-dropoff-alert-card')).toBeInTheDocument();
      const copilotBtn = screen.getByTestId('ask-copilot-btn');
      fireEvent.click(copilotBtn);
      expect(onCopilot).toHaveBeenCalledTimes(1);
    });

    it('1.8 renders VisualFunnelSteps in Hebrew (RTL) without layout breakage', () => {
      const steps = createMockEasySignFunnel();
      renderWithIntl(<VisualFunnelSteps steps={steps} isSimulated />, { locale: 'he' });

      expect(screen.getByTestId('visual-funnel-container')).toBeInTheDocument();
      expect(screen.getByTestId('count-sent')).toBeInTheDocument();
      expect(screen.getByTestId('pct-sent')).toHaveTextContent('100%');
    });
  });

  describe('2. Goal Progress & Thermometer Edge Cases', () => {
    it('2.1 handles maximize goal with targetValue = 0 and actualValue = 0 (0/0 guard)', () => {
      const res = calculateGoalProgress({
        direction: 'maximize',
        targetValue: 0,
        actualValue: 0,
        elapsedFraction: 0.5,
      });

      expect(res.expectedAtNow).toBe(0);
      expect(res.progressRatio).toBe(0);
      expect(res.projectedFinalValue).toBe(0);
      expect(res.status).toBe('on_track');
      expect(res.isGoalMet).toBe(true);
    });

    it('2.2 handles maximize goal with targetValue = 0 and actualValue > 0', () => {
      const res = calculateGoalProgress({
        direction: 'maximize',
        targetValue: 0,
        actualValue: 50,
        elapsedFraction: 0.5,
      });

      expect(res.status).toBe('on_track');
      expect(res.isGoalMet).toBe(true);
      expect(res.projectedFinalValue).toBe(100);
    });

    it('2.3 handles maximize goal with negative actual values (e.g. net deficit)', () => {
      const res = calculateGoalProgress({
        direction: 'maximize',
        targetValue: 100,
        actualValue: -20,
        elapsedFraction: 0.5,
      });

      expect(res.expectedAtNow).toBe(50);
      expect(res.status).toBe('off_track');
      expect(res.isGoalMet).toBe(false);
      expect(res.projectedFinalValue).toBe(-40);
    });

    it('2.4 handles minimize goal with targetValue = 0, actualValue = 0, and actualValue > 0', () => {
      // 0 cost with 0 ceiling -> perfect
      const zeroCost = calculateGoalProgress({
        direction: 'minimize',
        targetValue: 0,
        actualValue: 0,
        elapsedFraction: 0.5,
      });
      expect(zeroCost.status).toBe('on_track');
      expect(zeroCost.isGoalMet).toBe(true);
      expect(zeroCost.progressRatio).toBe(0);

      // >0 cost with 0 ceiling -> off track
      const nonZeroCost = calculateGoalProgress({
        direction: 'minimize',
        targetValue: 0,
        actualValue: 10,
        elapsedFraction: 0.5,
      });
      expect(nonZeroCost.status).toBe('off_track');
      expect(nonZeroCost.isGoalMet).toBe(false);
    });

    it('2.5 handles minimize goal with negative actual value (e.g. net negative CAC / credit)', () => {
      const negativeCac = calculateGoalProgress({
        direction: 'minimize',
        targetValue: 50,
        actualValue: -10,
        elapsedFraction: 0.5,
      });
      expect(negativeCac.isGoalMet).toBe(true);
    });

    it('2.6 handles range goal with degenerate zero-width range (rangeMin == rangeMax)', () => {
      // Exactly on the point
      const onPoint = calculateGoalProgress({
        direction: 'range',
        rangeMin: 25,
        rangeMax: 25,
        actualValue: 25,
        elapsedFraction: 0.5,
      });
      expect(onPoint.status).toBe('on_track');
      expect(onPoint.isGoalMet).toBe(true);
      expect(onPoint.progressRatio).toBe(1);

      // Off the point
      const offPoint = calculateGoalProgress({
        direction: 'range',
        rangeMin: 25,
        rangeMax: 25,
        actualValue: 26,
        elapsedFraction: 0.5,
      });
      expect(offPoint.status).toBe('off_track');
      expect(offPoint.isGoalMet).toBe(false);
      expect(offPoint.progressRatio).toBe(0);
    });

    it('2.7 handles range goal with negative range boundaries', () => {
      const res = calculateGoalProgress({
        direction: 'range',
        rangeMin: -100,
        rangeMax: -50,
        actualValue: -75,
        elapsedFraction: 0.5,
      });
      expect(res.status).toBe('on_track');
      expect(res.isGoalMet).toBe(true);
      expect(res.progressRatio).toBe(0.5);
    });

    it('2.8 handles extreme numeric values without precision failure or overflow', () => {
      const res = calculateGoalProgress({
        direction: 'maximize',
        targetValue: 10_000_000_000,
        actualValue: 6_000_000_000,
        elapsedFraction: 0.5,
      });
      expect(res.status).toBe('on_track');
      expect(res.expectedAtNow).toBe(5_000_000_000);
      expect(res.projectedFinalValue).toBe(12_000_000_000);
    });

    it('2.9 validates computeElapsedFraction with expired deadlines and future start dates', () => {
      // Deadline already passed
      expect(computeElapsedFraction('2026-01-01', '2026-01-10', '2026-01-15', 'even')).toBe(1);
      // Start date in the future
      expect(computeElapsedFraction('2026-02-01', '2026-02-10', '2026-01-15', 'even')).toBe(0);
      // Degenerate dates (deadline <= startDate)
      expect(computeElapsedFraction('2026-01-10', '2026-01-10', '2026-01-05', 'even')).toBe(1);
      expect(computeElapsedFraction('2026-01-10', '2026-01-05', '2026-01-08', 'even')).toBe(1);
    });

    it('2.10 validates calculateDaysRemaining handles past, future, and invalid dates', () => {
      expect(calculateDaysRemaining('2020-01-01')).toBe(0);
      expect(calculateDaysRemaining('not-a-date')).toBe(0);
      const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
      expect(calculateDaysRemaining(future)).toBeGreaterThanOrEqual(4);
    });

    it('2.11 renders GoalThermometerCard and supports target editing interactions', async () => {
      const mockGoal: UnifiedGoalItem = {
        id: 'g-edit-test',
        name: 'Lead Volume Test',
        metricName: 'qualified_leads',
        direction: 'maximize',
        targetValue: 500,
        rangeMin: null,
        rangeMax: null,
        startDate: '2026-08-01',
        deadline: '2026-09-30',
        rhythm: 'even',
        ownerPersonId: 'person-1',
        ownerName: 'Sarah Jenkins',
        actualValue: 250,
        expectedAtNow: 250,
        projectedFinalValue: 500,
        percentFilled: 50,
        status: 'on_track',
        statusColor: 'green',
        isGoalMet: false,
        elapsedFraction: 0.5,
        daysRemaining: 30,
        isDemo: true,
      };

      const onUpdate = vi.fn();
      renderWithIntl(
        <GoalThermometerCard
          orgId="org-1"
          projectId="proj-1"
          goal={mockGoal}
          onTargetUpdated={onUpdate}
        />,
      );

      expect(screen.getByTestId('goal-card-g-edit-test')).toBeInTheDocument();
      expect(screen.getByTestId('goal-status-g-edit-test')).toHaveTextContent('On track');

      // Click Edit Target
      const editBtn = screen.getByTestId('adjust-target-btn-g-edit-test');
      fireEvent.click(editBtn);

      const targetInput = screen.getByTestId('input-target-g-edit-test');
      fireEvent.change(targetInput, { target: { value: '600' } });

      const saveBtn = screen.getByTestId('save-target-btn-g-edit-test');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith('g-edit-test', { targetValue: 600 });
      });
    });

    it('2.12 renders Range GoalThermometerCard with min and max inputs on edit', async () => {
      const rangeGoal: UnifiedGoalItem = {
        id: 'g-range-test',
        name: 'Payback Range',
        metricName: 'payback_days',
        direction: 'range',
        targetValue: null,
        rangeMin: 30,
        rangeMax: 45,
        startDate: '2026-08-01',
        deadline: '2026-09-30',
        rhythm: 'even',
        ownerPersonId: 'person-1',
        actualValue: 35,
        expectedAtNow: 37.5,
        projectedFinalValue: 35,
        percentFilled: 33,
        status: 'on_track',
        statusColor: 'green',
        isGoalMet: true,
        elapsedFraction: 0.5,
        daysRemaining: 30,
        isDemo: true,
      };

      const onUpdate = vi.fn();
      renderWithIntl(
        <GoalThermometerCard
          orgId="org-1"
          projectId="proj-1"
          goal={rangeGoal}
          onTargetUpdated={onUpdate}
        />,
      );

      const editBtn = screen.getByTestId('adjust-target-btn-g-range-test');
      fireEvent.click(editBtn);

      const minInput = screen.getByTestId('input-range-min-g-range-test');
      const maxInput = screen.getByTestId('input-range-max-g-range-test');

      fireEvent.change(minInput, { target: { value: '25' } });
      fireEvent.change(maxInput, { target: { value: '40' } });

      const saveBtn = screen.getByTestId('save-target-btn-g-range-test');
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith('g-range-test', { rangeMin: 25, rangeMax: 40 });
      });
    });

    it('2.13 displays proactive optimization trigger for at_risk / off_track goals', () => {
      const offTrackGoal: UnifiedGoalItem = {
        id: 'g-offtrack-test',
        name: 'CAC Guardrail',
        metricName: 'blended_cac_usd',
        direction: 'minimize',
        targetValue: 40,
        rangeMin: null,
        rangeMax: null,
        startDate: '2026-08-01',
        deadline: '2026-09-30',
        rhythm: 'even',
        ownerPersonId: 'person-1',
        actualValue: 65,
        expectedAtNow: 40,
        projectedFinalValue: 65,
        percentFilled: 100,
        status: 'off_track',
        statusColor: 'red',
        isGoalMet: false,
        elapsedFraction: 0.5,
        daysRemaining: 30,
        isDemo: true,
      };

      const onOptimize = vi.fn();
      renderWithIntl(
        <GoalThermometerCard
          orgId="org-1"
          projectId="proj-1"
          goal={offTrackGoal}
          onOptimizeRequested={onOptimize}
        />,
      );

      expect(screen.getByTestId('goal-rec-card-g-offtrack-test')).toBeInTheDocument();
      const recBtn = screen.getByTestId('goal-rec-action-btn-g-offtrack-test');
      fireEvent.click(recBtn);
      expect(onOptimize).toHaveBeenCalledWith(offTrackGoal);
    });
  });

  describe('3. Cohort Retention Matrix Stress Tests', () => {
    it('3.1 handles empty cohort list and empty period numbers gracefully', () => {
      renderWithIntl(<CohortRetentionMatrix cohorts={[]} periodNumbers={[]} />);
      expect(screen.getByTestId('cohort-retention-matrix')).toBeInTheDocument();
    });

    it('3.2 handles single-period cohorts correctly', () => {
      const singlePeriodCohort: CohortHeatmapRow = {
        cohortMonth: '2026-02-01',
        cohortLabel: 'Feb 2026',
        cohortSize: 150,
        retentionByPeriod: new Map([
          [0, { retainedCount: 150, retentionRatePercent: 100, colorClass: getHeatmapCellColor(100) }],
        ]),
      };

      renderWithIntl(<CohortRetentionMatrix cohorts={[singlePeriodCohort]} periodNumbers={[0]} />);
      expect(screen.getByTestId('cohort-row-2026-02-01')).toBeInTheDocument();
      expect(screen.getByTestId('retention-cell-2026-02-01-p0')).toHaveTextContent('100%');
    });

    it('3.3 handles missing periods in sparse cohort maps by rendering dashes', () => {
      const sparseCohort: CohortHeatmapRow = {
        cohortMonth: '2026-01-01',
        cohortLabel: 'Jan 2026',
        cohortSize: 100,
        retentionByPeriod: new Map([
          [0, { retainedCount: 100, retentionRatePercent: 100, colorClass: getHeatmapCellColor(100) }],
          // period 1 is missing
          [2, { retainedCount: 45, retentionRatePercent: 45, colorClass: getHeatmapCellColor(45) }],
        ]),
      };

      renderWithIntl(<CohortRetentionMatrix cohorts={[sparseCohort]} periodNumbers={[0, 1, 2]} />);
      const row = screen.getByTestId('cohort-row-2026-01-01');
      expect(within(row).getByText('—')).toBeInTheDocument();
      expect(screen.getByTestId('retention-cell-2026-01-01-p2')).toHaveTextContent('45%');
    });

    it('3.4 maps retention rates to 5 color tiers accurately including extreme values', () => {
      expect(getHeatmapCellColor(150)).toContain('bg-emerald-500'); // >100% expansion
      expect(getHeatmapCellColor(85)).toContain('bg-emerald-500');
      expect(getHeatmapCellColor(65)).toContain('bg-emerald-500/70');
      expect(getHeatmapCellColor(45)).toContain('bg-emerald-500/35');
      expect(getHeatmapCellColor(25)).toContain('bg-amber-500/30');
      expect(getHeatmapCellColor(5)).toContain('bg-rose-500/20');
      expect(getHeatmapCellColor(0)).toContain('bg-muted/30');
      expect(getHeatmapCellColor(-10)).toContain('bg-muted/30');
    });

    it('3.5 triggers conversion event filter callbacks', () => {
      const onFilter = vi.fn();
      renderWithIntl(
        <CohortRetentionMatrix
          cohorts={[]}
          periodNumbers={[0, 1]}
          onSelectConversionEvent={onFilter}
        />,
      );

      fireEvent.click(screen.getByTestId('filter-purchases'));
      expect(onFilter).toHaveBeenCalledWith('purchase');

      fireEvent.click(screen.getByTestId('filter-sign-ins'));
      expect(onFilter).toHaveBeenCalledWith('sign_in');

      fireEvent.click(screen.getByTestId('filter-all-activity'));
      expect(onFilter).toHaveBeenCalledWith('');
    });
  });

  describe('4. Integrated Cockpit Dashboard & Interactivity Stress Tests', () => {
    it('4.1 navigates between all 3 sub-tabs (funnel, goals, retention) seamlessly', () => {
      const data = buildFunnelGoalsCockpitData({
        funnelOutcome: null,
        goals: [],
        projectId: 'test-dash',
      });

      renderWithIntl(
        <FunnelGoalsDashboard
          orgId="org-1"
          projectId="test-dash"
          cockpitData={data}
          canExecute
        />,
      );

      // Default tab: funnel
      expect(screen.getByTestId('funnel-tab-content')).toBeInTheDocument();

      // Switch to Goals tab
      fireEvent.click(screen.getByTestId('tab-goals-btn'));
      expect(screen.getByTestId('goals-tab-content')).toBeInTheDocument();
      expect(screen.queryByTestId('funnel-tab-content')).not.toBeInTheDocument();

      // Switch to Retention tab
      fireEvent.click(screen.getByTestId('tab-retention-btn'));
      expect(screen.getByTestId('retention-tab-content')).toBeInTheDocument();

      // Switch back to Funnel tab
      fireEvent.click(screen.getByTestId('tab-funnel-btn'));
      expect(screen.getByTestId('funnel-tab-content')).toBeInTheDocument();
    });

    it('4.2 filters goals by search query and status filter with empty state fallback', () => {
      const data = buildFunnelGoalsCockpitData({
        funnelOutcome: null,
        goals: [],
        projectId: 'test-dash',
      });

      renderWithIntl(
        <FunnelGoalsDashboard
          orgId="org-1"
          projectId="test-dash"
          cockpitData={data}
          canExecute
        />,
      );

      // Go to goals tab
      fireEvent.click(screen.getByTestId('tab-goals-btn'));
      expect(screen.getByTestId('goals-cards-grid')).toBeInTheDocument();

      // Search for non-existent goal
      const searchInput = screen.getByTestId('search-goals-input');
      fireEvent.change(searchInput, { target: { value: 'NonExistentGoal12345' } });

      expect(screen.getByTestId('empty-goals')).toBeInTheDocument();
      expect(screen.queryByTestId('goals-cards-grid')).not.toBeInTheDocument();

      // Clear search
      fireEvent.change(searchInput, { target: { value: '' } });
      expect(screen.getByTestId('goals-cards-grid')).toBeInTheDocument();

      // Filter by status
      const statusSelect = screen.getByTestId('filter-goals-status');
      fireEvent.change(statusSelect, { target: { value: 'on_track' } });
      expect(screen.getByTestId('goals-cards-grid')).toBeInTheDocument();
    });

    it('4.3 executes 1-click proactive recommendation and updates visual state', async () => {
      const data = buildFunnelGoalsCockpitData({
        funnelOutcome: null,
        goals: [],
        projectId: 'test-dash',
      });

      renderWithIntl(
        <FunnelGoalsDashboard
          orgId="org-1"
          projectId="test-dash"
          cockpitData={data}
          canExecute
        />,
      );

      const applyBtn = screen.getByTestId('apply-funnel-rec-btn');
      expect(applyBtn).toBeInTheDocument();

      fireEvent.click(applyBtn);

      // After clicking, should show applied badge
      const badge = await screen.findByTestId('rec-applied-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Optimization active!');
    });
  });
});
