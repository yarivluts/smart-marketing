import { describe, expect, it } from 'vitest';
import {
  QUALITY_MIX_SHIFT_FIRE_THRESHOLD_POINTS,
  QUALITY_MIX_SHIFT_MIN_SAMPLE_SIZE,
  QUALITY_MIX_SHIFT_RESOLVE_THRESHOLD_POINTS,
  evaluateQualityMixShift,
} from './mix-shift';

describe('evaluateQualityMixShift', () => {
  it('reports insufficient_data when the baseline sample is too small', () => {
    const result = evaluateQualityMixShift({
      baselineAvgScore: 80,
      baselineSampleSize: QUALITY_MIX_SHIFT_MIN_SAMPLE_SIZE - 1,
      currentAvgScore: 40,
      currentSampleSize: 20,
      isCurrentlyActive: false,
    });
    expect(result.action).toBe('insufficient_data');
    expect(result.hasEnoughData).toBe(false);
  });

  it('reports insufficient_data when the current sample is too small', () => {
    const result = evaluateQualityMixShift({
      baselineAvgScore: 80,
      baselineSampleSize: 20,
      currentAvgScore: 40,
      currentSampleSize: QUALITY_MIX_SHIFT_MIN_SAMPLE_SIZE - 1,
      isCurrentlyActive: false,
    });
    expect(result.action).toBe('insufficient_data');
  });

  it('fires a fresh episode when quality drops at or past the fire threshold and none is active', () => {
    const result = evaluateQualityMixShift({
      baselineAvgScore: 70,
      baselineSampleSize: 10,
      currentAvgScore: 70 - QUALITY_MIX_SHIFT_FIRE_THRESHOLD_POINTS,
      currentSampleSize: 10,
      isCurrentlyActive: false,
    });
    expect(result.action).toBe('fire');
    expect(result.delta).toBe(QUALITY_MIX_SHIFT_FIRE_THRESHOLD_POINTS);
  });

  it('keeps an already-active episode active when still past the fire threshold', () => {
    const result = evaluateQualityMixShift({
      baselineAvgScore: 70,
      baselineSampleSize: 10,
      currentAvgScore: 50,
      currentSampleSize: 10,
      isCurrentlyActive: true,
    });
    expect(result.action).toBe('still_active');
  });

  it('stays healthy when there is no shift and no active episode', () => {
    const result = evaluateQualityMixShift({
      baselineAvgScore: 70,
      baselineSampleSize: 10,
      currentAvgScore: 68,
      currentSampleSize: 10,
      isCurrentlyActive: false,
    });
    expect(result.action).toBe('healthy');
  });

  it('resolves an active episode once it recovers past the resolve threshold', () => {
    const result = evaluateQualityMixShift({
      baselineAvgScore: 70,
      baselineSampleSize: 10,
      currentAvgScore: 70 - (QUALITY_MIX_SHIFT_RESOLVE_THRESHOLD_POINTS - 1),
      currentSampleSize: 10,
      isCurrentlyActive: true,
    });
    expect(result.action).toBe('resolve');
  });

  it('stays still_active inside the hysteresis dead zone (between the two thresholds) for an already-active episode', () => {
    const midpoint = (QUALITY_MIX_SHIFT_FIRE_THRESHOLD_POINTS + QUALITY_MIX_SHIFT_RESOLVE_THRESHOLD_POINTS) / 2;
    const result = evaluateQualityMixShift({
      baselineAvgScore: 70,
      baselineSampleSize: 10,
      currentAvgScore: 70 - midpoint,
      currentSampleSize: 10,
      isCurrentlyActive: true,
    });
    expect(result.action).toBe('still_active');
  });

  it('stays healthy inside the hysteresis dead zone when nothing is active yet (does not fire below the fire threshold)', () => {
    const midpoint = (QUALITY_MIX_SHIFT_FIRE_THRESHOLD_POINTS + QUALITY_MIX_SHIFT_RESOLVE_THRESHOLD_POINTS) / 2;
    const result = evaluateQualityMixShift({
      baselineAvgScore: 70,
      baselineSampleSize: 10,
      currentAvgScore: 70 - midpoint,
      currentSampleSize: 10,
      isCurrentlyActive: false,
    });
    expect(result.action).toBe('healthy');
  });

  it('computes delta as baseline minus current regardless of direction', () => {
    const improved = evaluateQualityMixShift({
      baselineAvgScore: 40,
      baselineSampleSize: 10,
      currentAvgScore: 70,
      currentSampleSize: 10,
      isCurrentlyActive: false,
    });
    expect(improved.delta).toBe(-30);
    expect(improved.action).toBe('healthy');
  });
});
