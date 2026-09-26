import { describe, expect, it } from 'vitest';
import type { TrialPipelineOutcome } from '@growthos/firebase-orm-models';
import { toTrialPipelineWidgetView } from './trial-pipeline-view';

/**
 * The widget's query returns its 30-day window as ONE `total`-grain row, so each figure is the
 * window's own value computed by the warehouse. It once read 30 daily buckets and either summed
 * them (a steady 20% conversion reported 600%) or took the latest day (a steady 100 open trials
 * reported only the trials started that day, and one day's rate stood in for the window's).
 */
describe('toTrialPipelineWidgetView', () => {
  it('reads both figures off the single whole-window row', () => {
    const outcome: TrialPipelineOutcome = {
      ok: true,
      series: [{ bucket_date: '2026-06-03', trials_active: 42, trial_conversion_rate: 2 / 101 }],
    };

    const view = toTrialPipelineWidgetView(outcome);
    expect(view.status === 'ok' && view.activeTrials).toBe(42);
    // The window's rate over its totals (2 conversions of 101 trial starts), not a mean of daily rates.
    expect(view.status === 'ok' && view.conversionRatePct).toBeCloseTo(1.98, 2);
  });

  it('returns null, not zero, when the window reported no value', () => {
    // "No trial data" and "no trials are open" are different statements, and a zero asserts the
    // second one.
    const outcome: TrialPipelineOutcome = {
      ok: true,
      series: [{ bucket_date: '2026-06-03', trials_active: null, trial_conversion_rate: null }],
    };

    expect(toTrialPipelineWidgetView(outcome)).toEqual({ status: 'ok', activeTrials: null, conversionRatePct: null });
  });

  it('returns nulls for an empty result', () => {
    const outcome: TrialPipelineOutcome = { ok: true, series: [] };
    expect(toTrialPipelineWidgetView(outcome)).toEqual({ status: 'ok', activeTrials: null, conversionRatePct: null });
  });

  it('keeps a measured zero as a real reading', () => {
    const outcome: TrialPipelineOutcome = {
      ok: true,
      series: [{ bucket_date: '2026-06-03', trials_active: 0, trial_conversion_rate: 0 }],
    };

    const view = toTrialPipelineWidgetView(outcome);
    expect(view.status === 'ok' && view.activeTrials).toBe(0);
    expect(view.status === 'ok' && view.conversionRatePct).toBe(0);
  });

  it('maps a degraded outcome to an "unavailable" view, passing the reason through', () => {
    const outcome: TrialPipelineOutcome = { ok: false, reason: 'warehouse_not_configured', message: 'nope' };
    expect(toTrialPipelineWidgetView(outcome)).toEqual({ status: 'unavailable', reason: 'warehouse_not_configured' });
  });
});
