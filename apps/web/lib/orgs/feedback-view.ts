import type { FeedbackThemeCluster } from '@growthos/shared';

/**
 * Translation key for one feedback theme cluster's fixed name (KAN-82's
 * `clusterFeedbackThemes` keyword taxonomy is a small, known, finite set —
 * same "map a fixed data-driven category through i18n" posture
 * `billingOpsFeedEntryTypeLabelKey` established for its own three billing
 * event types). Falls back to the raw theme name for a value this mapper
 * doesn't recognize, so a future taxonomy addition degrades to an
 * untranslated (not missing) label rather than crashing the page.
 */
export function feedbackThemeLabelKey(theme: FeedbackThemeCluster['theme']): string {
  switch (theme) {
    case 'pricing':
      return 'themePricing';
    case 'support':
      return 'themeSupport';
    case 'bugs':
      return 'themeBugs';
    case 'performance':
      return 'themePerformance';
    case 'missing_features':
      return 'themeMissingFeatures';
    case 'onboarding':
      return 'themeOnboarding';
    case 'usability':
      return 'themeUsability';
    default:
      return theme;
  }
}
