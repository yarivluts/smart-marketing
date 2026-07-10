/**
 * Pure goal-progress math for KAN-64 (E12.1, plan `04 §6`): a goal pins any
 * metric to a target/range and a deadline, and this module computes where
 * the goal stands right now (a thermometer fill + on_track/at_risk/off_track
 * pace status) and a v1 **linear** projection of where it will land by the
 * deadline — not an AI projection, a deliberately simple placeholder the plan
 * calls out as a later upgrade. Firestore-free, deterministic: every function
 * here takes its "now" as an explicit `asOfDate` parameter rather than ever
 * calling `Date.now()`/`new Date()` internally, so the whole module is
 * unit-testable without mocking the clock (mirrors `metrics-compiler/time.ts`
 * and `touchpoint-capture`'s pure-function style).
 */

export const GOAL_DIRECTIONS = ['maximize', 'minimize', 'range'] as const;
export type GoalDirection = (typeof GOAL_DIRECTIONS)[number];

export function isGoalDirection(value: string): value is GoalDirection {
  return (GOAL_DIRECTIONS as readonly string[]).includes(value);
}

export const GOAL_RHYTHMS = ['even', 'work_week_weekend'] as const;
export type GoalRhythm = (typeof GOAL_RHYTHMS)[number];

export function isGoalRhythm(value: string): value is GoalRhythm {
  return (GOAL_RHYTHMS as readonly string[]).includes(value);
}

export const GOAL_PACE_STATUSES = ['on_track', 'at_risk', 'off_track'] as const;
export type GoalPaceStatus = (typeof GOAL_PACE_STATUSES)[number];

/**
 * v1 fixed rhythm weight: under `work_week_weekend`, a Sat/Sun day counts as
 * this fraction of a Mon-Fri day's expected pace (most SaaS/marketing
 * activity is workday-skewed) — a deliberate v1 simplification, not
 * user-configurable yet.
 */
export const WEEKEND_RHYTHM_WEIGHT = 0.4;

/**
 * Buffer (as a fraction of the pace ratio) inside which a goal is "at_risk"
 * rather than fully "off_track" — v1 fixed constant, mirrors other
 * v1-fixed-threshold constants in this codebase (e.g. tracking-alert's
 * silence threshold).
 */
export const GOAL_AT_RISK_BUFFER = 0.1;

/** Parses a `YYYY-MM-DD` string as a UTC date-only value (midnight UTC), matching the convention in `metrics-compiler/time.ts`'s `parseDateOnly`. */
function parseDateOnlyUtc(value: string): number {
  return Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
  );
}

const MS_PER_DAY = 86_400_000;

/** Per-day pace weight for `rhythm` on the UTC day starting at `dayStartMs`. */
function dayWeight(dayStartMs: number, rhythm: GoalRhythm): number {
  if (rhythm === 'even') return 1;
  const dow = new Date(dayStartMs).getUTCDay(); // 0 = Sunday, 6 = Saturday
  return dow === 0 || dow === 6 ? WEEKEND_RHYTHM_WEIGHT : 1;
}

/** Sums `dayWeight` over every whole day in the half-open range `[startMs, endMs)`. */
function sumWeightedDays(startMs: number, endMs: number, rhythm: GoalRhythm): number {
  let total = 0;
  for (let day = startMs; day < endMs; day += MS_PER_DAY) {
    total += dayWeight(day, rhythm);
  }
  return total;
}

/**
 * Fraction (0..1) of a goal's `[startDate, deadline)` window elapsed as of
 * `asOfDate`, weighted by `rhythm` (an `even` rhythm just counts days; a
 * `work_week_weekend` rhythm discounts weekend days by
 * {@link WEEKEND_RHYTHM_WEIGHT} on both sides of the ratio, so a goal that's
 * "half its work-days in" reads as 0.5 even if the raw day count differs).
 * Dates are `YYYY-MM-DD`, parsed as UTC date-only to avoid timezone bugs.
 */
export function computeElapsedFraction(
  startDate: string,
  deadline: string,
  asOfDate: string,
  rhythm: GoalRhythm,
): number {
  const startMs = parseDateOnlyUtc(startDate);
  const deadlineMs = parseDateOnlyUtc(deadline);
  const asOfMs = parseDateOnlyUtc(asOfDate);

  if (deadlineMs <= startMs) return 1;
  if (asOfMs <= startMs) return 0;
  if (asOfMs >= deadlineMs) return 1;

  const totalWeight = sumWeightedDays(startMs, deadlineMs, rhythm);
  if (totalWeight <= 0) return 1;

  const elapsedWeight = sumWeightedDays(startMs, asOfMs, rhythm);
  const fraction = elapsedWeight / totalWeight;
  return Math.min(1, Math.max(0, fraction));
}

export interface GoalProgressInput {
  direction: GoalDirection;
  /** Required for 'maximize' | 'minimize'. */
  targetValue?: number;
  /** Required for 'range'. */
  rangeMin?: number;
  /** Required for 'range'. */
  rangeMax?: number;
  actualValue: number;
  /** 0..1, from {@link computeElapsedFraction}. */
  elapsedFraction: number;
}

