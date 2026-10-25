import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['applyRecommendationButton', 'recommendationApplied', 'recommendationFailed'] as const;

describe('funnel drop-off suggestion copy', () => {
  it('speaks plainly instead of "1-Click Optimize" / "Optimization active!"', () => {
    for (const key of KEYS) {
      expect(en.FunnelGoals[key]).not.toMatch(/optimi[sz]/i);
      expect(en.FunnelGoals[key]).not.toMatch(/1-click/i);
      expect(he.FunnelGoals[key]).not.toContain('אופטימיזציה');
      expect(he.FunnelGoals[key].length).toBeGreaterThan(0);
    }
  });
});
