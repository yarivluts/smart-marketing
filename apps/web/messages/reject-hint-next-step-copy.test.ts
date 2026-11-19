import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot reject hint', () => {
  it('names the real button to press after rejecting, in both languages', () => {
    expect(en.GrowthPilot.waiting.rejectHint).toContain(`"${en.GrowthPilot.header.newTarget}"`);
    expect(he.GrowthPilot.waiting.rejectHint).toContain(`"${he.GrowthPilot.header.newTarget}"`);
  });

  it('still says nothing is published and no money is spent', () => {
    expect(en.GrowthPilot.waiting.rejectHint).toMatch(/nothing is published and no money is spent/i);
  });
});
