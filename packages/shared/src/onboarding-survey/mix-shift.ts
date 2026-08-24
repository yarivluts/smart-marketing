/**
 * KAN-83's "mix-shift alert" threshold rule (plan `14 §Gap 4`: "alert when a
 * channel's intent mix degrades even if CPS looks fine — classic Meta
 * failure mode"). A minimum-sample-size gate plus a two-threshold hysteresis
 * band, the same shape `TRACKING_ALERT_SILENCE_THRESHOLD_MS`
 * (KAN-36) established for its own single-threshold episode rule, extended
 * with a second, lower "resolve" threshold so a channel sitting right at the
 * boundary doesn't flap an alert open/closed on every check — the same
 * reasoning a thermostat's own deadband exists for.
 *
 * `MIN_SAMPLE_SIZE = 5`: below this, a channel's average score is mostly
 * noise (one particularly bad or good signup can swing a 2-3-sample average
 * by 20+ points) — not enough to act on, so the evaluation reports
 * `insufficient_data` rather than firing (or resolving) on a number that
 * isn't yet meaningful.
 *
 * `FIRE_THRESHOLD_POINTS = 15`: a 15-point drop in a channel's average
 * quality score (out of the 0-100 scale `computeSignupQualityScore` blends
 * onto) is roughly the gap between two adjacent budget/company-size/urgency
 * bands in that scoring function — i.e. this fires when a channel's typical
 * signup has genuinely shifted down a whole tier (e.g. mostly
 * `10k_50k`-budget signups becoming mostly `1k_10k`-budget), not on ordinary
 * sample noise within one tier.
 *
 * `RESOLVE_THRESHOLD_POINTS = 8`: roughly half the fire threshold — a
 * channel has to recover more than half the way back before the episode
 * closes, so a shift that's still real (just no longer *severe* enough to
 * re-fire from scratch) doesn't immediately flip to resolved and then back
 * to active on the next check.
 */
export const QUALITY_MIX_SHIFT_MIN_SAMPLE_SIZE = 5;
export const QUALITY_MIX_SHIFT_FIRE_THRESHOLD_POINTS = 15;
export const QUALITY_MIX_SHIFT_RESOLVE_THRESHOLD_POINTS = 8;

export type QualityMixShiftAction = 'insufficient_data' | 'healthy' | 'fire' | 'still_active' | 'resolve';

export interface QualityMixShiftCheckInput {
  /** One channel's average signup quality score over an earlier baseline window. */
  readonly baselineAvgScore: number;
  /** How many scored signups the baseline window had for this channel. */
  readonly baselineSampleSize: number;
  /** The same channel's average signup quality score over the current (most recent) window. */
  readonly currentAvgScore: number;
  /** How many scored signups the current window has for this channel. */
  readonly currentSampleSize: number;
  /** Whether this channel already has an `active` mix-shift alert episode open. */
  readonly isCurrentlyActive: boolean;
}

export interface QualityMixShiftEvaluation {
  /** `baselineAvgScore - currentAvgScore` — positive means quality degraded, negative means it improved. Always computed, even when `hasEnoughData` is false, purely for display. */
  readonly delta: number;
  readonly hasEnoughData: boolean;
  readonly action: QualityMixShiftAction;
}

/**
 * Pure decision function: given one channel's baseline vs. current average
 * quality score (and whether it already has an alert open), decides what a
 * "check now" pass should do — mirrors `evaluateEventForAlert`'s
 * (KAN-36) inline threshold check, pulled out as its own pure, unit-tested
 * function since this rule has two thresholds (hysteresis) rather than one.
 * Never mutates anything or reads the clock — the caller (a Firestore
 * service, same posture `evaluateEventForAlert` establishes) is responsible
 * for turning `action` into an actual episode create/update/resolve.
 */
export function evaluateQualityMixShift(input: QualityMixShiftCheckInput): QualityMixShiftEvaluation {
  const delta = input.baselineAvgScore - input.currentAvgScore;
  const hasEnoughData =
    input.baselineSampleSize >= QUALITY_MIX_SHIFT_MIN_SAMPLE_SIZE && input.currentSampleSize >= QUALITY_MIX_SHIFT_MIN_SAMPLE_SIZE;

  if (!hasEnoughData) {
    return { delta, hasEnoughData, action: 'insufficient_data' };
  }

  if (delta >= QUALITY_MIX_SHIFT_FIRE_THRESHOLD_POINTS) {
    return { delta, hasEnoughData, action: input.isCurrentlyActive ? 'still_active' : 'fire' };
  }

  if (delta < QUALITY_MIX_SHIFT_RESOLVE_THRESHOLD_POINTS) {
    return { delta, hasEnoughData, action: input.isCurrentlyActive ? 'resolve' : 'healthy' };
  }

  // The hysteresis dead zone: not severe enough to fire fresh, not recovered
  // enough to resolve an already-open episode.
  return { delta, hasEnoughData, action: input.isCurrentlyActive ? 'still_active' : 'healthy' };
}
