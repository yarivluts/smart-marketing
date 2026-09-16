import type { TrialPipelineOutcome } from '@growthos/firebase-orm-models';
import type { WarehouseRow } from '@growthos/firebase-orm-models';
import { toNumber } from './board-view';

export type TrialPipelineWidgetView =
  | { status: 'ok'; activeTrials: number | null; conversionRatePct: number | null; asOfBucket: string | null }
  | { status: 'unavailable'; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'not_yet_backed' | 'query_error' };

/**
 * The most recent bucket that carries a value for `metricName`, or null if none does.
 *
 * Both of this widget's figures are point-in-time readings, and the query returns 30 daily
 * buckets. Neither can be collapsed by summing:
 *
 *   - `trials_active` is a gauge, not a flow. A project with a steady 100 trials open reported
 *     3,000 "in trial now" - the same 100 counted once per day of the window.
 *   - `trial_conversion_rate` is a ratio. A steady 20% summed across 30 days and multiplied by
 *     100 reported 600%, a figure that grows without bound with the window length.
 *
 * This used to call `sumMetric` for both, with a comment calling the result "an approximation,
 * not a true rate over the whole window" and deferring to the shared big-number convention. It
 * is not an approximation of anything: 600% is not a nearby estimate of 20%, and the error
 * scales with how long the window is. The convention is right for a flow like signups and wrong
 * for a gauge or a ratio.
 *
 * Averaging the daily ratios would be closer but still wrong - an unweighted mean over days
 * with very different trial volumes is not the window's conversion rate, and computing the real
 * one needs the numerator and denominator, which a ratio metric has already thrown away. The
 * latest bucket is the one reading that is exactly true, and it is what the labels ("In trial
 * now", "Converting at") already promise.
 */
function latestValue(series: readonly WarehouseRow[], metricName: string): { value: number; bucket: string } | null {
  let latest: { value: number; bucket: string } | null = null;
  for (const row of series) {
    const raw = row[metricName];
    if (raw === null || raw === undefined) {
      continue;
    }
    const bucket = String(row.bucket_date ?? '');
    if (latest === null || bucket.localeCompare(latest.bucket) > 0) {
      latest = { value: toNumber(raw), bucket };
    }
  }
  return latest;
}

/**
 * Maps the trial-pipeline query outcome to the widget's own render shape: "in trial now ->
 * converting at X%" (KAN-66, `14` gap 14).
 *
 * Each figure is null when no bucket reported it, which the widget renders as unknown rather
 * than as zero - a project with no trial data has no trials pipeline to report, which is a
 * different statement from "no trials are open".
 */
export function toTrialPipelineWidgetView(outcome: TrialPipelineOutcome): TrialPipelineWidgetView {
  if (!outcome.ok) {
    return { status: 'unavailable', reason: outcome.reason };
  }

  const active = latestValue(outcome.series, 'trials_active');
  const rate = latestValue(outcome.series, 'trial_conversion_rate');

  return {
    status: 'ok',
    activeTrials: active === null ? null : active.value,
    conversionRatePct: rate === null ? null : rate.value * 100,
    asOfBucket: active?.bucket ?? rate?.bucket ?? null,
  };
}
