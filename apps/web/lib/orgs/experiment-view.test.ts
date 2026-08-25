import { describe, expect, it } from 'vitest';
import type { ExperimentVariantResult } from '@growthos/shared';
import { experimentVariantBadge, experimentVariantBadgeLabelKey } from './experiment-view';

function variant(overrides: Partial<ExperimentVariantResult>): ExperimentVariantResult {
  return {
    variantKey: 'treatment',
    exposures: 100,
    conversions: 10,
    conversionRate: 0.1,
    isControl: false,
    upliftVsControlPct: null,
    pValue: null,
    isSignificant: false,
    ...overrides,
  };
}

describe('experimentVariantBadge', () => {
  it('badges the control variant as "control", regardless of its own (always-null) p-value', () => {
    expect(experimentVariantBadge(variant({ isControl: true, pValue: null }))).toBe('control');
  });

  it('badges a non-control variant with no computable p-value as "insufficient_data"', () => {
    expect(experimentVariantBadge(variant({ isControl: false, pValue: null }))).toBe('insufficient_data');
  });

  it('badges a non-control variant with a significant p-value as "significant"', () => {
    expect(experimentVariantBadge(variant({ isControl: false, pValue: 0.001, isSignificant: true }))).toBe('significant');
  });

  it('badges a non-control variant with a non-significant p-value as "not_significant"', () => {
    expect(experimentVariantBadge(variant({ isControl: false, pValue: 0.5, isSignificant: false }))).toBe('not_significant');
  });
});

describe('experimentVariantBadgeLabelKey', () => {
  it('maps every badge to its own translation key', () => {
    expect(experimentVariantBadgeLabelKey('control')).toBe('badgeControl');
    expect(experimentVariantBadgeLabelKey('significant')).toBe('badgeSignificant');
    expect(experimentVariantBadgeLabelKey('not_significant')).toBe('badgeNotSignificant');
    expect(experimentVariantBadgeLabelKey('insufficient_data')).toBe('badgeInsufficientData');
  });
});
