import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot results tile names the money in plain words', () => {
  it('says "Money spent" instead of the marketing word "Spend"', () => {
    expect(en.GrowthPilot.performance.kpi.spend).toBe('Money spent');
  });

  it('says "כסף שהוצא" in Hebrew, not the bare "הוצאה"', () => {
    expect(he.GrowthPilot.performance.kpi.spend).toBe('כסף שהוצא');
  });
});