export interface GoalProgressResult {
  expectedAtNow: number;
  /**
   * 0..1+ fill level for the thermometer UI. For maximize/minimize:
   * `actualValue / targetValue` (0 if `targetValue` is 0 and `actualValue`
   * is 0, else uncapped so an over-target value can render an
   * overflowing/capped bar in the UI layer). For range: `actualValue`'s
   * position between `rangeMin`/`rangeMax`, clamped 0..1.
   */
  progressRatio: number;
  /**
   * v1 linear projection of where this goal will land by the deadline. For
   * 'maximize': `actualValue` extrapolated at its current average rate
   * (`actualValue / elapsedFraction`) out to `elapsedFraction = 1` —
   * assumes linear accumulation from a zero baseline at the goal's start.
   * For 'minimize'/'range': goals over metrics that are already a
   * snapshot/rate (not accumulated), so v1 just projects the current
   * `actualValue` forward unchanged — documented here explicitly as a v1
   * simplification (a real projection would need a trend over historical
   * values, not just the value-to-date).
   */
  projectedFinalValue: number;
  status: GoalPaceStatus;
  /** Whether `actualValue` currently satisfies target/range right now (independent of pace). */
  isGoalMet: boolean;
}

function paceStatusFromRatio(ratio: number): GoalPaceStatus {
  if (ratio >= 1) return 'on_track';
  if (ratio >= 1 - GOAL_AT_RISK_BUFFER) return 'at_risk';
  return 'off_track';
}

function calculateMaximizeProgress(input: GoalProgressInput): GoalProgressResult {
  const targetValue = input.targetValue ?? 0;
  const { actualValue, elapsedFraction } = input;
  const expectedAtNow = targetValue * elapsedFraction;

  const ratio = expectedAtNow === 0 ? (actualValue === 0 ? 1 : 2) : actualValue / expectedAtNow;

  const progressRatio = targetValue === 0 && actualValue === 0 ? 0 : actualValue / targetValue;

  const projectedFinalValue = elapsedFraction === 0 ? actualValue : actualValue / elapsedFraction;

  return {
    expectedAtNow,
    progressRatio,
    projectedFinalValue,
    status: paceStatusFromRatio(ratio),
    isGoalMet: actualValue >= targetValue,
  };
}

function calculateMinimizeProgress(input: GoalProgressInput): GoalProgressResult {
  const targetValue = input.targetValue ?? 0;
  const { actualValue } = input;
  // The ceiling applies throughout the window, not something that scales with
  // elapsed time — a $50 CAC ceiling is a ceiling on day 1 same as day 30.
  const expectedAtNow = targetValue;

  // Inverted on purpose: for a minimize goal, a *lower* actualValue is
  // better, so the naive maximize ratio (actualValue / expectedAtNow) would
  // read backwards (green when the metric is bad, red when it's good). Here,
  // ratio >= 1 means "actual is at or under the ceiling" — good.
  const ratio = actualValue === 0 ? 1 : expectedAtNow / actualValue;

  const progressRatio = targetValue === 0 && actualValue === 0 ? 0 : actualValue / targetValue;

  // v1 simplification: minimize goals track a rate/snapshot metric (e.g.
  // cost-per-signup), not an accumulated total, so there's no meaningful
  // "extrapolate to end of window" — project the current value forward as-is.
  const projectedFinalValue = actualValue;

  return {
    expectedAtNow,
    progressRatio,
    projectedFinalValue,
    status: paceStatusFromRatio(ratio),
    isGoalMet: actualValue <= targetValue,
  };
}

function calculateRangeProgress(input: GoalProgressInput): GoalProgressResult {
  const rangeMin = input.rangeMin ?? 0;
  const rangeMax = input.rangeMax ?? 0;
  const { actualValue } = input;
  const expectedAtNow = (rangeMin + rangeMax) / 2;
  const width = rangeMax - rangeMin;

  const progressRatio = width === 0 ? (actualValue === rangeMin ? 1 : 0) : Math.min(1, Math.max(0, (actualValue - rangeMin) / width));

  const isGoalMet = actualValue >= rangeMin && actualValue <= rangeMax;

  let status: GoalPaceStatus;
  if (isGoalMet) {
    status = 'on_track';
  } else if (width === 0) {
    status = 'off_track';
  } else {
    const distance = actualValue < rangeMin ? rangeMin - actualValue : actualValue - rangeMax;
    const missFraction = distance / width;
    status = missFraction <= GOAL_AT_RISK_BUFFER ? 'at_risk' : 'off_track';
  }

  // v1 simplification: same rationale as minimize — a range goal tracks a
  // rate/snapshot metric, so the current value is the best available
  // projection of where it will land.
  const projectedFinalValue = actualValue;

  return {
    expectedAtNow,
    progressRatio,
    projectedFinalValue,
    status,
    isGoalMet,
  };
}

/**
 * Computes a goal's current progress, pace status, and v1 linear projection.
 * See {@link GoalProgressResult} for the per-field semantics, and the
 * per-direction helpers below for why 'minimize' inverts its pace ratio
 * relative to 'maximize' — getting that inversion right is the whole point
 * of a minimize goal (e.g. a signup-cost ceiling) showing correct
 * red/green.
 */
export function calculateGoalProgress(input: GoalProgressInput): GoalProgressResult {
  switch (input.direction) {
    case 'maximize':
      return calculateMaximizeProgress(input);
    case 'minimize':
      return calculateMinimizeProgress(input);
    case 'range':
      return calculateRangeProgress(input);
    default: {
      const exhaustive: never = input.direction;
      throw new Error(`Unknown goal direction "${exhaustive as string}".`);
    }
  }
}
