import { describe, expect, it } from 'vitest';
import {
  GOAL_AT_RISK_BUFFER,
  calculateGoalProgress,
  computeElapsedFraction,
  isGoalDirection,
  isGoalRhythm,
  WEEKEND_RHYTHM_WEIGHT,
} from './goal-progress';

describe('isGoalDirection / isGoalRhythm', () => {
  it('accepts only the declared enum values', () => {
    expect(isGoalDirection('maximize')).toBe(true);
    expect(isGoalDirection('minimize')).toBe(true);
    expect(isGoalDirection('range')).toBe(true);
    expect(isGoalDirection('bogus')).toBe(false);

    expect(isGoalRhythm('even')).toBe(true);
    expect(isGoalRhythm('work_week_weekend')).toBe(true);
    expect(isGoalRhythm('bogus')).toBe(false);
  });
});

describe('computeElapsedFraction', () => {
  it('returns 0 when asOfDate is at or before startDate', () => {
    expect(computeElapsedFraction('2026-01-01', '2026-01-31', '2026-01-01', 'even')).toBe(0);
    expect(computeElapsedFraction('2026-01-01', '2026-01-31', '2025-12-01', 'even')).toBe(0);
  });

  it('returns 1 when asOfDate is at or after deadline', () => {
    expect(computeElapsedFraction('2026-01-01', '2026-01-31', '2026-01-31', 'even')).toBe(1);
    expect(computeElapsedFraction('2026-01-01', '2026-01-31', '2026-02-15', 'even')).toBe(1);
  });

  it('returns 1 for a zero/negative-length window (already over)', () => {
    expect(computeElapsedFraction('2026-01-10', '2026-01-10', '2026-01-05', 'even')).toBe(1);
    expect(computeElapsedFraction('2026-01-10', '2026-01-01', '2026-01-05', 'even')).toBe(1);
  });

  it('computes an even-rhythm fraction as a plain day-count ratio', () => {
    // 10-day window (Jan 1 .. Jan 11), asOf Jan 6 => 5 days elapsed / 10 total.
    const fraction = computeElapsedFraction('2026-01-01', '2026-01-11', '2026-01-06', 'even');
    expect(fraction).toBeCloseTo(0.5, 10);
  });

  it('clamps to [0, 1]', () => {
    const fraction = computeElapsedFraction('2026-01-01', '2026-01-11', '2026-06-01', 'even');
    expect(fraction).toBe(1);
  });

  it('gives even and work_week_weekend rhythms different fractions over the same window', () => {
    // 2026-01-01 is a Thursday. Window Thu Jan 1 -> Thu Jan 15 (14 days: Jan1..Jan14).
    // asOf Mon Jan 5: elapsed days are Jan1(Thu),Jan2(Fri),Jan3(Sat),Jan4(Sun) = 4 days.
    const start = '2026-01-01';
    const deadline = '2026-01-15';
    const asOf = '2026-01-05';

    const evenFraction = computeElapsedFraction(start, deadline, asOf, 'even');
    const weightedFraction = computeElapsedFraction(start, deadline, asOf, 'work_week_weekend');

    // even: 4 elapsed / 14 total days.
    expect(evenFraction).toBeCloseTo(4 / 14, 10);

    // work_week_weekend: elapsed weight = 1(Thu)+1(Fri)+weekend*2(Sat,Sun).
    // total weight over 14 days starting Thursday Jan1..Jan14: that's 2 full
    // weekends (Jan3-4, Jan10-11) = 4 weekend days, 10 weekday days.
    const elapsedWeight = 1 + 1 + WEEKEND_RHYTHM_WEIGHT * 2;
    const totalWeight = 10 + WEEKEND_RHYTHM_WEIGHT * 4;
    expect(weightedFraction).toBeCloseTo(elapsedWeight / totalWeight, 10);

    expect(weightedFraction).not.toBeCloseTo(evenFraction, 5);
  });
});

