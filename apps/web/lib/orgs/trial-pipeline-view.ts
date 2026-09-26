import type { TrialPipelineOutcome } from '@growthos/firebase-orm-models';
import { readPeriodValue } from '@growthos/shared';

export type TrialPipelineWidgetView =
  | { status: 'ok'; activeTrials: number | null; conversionRatePct: number | null }
  | { status: 'unavailable'; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'not_yet_backed' | 'query_error' };

/**
 * Maps the trial-pipeline query outcome to the widget's own render shape: "in trial now ->
 * converting at X%" (KAN-66, `14` gap 14).
 *
 * The query returns the whole trailing window as ONE bucket (`total` grain, see
 * `getTrialPipelineSummary`), so each figure is read straight off that row - the window's own
 * value, computed by the warehouse:
 *
 *   - `trials_active` - every subscription started in the window that is still trialing. Summing
 *     daily buckets would still be right for it (each subscription lands in one day), but reading
 *     only the latest day, as this widget once did, counted just the trials started that day.
 *   - `trial_conversion_rate` - the window's conversions over its trial starts. Neither the sum of
 *     the daily rates (600% for a steady 20% over 30 days) nor their mean (a quiet day weighted
 *     like a busy one) nor the latest day's rate is that number; only the formula over the period's
 *     totals is.
 *
 * Each figure is null when the window reported nothing, which the widget renders as unknown rather
 * than as zero - a project with no trial data has no trials pipeline to report, which is a
 * different statement from "no trials are open".
 */
export function toTrialPipelineWidgetView(outcome: TrialPipelineOutcome): TrialPipelineWidgetView {
  if (!outcome.ok) {
    return { status: 'unavailable', reason: outcome.reason };
  }

  const activeTrials = readPeriodValue(outcome.series, 'trials_active');
  const rate = readPeriodValue(outcome.series, 'trial_conversion_rate');

  return {
    status: 'ok',
    activeTrials,
    conversionRatePct: rate === null ? null : rate * 100,
  };
}
