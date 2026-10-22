import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const keys = ['cockpitDescription', 'tabFunnel', 'kpiOverallConversion', 'proactiveRecommendationHeading'] as const;

describe('Funnel & Goals tabs, tiles and drop-off heading speak plain words', () => {
  it('English avoids funnel, pipeline, cohort and conversion jargon', () => {
    for (const k of keys) expect(en.FunnelGoals[k]).not.toMatch(/funnel|pipeline|cohort|conv|optimi[sz]ation/i);
  });

  it('Hebrew avoids the funnel, conversion and optimization words', () => {
    for (const k of keys) expect(he.FunnelGoals[k]).not.toMatch(/משפך|המרה|צינור|קוהורט|אופטימיזציה/);
  });
});
