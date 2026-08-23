import { describe, expect, it } from 'vitest';
import { churnReasonCategoryLabelKey } from './churn-reason-view';

describe('churnReasonCategoryLabelKey', () => {
  it('maps every known category to its translation key', () => {
    expect(churnReasonCategoryLabelKey('too_expensive')).toBe('categoryTooExpensive');
    expect(churnReasonCategoryLabelKey('missing_features')).toBe('categoryMissingFeatures');
    expect(churnReasonCategoryLabelKey('switched_competitor')).toBe('categorySwitchedCompetitor');
    expect(churnReasonCategoryLabelKey('poor_support')).toBe('categoryPoorSupport');
    expect(churnReasonCategoryLabelKey('too_complex')).toBe('categoryTooComplex');
    expect(churnReasonCategoryLabelKey('low_usage')).toBe('categoryLowUsage');
    expect(churnReasonCategoryLabelKey('no_longer_needed')).toBe('categoryNoLongerNeeded');
    expect(churnReasonCategoryLabelKey('other')).toBe('categoryOther');
  });

  it('falls back to the raw category string for an unrecognized value', () => {
    expect(churnReasonCategoryLabelKey('some_future_category')).toBe('some_future_category');
  });
});
