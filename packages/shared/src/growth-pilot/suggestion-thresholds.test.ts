import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GROWTH_SUGGESTION_THRESHOLDS,
  GROWTH_SUGGESTION_THRESHOLD_BOUNDS,
  GROWTH_SUGGESTION_THRESHOLD_KEYS,
  isValidGrowthSuggestionThreshold,
  resolveGrowthSuggestionThresholds,
  validateGrowthSuggestionThresholds,
} from './suggestion-thresholds';

describe('growth suggestion thresholds', () => {
  it('has a default and bounds for every threshold, each default within its bounds', () => {
    for (const key of GROWTH_SUGGESTION_THRESHOLD_KEYS) {
      expect(isValidGrowthSuggestionThreshold(key, DEFAULT_GROWTH_SUGGESTION_THRESHOLDS[key])).toBe(true);
      expect(GROWTH_SUGGESTION_THRESHOLD_BOUNDS[key].min).toBeLessThan(GROWTH_SUGGESTION_THRESHOLD_BOUNDS[key].max);
    }
    expect(Object.keys(DEFAULT_GROWTH_SUGGESTION_THRESHOLDS).sort()).toEqual([...GROWTH_SUGGESTION_THRESHOLD_KEYS].sort());
  });

  it('checks ranges and whole numbers', () => {
    expect(isValidGrowthSuggestionThreshold('noClicksAfterDays', 0)).toBe(false);
    expect(isValidGrowthSuggestionThreshold('noClicksAfterDays', 2.5)).toBe(false);
    expect(isValidGrowthSuggestionThreshold('noClicksAfterDays', 7)).toBe(true);
    expect(isValidGrowthSuggestionThreshold('lowCtr', 0.012)).toBe(true);
    expect(isValidGrowthSuggestionThreshold('lowCtr', 1.5)).toBe(false);
    expect(isValidGrowthSuggestionThreshold('lowCtr', '0.01')).toBe(false);
    expect(isValidGrowthSuggestionThreshold('lowCtr', Number.NaN)).toBe(false);
  });

  it('validates a full set, naming every bad or missing key and refusing unknown ones', () => {
    expect(validateGrowthSuggestionThresholds({ ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS })).toEqual({ ok: true, value: { ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS } });
    const { noClicksAfterDays: _omitted, ...rest } = DEFAULT_GROWTH_SUGGESTION_THRESHOLDS;
    expect(validateGrowthSuggestionThresholds(rest)).toEqual({ ok: false, invalid: ['noClicksAfterDays'] });
    expect(validateGrowthSuggestionThresholds({ ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, lowCtr: 2, typo: 1 })).toEqual({ ok: false, invalid: ['typo', 'lowCtr'] });
    expect(validateGrowthSuggestionThresholds(null)).toEqual({ ok: false, invalid: ['thresholds'] });
    expect(validateGrowthSuggestionThresholds([1])).toEqual({ ok: false, invalid: ['thresholds'] });
  });

  it('validates a partial set (a project override) by what it holds', () => {
    expect(validateGrowthSuggestionThresholds({ lowCtr: 0.01 }, { partial: true })).toEqual({ ok: true, value: { lowCtr: 0.01 } });
    expect(validateGrowthSuggestionThresholds({}, { partial: true })).toEqual({ ok: true, value: {} });
    expect(validateGrowthSuggestionThresholds({ lowCtrMinImpressions: -1 }, { partial: true })).toEqual({ ok: false, invalid: ['lowCtrMinImpressions'] });
  });

  it('resolves the project over the platform over the built-in defaults, skipping values no longer valid', () => {
    expect(resolveGrowthSuggestionThresholds()).toEqual(DEFAULT_GROWTH_SUGGESTION_THRESHOLDS);
    const platform = { lowCtr: 0.01, noClicksAfterDays: 5 };
    const project = { lowCtr: 0.02, noConversionsMinClicks: 'x', raiseBudgetSpendShare: 7 };
    expect(resolveGrowthSuggestionThresholds(platform, project)).toEqual({ ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, lowCtr: 0.02, noClicksAfterDays: 5 });
    expect(resolveGrowthSuggestionThresholds(null, undefined)).toEqual(DEFAULT_GROWTH_SUGGESTION_THRESHOLDS);
  });
});