describe('calculateGoalProgress - maximize', () => {
  it('is on_track when actual meets or exceeds the pace-adjusted expected value', () => {
    const result = calculateGoalProgress({
      direction: 'maximize',
      targetValue: 100,
      actualValue: 60,
      elapsedFraction: 0.5, // expectedAtNow = 50, ratio = 1.2
    });
    expect(result.expectedAtNow).toBe(50);
    expect(result.status).toBe('on_track');
    expect(result.isGoalMet).toBe(false);
  });

  it('is at_risk within the buffer below expected pace', () => {
    // expectedAtNow = 50, actual = 46 => ratio 0.92, within 1 - 0.1 = 0.9 threshold.
    const result = calculateGoalProgress({
      direction: 'maximize',
      targetValue: 100,
      actualValue: 46,
      elapsedFraction: 0.5,
    });
    expect(result.status).toBe('at_risk');
  });

  it('is off_track beyond the buffer below expected pace', () => {
    // expectedAtNow = 50, actual = 40 => ratio 0.8, below 0.9 threshold.
    const result = calculateGoalProgress({
      direction: 'maximize',
      targetValue: 100,
      actualValue: 40,
      elapsedFraction: 0.5,
    });
    expect(result.status).toBe('off_track');
  });

  it('treats the exact at_risk boundary (ratio == 1 - buffer) as at_risk', () => {
    const targetValue = 100;
    const elapsedFraction = 0.5; // expectedAtNow = 50
    const actualValue = 50 * (1 - GOAL_AT_RISK_BUFFER); // ratio exactly 0.9
    const result = calculateGoalProgress({ direction: 'maximize', targetValue, actualValue, elapsedFraction });
    expect(result.status).toBe('at_risk');
  });

  it('handles expectedAtNow === 0 (elapsedFraction 0): on_track only if actual is also 0', () => {
    const zeroActual = calculateGoalProgress({ direction: 'maximize', targetValue: 100, actualValue: 0, elapsedFraction: 0 });
    expect(zeroActual.status).toBe('on_track');

    const nonZeroActual = calculateGoalProgress({ direction: 'maximize', targetValue: 100, actualValue: 5, elapsedFraction: 0 });
    expect(nonZeroActual.status).toBe('on_track'); // ratio treated as comfortably ahead (2)
  });

  it('isGoalMet is true once actualValue reaches targetValue, regardless of pace', () => {
    const result = calculateGoalProgress({ direction: 'maximize', targetValue: 100, actualValue: 100, elapsedFraction: 0.1 });
    expect(result.isGoalMet).toBe(true);
  });

  it('progressRatio is uncapped actualValue/targetValue, with the 0/0 guard', () => {
    const over = calculateGoalProgress({ direction: 'maximize', targetValue: 50, actualValue: 75, elapsedFraction: 1 });
    expect(over.progressRatio).toBeCloseTo(1.5, 10);

    const zeroZero = calculateGoalProgress({ direction: 'maximize', targetValue: 0, actualValue: 0, elapsedFraction: 0.5 });
    expect(zeroZero.progressRatio).toBe(0);
  });

  it('projects the final value by linear extrapolation from the current rate', () => {
    const result = calculateGoalProgress({ direction: 'maximize', targetValue: 100, actualValue: 30, elapsedFraction: 0.25 });
    expect(result.projectedFinalValue).toBeCloseTo(120, 10);
  });
});

describe('calculateGoalProgress - minimize (signup-cost AC)', () => {
  it('is on_track (green) when actual is comfortably under the ceiling — target $50, actual $40', () => {
    const result = calculateGoalProgress({
      direction: 'minimize',
      targetValue: 50,
      actualValue: 40,
      elapsedFraction: 0.5,
    });
    expect(result.status).toBe('on_track');
    expect(result.isGoalMet).toBe(true);
  });

  it('is off_track (red) when actual is over the ceiling beyond the buffer — target $50, actual $65', () => {
    const result = calculateGoalProgress({
      direction: 'minimize',
      targetValue: 50,
      actualValue: 65,
      elapsedFraction: 0.5,
    });
    expect(result.status).toBe('off_track');
    expect(result.isGoalMet).toBe(false);
  });

  it('does not reuse the maximize ratio formula (regression guard for the inverted-ratio bug)', () => {
    // A naive `actualValue / expectedAtNow` (maximize's formula) would give
    // ratio 65/50 = 1.3 >= 1 => on_track for a *worse* actual value than the
    // target. The correct minimize ratio is expectedAtNow/actualValue =
    // 50/65 = 0.77 => off_track.
    const worse = calculateGoalProgress({ direction: 'minimize', targetValue: 50, actualValue: 65, elapsedFraction: 1 });
    expect(worse.status).not.toBe('on_track');
    expect(worse.status).toBe('off_track');

    // And a *better* (lower) actual value than target must not read off_track.
    const better = calculateGoalProgress({ direction: 'minimize', targetValue: 50, actualValue: 35, elapsedFraction: 1 });
    expect(better.status).toBe('on_track');
  });

  it('is at_risk just over the ceiling, within the buffer', () => {
    // ratio = expectedAtNow/actualValue must be >= 1 - buffer = 0.9 to be at_risk.
    // target 50, actual = 50 / 0.9 ~= 55.56 gives ratio exactly 0.9.
    const actualValue = 50 / (1 - GOAL_AT_RISK_BUFFER);
    const result = calculateGoalProgress({ direction: 'minimize', targetValue: 50, actualValue, elapsedFraction: 1 });
    expect(result.status).toBe('at_risk');
  });

  it('the ceiling (expectedAtNow) does not scale with elapsedFraction', () => {
    const early = calculateGoalProgress({ direction: 'minimize', targetValue: 50, actualValue: 40, elapsedFraction: 0.05 });
    const late = calculateGoalProgress({ direction: 'minimize', targetValue: 50, actualValue: 40, elapsedFraction: 0.95 });
    expect(early.expectedAtNow).toBe(50);
    expect(late.expectedAtNow).toBe(50);
    expect(early.status).toBe(late.status);
  });

  it('handles actualValue === 0 as ratio 1 (on_track)', () => {
    const result = calculateGoalProgress({ direction: 'minimize', targetValue: 50, actualValue: 0, elapsedFraction: 0.5 });
    expect(result.status).toBe('on_track');
    expect(result.isGoalMet).toBe(true);
  });

  it('projects the current value forward unchanged (v1 simplification)', () => {
    const result = calculateGoalProgress({ direction: 'minimize', targetValue: 50, actualValue: 42, elapsedFraction: 0.3 });
    expect(result.projectedFinalValue).toBe(42);
  });
});

