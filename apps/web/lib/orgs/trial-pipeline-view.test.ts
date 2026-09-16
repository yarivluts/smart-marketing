import { describe, expect, it } from 'vitest';
import type { TrialPipelineOutcome } from '@growthos/firebase-orm-models';
import { toTrialPipelineWidgetView } from './trial-pipeline-view';

/**
 * This suite used to assert the defect. Its first case fed two days at 10% each and expected
 * `conversionRatePct: 20`, and its name said "sums active-trial counts" - the summing was the
 * documented behaviour.
 *
 * The query returns 30 daily buckets, and neither figure survives being summed across them. A
 * steady 100 open trials reported 3,000 "in trial now"; a steady 20% conversion reported 600%.
 * The error is not a rounding approximation, it scales with the window length.
 */
describe('toTrialPipelineWidgetView', () => {
  it('reports the latest bucket, not the sum across the window', () => {
    const outcome: TrialPipelineOutcome = {
      ok: true,
      series: [
        { bucket_date: '2026-07-01', trials_active: 10, trial_conversion_rate: 0.1 },
        { bucket_date: '2026-07-02', trials_active: 12, trial_conversion_rate: 0.1 },
      ],
    };

    expect(toTrialPipelineWidgetView(outcome)).toEqual({
      status: 'ok',
      activeTrials: 12,
      conversionRatePct: 10,
      asOfBucket: '2026-07-02',
    });
  });

  it('does not depend on the order rows arrive in', () => {
    const outcome: TrialPipelineOutcome = {
      ok: true,
      series: [
        { bucket_date: '2026-07-03', trials_active: 7, trial_conversion_rate: 0.25 },
        { bucket_date: '2026-07-01', trials_active: 99, trial_conversion_rate: 0.9 },
      ],
    };

    const view = toTrialPipelineWidgetView(outcome);
    expect(view.status === 'ok' && view.activeTrials).toBe(7);
    expect(view.status === 'ok' && view.conversionRatePct).toBe(25);
  });

  it('falls back to the latest bucket that actually reported each figure', () => {
    // A metric can stop reporting before the window ends; the last real reading is still the
    // most recent thing known, and is better than claiming nothing is known.
    const outcome: TrialPipelineOutcome = {
      ok: true,
      series: [
        { bucket_date: '2026-07-01', trials_active: 5, trial_conversion_rate: 0.4 },
        { bucket_date: '2026-07-02', trials_active: 6, trial_conversion_rate: null },
      ],
    };

    const view = toTrialPipelineWidgetView(outcome);
    expect(view.status === 'ok' && view.activeTrials).toBe(6);
    expect(view.status === 'ok' && view.conversionRatePct).toBe(40);
  });

  it('returns null, not zero, when no row reported a figure', () => {
    // "No trial data" and "no trials are open" are different statements, and a zero asserts the
    // second one.
    const outcome: TrialPipelineOutcome = {
      ok: true,
      series: [{ bucket_date: '2026-07-01', trials_active: null, trial_conversion_rate: null }],
    };

    expect(toTrialPipelineWidgetView(outcome)).toEqual({
      status: 'ok',
      activeTrials: null,
      conversionRatePct: null,
      asOfBucket: null,
    });
  });

  it('returns nulls for an empty series', () => {
    const outcome: TrialPipelineOutcome = { ok: true, series: [] };
    expect(toTrialPipelineWidgetView(outcome)).toEqual({
      status: 'ok',
      activeTrials: null,
      conversionRatePct: null,
      asOfBucket: null,
    });
  });

  it('keeps a measured zero as a real reading', () => {
    const outcome: TrialPipelineOutcome = {
      ok: true,
      series: [{ bucket_date: '2026-07-01', trials_active: 0, trial_conversion_rate: 0 }],
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
