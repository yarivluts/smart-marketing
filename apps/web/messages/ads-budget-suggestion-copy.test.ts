import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'proactiveRecommendationHeading',
  'applyRecommendationButton',
  'recommendationApplied',
  'recommendationFailed',
] as const;

describe('Ads & results budget suggestion copy', () => {
  it('says what the button does instead of "1-Click Apply" / "AI Growth Recommendation"', () => {
    for (const key of KEYS) {
      expect(en.Campaigns[key]).not.toMatch(/1-click|AI Growth|successfully/i);
      expect(he.Campaigns[key].length).toBeGreaterThan(0);
      expect(he.Campaigns[key]).not.toContain('בלחיצה אחת');
    }
    expect(en.Campaigns.applyRecommendationButton).toMatch(/budget/i);
    expect(en.Campaigns.recommendationFailed).toMatch(/nothing was changed/i);
  });
});
