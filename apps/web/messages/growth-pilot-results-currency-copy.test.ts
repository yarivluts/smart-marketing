import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot item results note', () => {
  it('tells a beginner which currency the money numbers are in', () => {
    expect(en.GrowthPilot.detail.resultsNote).toMatch(/ad account's currency/);
    expect(he.GrowthPilot.detail.resultsNote).toMatch(/מטבע של חשבון המודעות/);
  });
});
