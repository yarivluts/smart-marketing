import { describe, expect, it } from 'vitest';
import {
  COMPOSITION_SHIFT_FIRE_THRESHOLD_SHARE_POINTS,
  COMPOSITION_SHIFT_MIN_SAMPLE_SIZE,
  COMPOSITION_SHIFT_RESOLVE_THRESHOLD_SHARE_POINTS,
  evaluateCompositionShift,
} from './composition-shift';

describe('evaluateCompositionShift', () => {
  it('reports insufficient_data below the minimum sample size on either side', () => {
    expect(
      evaluateCompositionShift({
        baselineShare: 0.5,
        baselineSampleSize: COMPOSITION_SHIFT_MIN_SAMPLE_SIZE - 1,
        currentShare: 0.1,
        currentSampleSize: 20,
        isCurrentlyActive: false,
      }).action,
    ).toBe('insufficient_data');

    expect(
      evaluateCompositionShift({
        baselineShare: 0.5,
        baselineSampleSize: 20,
        currentShare: 0.1,
        currentSampleSize: COMPOSITION_SHIFT_MIN_SAMPLE_SIZE - 1,
        isCurrentlyActive: false,
      }).action,
    ).toBe('insufficient_data');
  });

  it('fires when the share drops by at least the fire threshold', () => {
    const result = evaluateCompositionShift({
      baselineShare: 0.4,
      baselineSampleSize: 20,
      currentShare: 0.4 - COMPOSITION_SHIFT_FIRE_THRESHOLD_SHARE_POINTS,
      currentSampleSize: 20,
      isCurrentlyActive: false,
    });
    expect(result.action).toBe('fire');
    expect(result.hasEnoughData).toBe(true);
  });

  it('fires when the share rises by at least the fire threshold (bidirectional)', () => {
    const result = evaluateCompositionShift({
      baselineShare: 0.1,
      baselineSampleSize: 20,
      currentShare: 0.1 + COMPOSITION_SHIFT_FIRE_THRESHOLD_SHARE_POINTS,
      currentSampleSize: 20,
      isCurrentlyActive: false,
    });
    expect(result.action).toBe('fire');
  });

  it('reports still_active (not a fresh fire) when already active and still past the fire threshold', () => {
    const result = evaluateCompositionShift({
      baselineShare: 0.4,
      baselineSampleSize: 20,
      currentShare: 0.1,
      currentSampleSize: 20,
      isCurrentlyActive: true,
    });
    expect(result.action).toBe('still_active');
  });

  it('reports healthy for a small delta with no active episode', () => {
    const result = evaluateCompositionShift({
      baselineShare: 0.3,
      baselineSampleSize: 20,
      currentShare: 0.3 + (COMPOSITION_SHIFT_RESOLVE_THRESHOLD_SHARE_POINTS - 0.01),
      currentSampleSize: 20,
      isCurrentlyActive: false,
    });
    expect(result.action).toBe('healthy');
  });

  it('resolves an active episode once the delta drops below the resolve threshold', () => {
    const result = evaluateCompositionShift({
      baselineShare: 0.3,
      baselineSampleSize: 20,
      currentShare: 0.3 + (COMPOSITION_SHIFT_RESOLVE_THRESHOLD_SHARE_POINTS - 0.01),
      currentSampleSize: 20,
      isCurrentlyActive: true,
    });
    expect(result.action).toBe('resolve');
  });

  it('stays still_active in the hysteresis dead zone between the two thresholds', () => {
    const midpoint = (COMPOSITION_SHIFT_FIRE_THRESHOLD_SHARE_POINTS + COMPOSITION_SHIFT_RESOLVE_THRESHOLD_SHARE_POINTS) / 2;
    const result = evaluateCompositionShift({
      baselineShare: 0.3,
      baselineSampleSize: 20,
      currentShare: 0.3 + midpoint,
      currentSampleSize: 20,
      isCurrentlyActive: true,
    });
    expect(result.action).toBe('still_active');
  });

  it('stays healthy (not fired) in the hysteresis dead zone with no active episode', () => {
    const midpoint = (COMPOSITION_SHIFT_FIRE_THRESHOLD_SHARE_POINTS + COMPOSITION_SHIFT_RESOLVE_THRESHOLD_SHARE_POINTS) / 2;
    const result = evaluateCompositionShift({
      baselineShare: 0.3,
      baselineSampleSize: 20,
      currentShare: 0.3 + midpoint,
      currentSampleSize: 20,
      isCurrentlyActive: false,
    });
    expect(result.action).toBe('healthy');
  });

  it('computes delta as the absolute value even when data is insufficient', () => {
    const result = evaluateCompositionShift({
      baselineShare: 0.2,
      baselineSampleSize: 1,
      currentShare: 0.5,
      currentSampleSize: 20,
      isCurrentlyActive: false,
    });
    expect(result.delta).toBeCloseTo(0.3);
    expect(result.hasEnoughData).toBe(false);
  });
});
