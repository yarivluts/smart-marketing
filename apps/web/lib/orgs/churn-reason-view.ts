import type { ChurnReasonCategory } from '@growthos/shared';

/**
 * Translation key for one churn-reason category/theme's fixed name
 * (KAN-84's `CHURN_REASON_CATEGORIES` is a small, known, finite set — same
 * "map a fixed data-driven category through i18n" posture
 * `feedbackThemeLabelKey` (KAN-82) and `billingOpsFeedEntryTypeLabelKey`
 * established for their own fixed vocabularies). Falls back to the raw
 * category string for a value this mapper doesn't recognize, so a future
 * taxonomy addition degrades to an untranslated (not missing) label rather
 * than crashing the page.
 */
export function churnReasonCategoryLabelKey(category: ChurnReasonCategory | string): string {
  switch (category) {
    case 'too_expensive':
      return 'categoryTooExpensive';
    case 'missing_features':
      return 'categoryMissingFeatures';
    case 'switched_competitor':
      return 'categorySwitchedCompetitor';
    case 'poor_support':
      return 'categoryPoorSupport';
    case 'too_complex':
      return 'categoryTooComplex';
    case 'low_usage':
      return 'categoryLowUsage';
    case 'no_longer_needed':
      return 'categoryNoLongerNeeded';
    case 'other':
      return 'categoryOther';
    default:
      return category;
  }
}
