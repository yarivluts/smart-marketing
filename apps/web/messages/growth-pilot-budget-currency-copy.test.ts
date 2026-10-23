import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot daily budget hint', () => {
  it('says which currency the budget is in, so a beginner knows what the number means', () => {
    expect(en.GrowthPilot.publish.budgetHint).toMatch(/ad account currency/);
    expect(he.GrowthPilot.publish.budgetHint).toMatch(/מטבע של חשבון המודעות/);
  });
});
