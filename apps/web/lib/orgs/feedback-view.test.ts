import { describe, expect, it } from 'vitest';
import { feedbackThemeLabelKey } from './feedback-view';

describe('feedbackThemeLabelKey', () => {
  it('maps every known theme to its translation key', () => {
    expect(feedbackThemeLabelKey('pricing')).toBe('themePricing');
    expect(feedbackThemeLabelKey('support')).toBe('themeSupport');
    expect(feedbackThemeLabelKey('bugs')).toBe('themeBugs');
    expect(feedbackThemeLabelKey('performance')).toBe('themePerformance');
    expect(feedbackThemeLabelKey('missing_features')).toBe('themeMissingFeatures');
    expect(feedbackThemeLabelKey('onboarding')).toBe('themeOnboarding');
    expect(feedbackThemeLabelKey('usability')).toBe('themeUsability');
  });

  it('falls back to the raw theme name for an unrecognized value', () => {
    expect(feedbackThemeLabelKey('some_future_theme')).toBe('some_future_theme');
  });
});
