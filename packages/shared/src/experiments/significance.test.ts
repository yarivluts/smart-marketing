import { describe, expect, it } from 'vitest';
import { computeExperimentResult, SIGNIFICANCE_ALPHA } from './significance';

describe('computeExperimentResult', () => {
  it('throws on an empty variant list', () => {
    expect(() => computeExperimentResult('lp_headline', [])).toThrow();
  });

  it('picks the variant literally keyed "control" as control, regardless of array order', () => {
    const result = computeExperimentResult('lp_headline', [
      { variantKey: 'treatment', exposures: 100, conversions: 10 },
      { variantKey: 'control', exposures: 100, conversions: 10 },
    ]);
    expect(result.controlVariantKey).toBe('control');
    expect(result.variants[0]!.variantKey).toBe('control');
    expect(result.variants[0]!.isControl).toBe(true);
  });

  it('falls back to the alphabetically-first variant key when none is literally "control"', () => {
    const result = computeExperimentResult('lp_headline', [
      { variantKey: 'variant_b', exposures: 100, conversions: 10 },
      { variantKey: 'variant_a', exposures: 100, conversions: 10 },
    ]);
    expect(result.controlVariantKey).toBe('variant_a');
  });

  it('sorts control first, then every other variant alphabetically', () => {
    const result = computeExperimentResult('lp_headline', [
      { variantKey: 'variant_z', exposures: 10, conversions: 1 },
      { variantKey: 'control', exposures: 10, conversions: 1 },
      { variantKey: 'variant_a', exposures: 10, conversions: 1 },
    ]);
    expect(result.variants.map((v) => v.variantKey)).toEqual(['control', 'variant_a', 'variant_z']);
  });

  it('computes conversionRate as conversions/exposures, null when exposures is 0', () => {
    const result = computeExperimentResult('lp_headline', [
      { variantKey: 'control', exposures: 200, conversions: 20 },
      { variantKey: 'empty_variant', exposures: 0, conversions: 0 },
    ]);
    expect(result.variants.find((v) => v.variantKey === 'control')!.conversionRate).toBeCloseTo(0.1, 10);
    expect(result.variants.find((v) => v.variantKey === 'empty_variant')!.conversionRate).toBeNull();
  });

  it('leaves the control variant itself with no uplift/p-value/significance', () => {
    const result = computeExperimentResult('lp_headline', [{ variantKey: 'control', exposures: 100, conversions: 10 }]);
    const control = result.variants[0]!;
    expect(control.upliftVsControlPct).toBeNull();
    expect(control.pValue).toBeNull();
    expect(control.isSignificant).toBe(false);
  });

  it('identical conversion rates on both sides: p-value near 1, not significant', () => {
    const result = computeExperimentResult('lp_headline', [
      { variantKey: 'control', exposures: 100, conversions: 10 },
      { variantKey: 'treatment', exposures: 100, conversions: 10 },
    ]);
    const treatment = result.variants.find((v) => v.variantKey === 'treatment')!;
    expect(treatment.pValue).not.toBeNull();
    expect(treatment.pValue!).toBeGreaterThan(0.99);
    expect(treatment.isSignificant).toBe(false);
    expect(treatment.upliftVsControlPct).toBeCloseTo(0, 10);
  });

  it('a large, clearly-different sample comes back significant with the expected uplift', () => {
    const result = computeExperimentResult('lp_headline', [
      { variantKey: 'control', exposures: 1000, conversions: 50 }, // 5%
      { variantKey: 'treatment', exposures: 1000, conversions: 100 }, // 10%
    ]);
    const treatment = result.variants.find((v) => v.variantKey === 'treatment')!;
    expect(treatment.pValue).not.toBeNull();
    expect(treatment.pValue!).toBeLessThan(0.001);
    expect(treatment.isSignificant).toBe(true);
    expect(treatment.upliftVsControlPct).toBeCloseTo(100, 5); // 10% is a 100% relative lift over 5%
  });

  it('a small sample with a modest difference does not reach significance', () => {
    const result = computeExperimentResult('lp_headline', [
      { variantKey: 'control', exposures: 20, conversions: 2 }, // 10%
      { variantKey: 'treatment', exposures: 20, conversions: 3 }, // 15%
    ]);
    const treatment = result.variants.find((v) => v.variantKey === 'treatment')!;
    expect(treatment.pValue).not.toBeNull();
    expect(treatment.pValue!).toBeGreaterThan(SIGNIFICANCE_ALPHA);
    expect(treatment.isSignificant).toBe(false);
  });

  it('a variant with zero exposures has no computable p-value or uplift', () => {
    const result = computeExperimentResult('lp_headline', [
      { variantKey: 'control', exposures: 100, conversions: 10 },
      { variantKey: 'treatment', exposures: 0, conversions: 0 },
    ]);
    const treatment = result.variants.find((v) => v.variantKey === 'treatment')!;
    expect(treatment.pValue).toBeNull();
    expect(treatment.isSignificant).toBe(false);
    expect(treatment.upliftVsControlPct).toBeNull();
  });

  it('a control with zero exposures leaves every other variant with no computable p-value', () => {
    const result = computeExperimentResult('lp_headline', [
      { variantKey: 'control', exposures: 0, conversions: 0 },
      { variantKey: 'treatment', exposures: 100, conversions: 10 },
    ]);
    const treatment = result.variants.find((v) => v.variantKey === 'treatment')!;
    expect(treatment.pValue).toBeNull();
    expect(treatment.upliftVsControlPct).toBeNull();
  });

  it('a pooled proportion of exactly 0 (nobody converted anywhere) has no computable p-value', () => {
    const result = computeExperimentResult('lp_headline', [
      { variantKey: 'control', exposures: 100, conversions: 0 },
      { variantKey: 'treatment', exposures: 100, conversions: 0 },
    ]);
    const treatment = result.variants.find((v) => v.variantKey === 'treatment')!;
    expect(treatment.pValue).toBeNull();
    expect(treatment.isSignificant).toBe(false);
  });

  it('a negative uplift is reported for a variant that converts worse than control', () => {
    const result = computeExperimentResult('lp_headline', [
      { variantKey: 'control', exposures: 1000, conversions: 100 }, // 10%
      { variantKey: 'treatment', exposures: 1000, conversions: 50 }, // 5%
    ]);
    const treatment = result.variants.find((v) => v.variantKey === 'treatment')!;
    expect(treatment.upliftVsControlPct).toBeCloseTo(-50, 5);
    expect(treatment.isSignificant).toBe(true);
  });
});
