import { describe, expect, it } from 'vitest';
import { computeExperimentResult } from './significance';

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

  it('a small sample with a modest difference is not significant — and is not even testable', () => {
    const result = computeExperimentResult('lp_headline', [
      { variantKey: 'control', exposures: 20, conversions: 2 }, // 10%
      { variantKey: 'treatment', exposures: 20, conversions: 3 }, // 15%
    ]);
    const treatment = result.variants.find((v) => v.variantKey === 'treatment')!;
    // This used to assert a real p-value above alpha. The guarantee the test
    // exists to protect — that this is not called significant — still holds, and
    // now holds for the stronger reason: pooled rate 0.125 over 20 exposures per
    // arm puts the expected success cells at 2.5, under the z-test's own
    // precondition, so there is no valid p-value to report in the first place.
    expect(treatment.pValue).toBeNull();
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

  describe('the normal-approximation precondition', () => {
    // These two are the cases the page used to call outright winners. The
    // z-test's arithmetic is fine; its precondition is not met, and the number
    // it produces is too small in exactly the direction that ships a variant.
    // Checked against Fisher's exact test on the same counts, which is valid at
    // these sizes and disagrees.
    it('does not call a winner on 10 exposures per arm (z-test said p=0.025, exact test says 0.087)', () => {
      const result = computeExperimentResult('lp_headline', [
        { variantKey: 'control', exposures: 10, conversions: 0 },
        { variantKey: 'treatment', exposures: 10, conversions: 4 },
      ]);
      const treatment = result.variants.find((v) => v.variantKey === 'treatment')!;
      expect(treatment.pValue).toBeNull();
      expect(treatment.isSignificant).toBe(false);
    });

    it('does not call a winner on 20 exposures per arm (z-test said p=0.038, exact test says 0.092)', () => {
      const result = computeExperimentResult('lp_headline', [
        { variantKey: 'control', exposures: 20, conversions: 1 },
        { variantKey: 'treatment', exposures: 20, conversions: 6 },
      ]);
      const treatment = result.variants.find((v) => v.variantKey === 'treatment')!;
      expect(treatment.pValue).toBeNull();
      expect(treatment.isSignificant).toBe(false);
    });

    it('plenty of exposures still cannot rescue too few conversions', () => {
      // 4 conversions pooled across 20,000 exposures: the expected success cells
      // are ~2 each, far under the threshold, even though the traffic looks ample.
      const result = computeExperimentResult('lp_headline', [
        { variantKey: 'control', exposures: 10_000, conversions: 0 },
        { variantKey: 'treatment', exposures: 10_000, conversions: 4 },
      ]);
      const treatment = result.variants.find((v) => v.variantKey === 'treatment')!;
      expect(treatment.pValue).toBeNull();
      expect(treatment.isSignificant).toBe(false);
    });

    it('still reports the observed uplift, which is measured rather than inferred', () => {
      // Suppressing the inferential claim must not suppress the descriptive one:
      // 4/10 against 2/10 really did happen, and hiding it would be its own
      // dishonesty.
      const result = computeExperimentResult('lp_headline', [
        { variantKey: 'control', exposures: 10, conversions: 2 },
        { variantKey: 'treatment', exposures: 10, conversions: 4 },
      ]);
      const treatment = result.variants.find((v) => v.variantKey === 'treatment')!;
      expect(treatment.pValue).toBeNull();
      expect(treatment.conversionRate).toBeCloseTo(0.4, 5);
      expect(treatment.upliftVsControlPct).toBeCloseTo(100, 5);
    });

    it('computes a p-value once every expected cell reaches the threshold', () => {
      // 50/50 exposures, pooled rate 0.2 — expected cells are 10 and 40 per arm,
      // all at or above MIN_EXPECTED_CELL_COUNT, so the test is valid to run.
      const result = computeExperimentResult('lp_headline', [
        { variantKey: 'control', exposures: 50, conversions: 5 },
        { variantKey: 'treatment', exposures: 50, conversions: 15 },
      ]);
      const treatment = result.variants.find((v) => v.variantKey === 'treatment')!;
      expect(treatment.pValue).not.toBeNull();
      expect(treatment.pValue!).toBeGreaterThan(0);
      expect(treatment.pValue!).toBeLessThan(1);
    });

    it('leaves a large, clearly-powered experiment untouched', () => {
      const result = computeExperimentResult('lp_headline', [
        { variantKey: 'control', exposures: 1000, conversions: 100 },
        { variantKey: 'treatment', exposures: 1000, conversions: 150 },
      ]);
      const treatment = result.variants.find((v) => v.variantKey === 'treatment')!;
      expect(treatment.pValue).not.toBeNull();
      expect(treatment.isSignificant).toBe(true);
    });
  });
});
