import { describe, expect, it } from 'vitest';
import type { TrialPipelineOutcome } from '@growthos/firebase-orm-models';
import { toTrialPipelineWidgetView } from './trial-pipeline-view';

describe('toTrialPipelineWidgetView', () => {
  it('sums active-trial counts and converts the rate to a percentage', () => {
    const outcome: TrialPipelineOutcome = {
      ok: true,
      series: [
        { bucket_date: '2026-07-01', trials_active: 10, trial_conversion_rate: 0.1 },
        { bucket_date: '2026-07-02', trials_active: 12, trial_conversion_rate: 0.1 },
      ],
    };

    expect(toTrialPipelineWidgetView(outcome)).toEqual({ status: 'ok', activeTrials: 22, conversionRatePct: 20 });
  });

  it('returns a null conversion rate when no row has a conversion-rate value (e.g. no trials started yet)', () => {
    const outcome: TrialPipelineOutcome = {
      ok: true,
      series: [{ bucket_date: '2026-07-01', trials_active: 5, trial_conversion_rate: null }],
    };

    expect(toTrialPipelineWidgetView(outcome)).toEqual({ status: 'ok', activeTrials: 5, conversionRatePct: null });
  });

  it('returns 0 active trials for an empty series', () => {
    const outcome: TrialPipelineOutcome = { ok: true, series: [] };
    expect(toTrialPipelineWidgetView(outcome)).toEqual({ status: 'ok', activeTrials: 0, conversionRatePct: null });
  });

  it('maps a degraded outcome to an "unavailable" view, passing the reason through', () => {
    const outcome: TrialPipelineOutcome = { ok: false, reason: 'warehouse_not_configured', message: 'nope' };
    expect(toTrialPipelineWidgetView(outcome)).toEqual({ status: 'unavailable', reason: 'warehouse_not_configured' });
  });
});
