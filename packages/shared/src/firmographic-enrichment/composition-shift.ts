/**
 * KAN-87's "composition-shift alert" threshold rule (plan `14 §Gap 11`:
 * "composition-shift alerts" alongside "# vs $" composition dashboards). A
 * minimum-sample-size gate plus a two-threshold hysteresis band — the same
 * shape `evaluateQualityMixShift` (KAN-83) established for its own
 * baseline-vs-current comparison, generalized here from "a channel's
 * average score dropped" (one direction only matters) to "an industry's
 * share of the customer base moved" (either direction is a real
 * composition shift worth surfacing — a segment growing from 10% to 30% of
 * the base is just as notable as one shrinking from 30% to 10%), so this
 * rule fires on the *absolute* delta rather than only a decrease.
 *
 * `MIN_SAMPLE_SIZE = 5`: below this, a window's total profile count is
 * mostly noise (one or two new signups can swing a small window's industry
 * mix by 20+ points) — not enough to act on, same reasoning
 * `QUALITY_MIX_SHIFT_MIN_SAMPLE_SIZE` gives for its own gate.
 *
 * `FIRE_THRESHOLD_SHARE_POINTS = 0.15` (15 percentage points): a share
 * shift this size means an industry that used to be roughly a third of new
 * profiles is now under a fifth (or vice versa) — a genuine mix change, not
 * ordinary sampling noise between two adjacent windows.
 *
 * `RESOLVE_THRESHOLD_SHARE_POINTS = 0.08`: roughly half the fire threshold
 * — same "recover more than half the way back before the episode closes"
 * hysteresis reasoning `QUALITY_MIX_SHIFT_RESOLVE_THRESHOLD_POINTS`
 * documents, so a shift that's still real (just no longer severe enough to
 * re-fire) doesn't flap open/closed on the next check.
 */
export const COMPOSITION_SHIFT_MIN_SAMPLE_SIZE = 5;
export const COMPOSITION_SHIFT_FIRE_THRESHOLD_SHARE_POINTS = 0.15;
export const COMPOSITION_SHIFT_RESOLVE_THRESHOLD_SHARE_POINTS = 0.08;

export type CompositionShiftAction = 'insufficient_data' | 'healthy' | 'fire' | 'still_active' | 'resolve';

export interface CompositionShiftCheckInput {
  /** This category's share (0-1) of the baseline window's total profile count. */
  readonly baselineShare: number;
  /** The baseline window's total profile count across every category — the sample-size gate, not this category's own count. */
  readonly baselineSampleSize: number;
  /** This category's share (0-1) of the current window's total profile count. */
  readonly currentShare: number;
  /** The current window's total profile count across every category. */
  readonly currentSampleSize: number;
  /** Whether this category already has an `active` composition-shift alert episode open. */
  readonly isCurrentlyActive: boolean;
}

export interface CompositionShiftEvaluation {
  /** `abs(baselineShare - currentShare)` — always computed, even when `hasEnoughData` is false, purely for display. */
  readonly delta: number;
  readonly hasEnoughData: boolean;
  readonly action: CompositionShiftAction;
}

/**
 * Pure decision function: given one category's baseline vs. current share
 * of the total (and whether it already has an alert open), decides what a
 * "check now" pass should do — mirrors `evaluateQualityMixShift`'s
 * (KAN-83) own shape, generalized to a bidirectional share delta. Never
 * mutates anything or reads the clock — the caller (a Firestore service,
 * same posture `evaluateQualityMixShift`'s own caller establishes) is
 * responsible for turning `action` into an actual episode create/update/
 * resolve.
 */
export function evaluateCompositionShift(input: CompositionShiftCheckInput): CompositionShiftEvaluation {
  const delta = Math.abs(input.baselineShare - input.currentShare);
  const hasEnoughData =
    input.baselineSampleSize >= COMPOSITION_SHIFT_MIN_SAMPLE_SIZE && input.currentSampleSize >= COMPOSITION_SHIFT_MIN_SAMPLE_SIZE;

  if (!hasEnoughData) {
    return { delta, hasEnoughData, action: 'insufficient_data' };
  }

  if (delta >= COMPOSITION_SHIFT_FIRE_THRESHOLD_SHARE_POINTS) {
    return { delta, hasEnoughData, action: input.isCurrentlyActive ? 'still_active' : 'fire' };
  }

  if (delta < COMPOSITION_SHIFT_RESOLVE_THRESHOLD_SHARE_POINTS) {
    return { delta, hasEnoughData, action: input.isCurrentlyActive ? 'resolve' : 'healthy' };
  }

  // The hysteresis dead zone: not severe enough to fire fresh, not recovered enough to resolve an already-open episode.
  return { delta, hasEnoughData, action: input.isCurrentlyActive ? 'still_active' : 'healthy' };
}
