import type { GoalsCockpitSummary } from './funnel-goals-synthesizer';

/** The translated pieces the goals page's KPI row is built from - passed in so this stays a pure function. */
export interface GoalsKpiText {
  formatNumber: (value: number) => string;
  ofMeasured: (count: number, total: number) => string;
  percent: (percent: number) => string;
  /** The empty-value glyph shown where there is nothing to average. */
  emptyValue: string;
  /** Why the average is empty. */
  avgProgressNone: string;
}

export interface GoalsKpiValues {
  onTrack: string;
  needsAttention: string;
  avgProgress: string;
  avgProgressSubtext?: string;
  /** 0..100 for the progress bar; undefined when there is no measured average to draw. */
  avgProgressBar?: number;
}

/**
 * The goals page's KPI values. A count over a known set of goals is always a number - with no goal
 * measured, "on track" and "needs attention" are 0, not "No data". Only the average, which has
 * nothing to average until a goal is measured, renders as an empty value with a one-line reason
 * (never a 0% that reads like a measured result).
 */
export function buildGoalsKpiValues(
  summary: Pick<GoalsCockpitSummary, 'measuredGoalsCount' | 'onTrackCount' | 'atRiskCount' | 'offTrackCount' | 'averageProgressPct'>,
  text: GoalsKpiText,
): GoalsKpiValues {
  const needsAttention = summary.atRiskCount + summary.offTrackCount;
  const hasAverage = summary.averageProgressPct !== null;
  return {
    onTrack:
      summary.measuredGoalsCount > 0
        ? text.ofMeasured(summary.onTrackCount, summary.measuredGoalsCount)
        : text.formatNumber(summary.onTrackCount),
    needsAttention: text.formatNumber(needsAttention),
    avgProgress: summary.averageProgressPct !== null ? text.percent(summary.averageProgressPct) : text.emptyValue,
    avgProgressSubtext: hasAverage ? undefined : text.avgProgressNone,
    avgProgressBar: summary.averageProgressPct ?? undefined,
  };
}
