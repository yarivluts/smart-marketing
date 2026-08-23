import type { QualityMixAlertModel, QualityMixAlertStatus, WarehouseRow } from '@growthos/firebase-orm-models';
import type { SignupQualityScoreTier } from '@growthos/shared';
import { toNumber } from './board-view';

/**
 * A plain, serializable projection of one `QualityMixAlertModel` (KAN-83).
 * Client components can only ever receive plain data across the RSC
 * boundary, never an `@arbel/firebase-orm` model instance — same reasoning
 * as `toTrackingAlertView`.
 */
export interface QualityMixAlertView {
  id: string;
  channelId: string;
  status: QualityMixAlertStatus;
  detectedAt: string;
  baselineAvgScore: number;
  currentAvgScore: number;
  delta: number;
  lastCheckedAt: string;
  resolvedAt: string | null;
}

export function toQualityMixAlertView(alert: QualityMixAlertModel): QualityMixAlertView {
  return {
    id: alert.id,
    channelId: alert.channel_id,
    status: alert.status,
    detectedAt: alert.detected_at,
    baselineAvgScore: alert.baseline_avg_score,
    currentAvgScore: alert.current_avg_score,
    delta: alert.delta,
    lastCheckedAt: alert.last_checked_at,
    resolvedAt: alert.resolved_at ?? null,
  };
}

/** The `IntentQuality` translation key for one mix-shift alert's status label — mirrors `trackingAlertStatusLabelKey`. */
const QUALITY_MIX_ALERT_STATUS_LABEL_KEYS: Record<QualityMixAlertStatus, 'mixAlertStatusActive' | 'mixAlertStatusResolved'> = {
  active: 'mixAlertStatusActive',
  resolved: 'mixAlertStatusResolved',
};

export function qualityMixAlertStatusLabelKey(status: QualityMixAlertStatus): 'mixAlertStatusActive' | 'mixAlertStatusResolved' {
  return QUALITY_MIX_ALERT_STATUS_LABEL_KEYS[status];
}

/** One dimension value's folded quality-score totals — the row shape the Intent & Quality page's channel/cohort breakdown tables render. */
export interface SignupQualityScoreDimensionBreakdownRow {
  value: string;
  /** `null` when zero signups landed for this value in the queried window (avoids a misleading `0` average). */
  averageScore: number | null;
  sampleSize: number;
}

/**
 * Flattens `getSignupQualityScoreDimensionBreakdownForProject`'s raw
 * `WarehouseRow[]` (a `signup_quality_score_sum`/`signups_scored`
 * two-metric series) into the plain `{value, averageScore, sampleSize}`
 * shape the page's breakdown tables render — sums both series per distinct
 * dimension value first (the compiler always buckets by its own
 * `bucket_date` regardless of the requested dimensions, so a value with
 * signups spread across more than one bucket comes back as more than one
 * row — the same accumulate-then-divide pattern
 * `toCancellationReasonDimensionBreakdownRows` uses for its own sum-only
 * case), then divides once at the very end — never averages an average, see
 * `getSignupQualityScoreDimensionBreakdownForProject`'s own doc comment for
 * why that distinction matters here. Highest average first, most-signups
 * first among ties, alphabetical after that, for a deterministic order.
 */
export function toSignupQualityScoreDimensionBreakdownRows(rows: readonly WarehouseRow[], dimension: string): SignupQualityScoreDimensionBreakdownRow[] {
  const totalsByValue = new Map<string, { sumScore: number; sampleSize: number }>();
  for (const row of rows) {
    const value = String(row[dimension] ?? '');
    const sumScore = toNumber(row.signup_quality_score_sum ?? null);
    const sampleSize = toNumber(row.signups_scored ?? null);
    const existing = totalsByValue.get(value) ?? { sumScore: 0, sampleSize: 0 };
    totalsByValue.set(value, { sumScore: existing.sumScore + sumScore, sampleSize: existing.sampleSize + sampleSize });
  }
  return Array.from(totalsByValue.entries())
    .map(([value, totals]) => ({
      value,
      averageScore: totals.sampleSize > 0 ? totals.sumScore / totals.sampleSize : null,
      sampleSize: totals.sampleSize,
    }))
    .sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1) || b.sampleSize - a.sampleSize || a.value.localeCompare(b.value));
}

/** Translation key for a `signupQualityScoreTier` value — a small, fixed set, same "map a fixed data-driven category through i18n" posture `feedbackThemeLabelKey`/`cancellationReasonThemeLabelKey` establish. */
export function signupQualityScoreTierLabelKey(tier: SignupQualityScoreTier): string {
  switch (tier) {
    case 'low':
      return 'tierLow';
    case 'medium':
      return 'tierMedium';
    case 'high':
      return 'tierHigh';
    default:
      return tier;
  }
}
