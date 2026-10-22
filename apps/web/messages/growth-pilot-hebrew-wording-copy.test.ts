import { describe, expect, it } from 'vitest';
import he from './he.json';

describe('Growth Pilot Hebrew uses the same plain words everywhere', () => {
  it('the no-website hint names a business page without a dangling "it"', () => {
    const text = he.GrowthPilot.start.noSite;
    expect(text).toContain('דף של העסק שלכם');
    expect(text).not.toContain('שמפרט אותו');
  });

  it('per-target results say "לחיצות" like the results tiles, not the slang "קליקים"', () => {
    expect(he.GrowthPilot.performance.targetResults).toContain('לחיצות');
    expect(he.GrowthPilot.performance.targetResults).not.toContain('קליקים');
    expect(he.GrowthPilot.performance.kpi.clicks).toContain('לחיצות');
  });
});
