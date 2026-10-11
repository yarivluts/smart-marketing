import { describe, expect, it } from 'vitest';
import type { ExperimentVariantResult } from '@growthos/shared';
import { experimentVariantBadge, experimentVariantBadgeLabelKey, summariseExperiments } from './experiment-view';

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

describe('summariseExperiments', () => {
  it('totals variants and counts significant wins and losses, never the control', () => {
    const summary = summariseExperiments([
      {
        experimentKey: 'hero',
        controlVariantKey: 'control',
        variants: [
          variant({ variantKey: 'control', isControl: true, exposures: 100, conversions: 10 }),
          variant({ variantKey: 'b', exposures: 100, conversions: 20, upliftVsControlPct: 100, pValue: 0.01, isSignificant: true }),
          variant({ variantKey: 'c', exposures: 100, conversions: 12, upliftVsControlPct: 20, pValue: 0.4, isSignificant: false }),
        ],
      },
      {
        experimentKey: 'pricing',
        controlVariantKey: 'control',
        variants: [
          variant({ variantKey: 'control', isControl: true, exposures: 50, conversions: 10 }),
          variant({ variantKey: 'cheap', exposures: 50, conversions: 2, upliftVsControlPct: -80, pValue: 0.01, isSignificant: true }),
        ],
      },
    ]);
    expect(summary).toEqual({ experiments: 2, variants: 5, exposures: 400, conversions: 54, significantWins: 1, significantLosses: 1 });
  });

  it('is all zeros with no experiments', () => {
    expect(summariseExperiments([])).toEqual({ experiments: 0, variants: 0, exposures: 0, conversions: 0, significantWins: 0, significantLosses: 0 });
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
