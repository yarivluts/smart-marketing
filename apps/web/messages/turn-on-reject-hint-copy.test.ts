import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot turn-on reject hint', () => {
  it('tells the person where the switched-off ads wait, so "not now" is not a dead end', () => {
    expect(en.GrowthPilot.waiting.rejectHintActivate).toMatch(/no money is spent/i);
    expect(en.GrowthPilot.waiting.rejectHintActivate).toMatch(/switch them on there/i);
  });

  it('says the same in Hebrew', () => {
    expect(he.GrowthPilot.waiting.rejectHintActivate.length).toBeGreaterThan(60);
    expect(he.GrowthPilot.waiting.rejectHintActivate).toContain('פייסבוק');
  });
});