describe('calculateGoalProgress - range', () => {
  it('is on_track (met) when actual is within [rangeMin, rangeMax]', () => {
    const result = calculateGoalProgress({ direction: 'range', rangeMin: 10, rangeMax: 20, actualValue: 15, elapsedFraction: 0.5 });
    expect(result.status).toBe('on_track');
    expect(result.isGoalMet).toBe(true);
    expect(result.expectedAtNow).toBe(15);
  });

  it('is at_risk when just outside the range, within the buffer fraction of range width', () => {
    // width = 10, buffer = 0.1 => 1 unit tolerance. actual = 20.5 misses by 0.5/10=0.05 <= 0.1.
    const result = calculateGoalProgress({ direction: 'range', rangeMin: 10, rangeMax: 20, actualValue: 20.5, elapsedFraction: 1 });
    expect(result.status).toBe('at_risk');
    expect(result.isGoalMet).toBe(false);
  });

  it('is off_track when far outside the range beyond the buffer', () => {
    const result = calculateGoalProgress({ direction: 'range', rangeMin: 10, rangeMax: 20, actualValue: 5, elapsedFraction: 1 });
    expect(result.status).toBe('off_track');
  });

  it('is at_risk symmetrically below rangeMin', () => {
    const result = calculateGoalProgress({ direction: 'range', rangeMin: 10, rangeMax: 20, actualValue: 9.5, elapsedFraction: 1 });
    expect(result.status).toBe('at_risk');
  });

  it('treats a zero-width range miss as off_track (divide-by-zero guard)', () => {
    const met = calculateGoalProgress({ direction: 'range', rangeMin: 10, rangeMax: 10, actualValue: 10, elapsedFraction: 1 });
    expect(met.status).toBe('on_track');
    expect(met.progressRatio).toBe(1);

    const missed = calculateGoalProgress({ direction: 'range', rangeMin: 10, rangeMax: 10, actualValue: 11, elapsedFraction: 1 });
    expect(missed.status).toBe('off_track');
    expect(missed.progressRatio).toBe(0);
  });

  it('clamps progressRatio to [0, 1] based on position between rangeMin/rangeMax', () => {
    const below = calculateGoalProgress({ direction: 'range', rangeMin: 10, rangeMax: 20, actualValue: 0, elapsedFraction: 1 });
    expect(below.progressRatio).toBe(0);

    const above = calculateGoalProgress({ direction: 'range', rangeMin: 10, rangeMax: 20, actualValue: 30, elapsedFraction: 1 });
    expect(above.progressRatio).toBe(1);

    const middle = calculateGoalProgress({ direction: 'range', rangeMin: 10, rangeMax: 20, actualValue: 12.5, elapsedFraction: 1 });
    expect(middle.progressRatio).toBeCloseTo(0.25, 10);
  });

  it('projects the current value forward unchanged (v1 simplification)', () => {
    const result = calculateGoalProgress({ direction: 'range', rangeMin: 10, rangeMax: 20, actualValue: 17, elapsedFraction: 0.4 });
    expect(result.projectedFinalValue).toBe(17);
  });
});
