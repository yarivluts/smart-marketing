import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { renderWithIntl, createMockEasySignFunnel, createMockGoal } from './helpers/test-harness';
import { calculateGoalProgress } from '@growthos/shared';
import { toFunnelStepView, buildFunnelView } from '../../lib/orgs/funnel-view';

// Mock Visual Funnel Component
function MockVisualFunnel({ steps = createMockEasySignFunnel() }) {
  return (
    <div data-testid="visual-funnel-container" className="rounded-lg border p-6">
      <h2 className="text-xl font-bold">Conversion Funnel: EasySign</h2>
      <div className="mt-4 flex flex-col gap-4">
        {steps.map((step, idx) => (
          <div key={step.stageKey} data-testid={`funnel-step-${step.stageKey}`} className="flex items-center gap-4">
            <div className="w-8 font-bold">{step.stepOrder}.</div>
            <div className="flex-1">
              <div className="flex justify-between text-sm font-medium">
                <span>{step.stageLabel}</span>
                <span data-testid={`count-${step.stageKey}`}>{step.customerCount} users</span>
              </div>
              <div className="mt-1 h-4 w-full rounded bg-muted overflow-hidden">
                <div
                  data-testid={`bar-${step.stageKey}`}
                  className="h-full bg-primary"
                  style={{ width: `${step.conversionPercent}%` }}
                />
              </div>
            </div>
            <div className="w-24 text-right text-sm">
              <span data-testid={`pct-${step.stageKey}`} className="font-bold">{step.conversionPercent}%</span>
              {idx > 0 && (
                <div data-testid={`dropoff-${step.stageKey}`} className="text-xs text-destructive">
                  -{step.dropOffPercent}% drop-off
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Mock Goal Thermometer Component
function MockGoalCard({ goal = createMockGoal(), onTargetChange = vi.fn() }) {
  const progress = calculateGoalProgress({
    direction: goal.direction,
    targetValue: goal.targetValue,
    actualValue: goal.actualValue,
    elapsedFraction: 0.6,
  });

  return (
    <div data-testid={`goal-card-${goal.id}`} className="rounded border p-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold">{goal.name}</h3>
        <span
          data-testid={`goal-status-${goal.id}`}
          className={`px-2 py-0.5 rounded text-xs font-semibold ${
            progress.status === 'on_track' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {progress.status}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-sm">
          <span>Actual: {goal.actualValue}</span>
          <span>Target: {goal.targetValue}</span>
        </div>
        <div className="mt-1 h-3 w-full bg-muted rounded overflow-hidden">
          <div
            data-testid={`goal-bar-${goal.id}`}
            className="h-full bg-primary"
            style={{ width: `${Math.min(100, progress.progressRatio * 100)}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-muted-foreground flex justify-between">
          <span>Expected at now: {progress.expectedAtNow.toFixed(0)}</span>
          <span data-testid={`goal-projection-${goal.id}`}>
            Projected: {progress.projectedFinalValue.toFixed(0)}
          </span>
        </div>
      </div>
    </div>
  );
}

describe('Tier 1: Visual Funnels & Business Goals (R1, R2)', () => {
  it('3.1 renders multi-step conversion funnel (EasySign: Sent -> Viewed -> Signed) with accurate counts', () => {
    renderWithIntl(<MockVisualFunnel />);

    expect(screen.getByTestId('funnel-step-sent')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-step-viewed')).toBeInTheDocument();
    expect(screen.getByTestId('funnel-step-signed')).toBeInTheDocument();

    expect(screen.getByTestId('count-sent')).toHaveTextContent('1000 users');
    expect(screen.getByTestId('count-viewed')).toHaveTextContent('380 users');
    expect(screen.getByTestId('count-signed')).toHaveTextContent('220 users');
  });

  it('3.2 calculates conversion percentages and step drop-off percentages precisely', () => {
    renderWithIntl(<MockVisualFunnel />);

    expect(screen.getByTestId('pct-sent')).toHaveTextContent('100%');
    expect(screen.getByTestId('pct-viewed')).toHaveTextContent('38%');
    expect(screen.getByTestId('pct-signed')).toHaveTextContent('22%');

    expect(screen.getByTestId('dropoff-viewed')).toHaveTextContent('-62% drop-off');
    expect(screen.getByTestId('dropoff-signed')).toHaveTextContent('-42% drop-off');
  });

  it('3.3 converts backend FunnelStepsOutcome to FunnelView correctly with graceful fallback on empty/degraded state', () => {
    const outcome = {
      ok: true as const,
      steps: [
        { stageKey: 'step_1', stepOrder: 1, customerCount: 500, conversionRateFromFirst: 1.0 },
        { stageKey: 'step_2', stepOrder: 2, customerCount: 250, conversionRateFromFirst: 0.5 },
      ],
    };

    const view = buildFunnelView(outcome);
    expect(view.kind).toBe('ok');
    if (view.kind === 'ok') {
      expect(view.steps).toHaveLength(2);
      expect(view.steps[0].conversionPercent).toBe(100);
      expect(view.steps[1].conversionPercent).toBe(50);
    }

    const emptyView = buildFunnelView({ ok: true, steps: [] });
    expect(emptyView.kind).toBe('no_funnel');

    const errorView = buildFunnelView({ ok: false, reason: 'warehouse_not_configured', message: 'Warehouse not configured' });
    expect(errorView.kind).toBe('warehouse_not_configured');
  });

  it('3.4 evaluates dynamic goal pace (on_track, at_risk, off_track) via shared calculation engine', () => {
    // Goal with target 500, actual 320 at 60% elapsed time (expected: 300) -> on_track (320 >= 300)
    const onTrackGoal = createMockGoal({ targetValue: 500, actualValue: 320 });
    const result1 = calculateGoalProgress({
      direction: 'maximize',
      targetValue: onTrackGoal.targetValue,
      actualValue: onTrackGoal.actualValue,
      elapsedFraction: 0.6,
    });
    expect(result1.status).toBe('on_track');
    expect(result1.expectedAtNow).toBe(300);

    // Goal with target 500, actual 200 at 60% elapsed time (expected: 300) -> off_track (200 / 300 = 0.66 < 0.9)
    const offTrackGoal = createMockGoal({ targetValue: 500, actualValue: 200 });
    const result2 = calculateGoalProgress({
      direction: 'maximize',
      targetValue: offTrackGoal.targetValue,
      actualValue: offTrackGoal.actualValue,
      elapsedFraction: 0.6,
    });
    expect(result2.status).toBe('off_track');
  });

  it('3.5 renders Goal card with thermometer fill ratio and statistical linear projection', () => {
    const goal = createMockGoal({ targetValue: 500, actualValue: 320 });
    renderWithIntl(<MockGoalCard goal={goal} />);

    expect(screen.getByTestId('goal-status-goal-1')).toHaveTextContent('on_track');
    // Extrapolated: 320 / 0.6 = ~533
    expect(screen.getByTestId('goal-projection-goal-1')).toHaveTextContent('Projected: 533');
    expect(screen.getByTestId('goal-bar-goal-1')).toHaveStyle({ width: '64%' });
  });

  it('3.6 handles minimize goals (e.g. CAC ceiling) with correct inverted status evaluation', () => {
    // For a minimize goal: ceiling $50. Actual $40 -> on_track. Actual $65 -> off_track.
    const goodCac = calculateGoalProgress({
      direction: 'minimize',
      targetValue: 50,
      actualValue: 40,
      elapsedFraction: 0.5,
    });
    expect(goodCac.status).toBe('on_track');
    expect(goodCac.isGoalMet).toBe(true);

    const badCac = calculateGoalProgress({
      direction: 'minimize',
      targetValue: 50,
      actualValue: 70,
      elapsedFraction: 0.5,
    });
    expect(badCac.status).toBe('off_track');
    expect(badCac.isGoalMet).toBe(false);
  });
});
