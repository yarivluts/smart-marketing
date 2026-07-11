import type { TrialPipelineOutcome } from '@growthos/firebase-orm-models';
import { sumMetric } from './board-view';

export type TrialPipelineWidgetView =
  | { status: 'ok'; activeTrials: number; conversionRatePct: number | null }
  | { status: 'unavailable'; reason: 'warehouse_not_configured' | 'quota_exceeded' | 'query_error' };

/**
 * Maps the trial-pipeline query outcome to the widget's own render shape:
 * "in trial now -> converting at X%" (KAN-66, `14` gap 14). Reuses
 * `board-view.ts`'s own `sumMetric` — the same convention every `big_number`
 * tile in this codebase already collapses a bucketed series with, including
 * formula-kind ratio metrics like `cac`/`conversion_to_paying` (see the SaaS
 * pack's own default boards). Summing a per-day ratio across many days is an
 * approximation, not a true "rate over the whole window" — a known, shared
 * limitation of the bucketed-big-number pattern itself, not something
 * specific to this widget, so it's left as-is rather than re-solved here.
 */
export function toTrialPipelineWidgetView(outcome: TrialPipelineOutcome): TrialPipelineWidgetView {
  if (!outcome.ok) {
    return { status: 'unavailable', reason: outcome.reason };
  }
  const activeTrials = sumMetric(outcome.series, 'trials_active');
  const hasConversionData = outcome.series.some((row) => row.trial_conversion_rate !== null && row.trial_conversion_rate !== undefined);
  const conversionRatePct = hasConversionData ? sumMetric(outcome.series, 'trial_conversion_rate') * 100 : null;
  return { status: 'ok', activeTrials, conversionRatePct };
}
