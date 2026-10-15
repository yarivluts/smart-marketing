import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('setup wizard step names are plain words', () => {
  it('names the pack step like the screen it opens', () => {
    expect(en.Onboarding.journeyStep_pack).toBe('Starting point');
    expect(he.Onboarding.journeyStep_pack).toBe('נקודת התחלה');
  });

  it('keeps marketing jargon out of the step names in both languages', () => {
    for (const lang of [en, he]) {
      for (const step of ['pack', 'funnel'] as const) {
        const label = lang.Onboarding[`journeyStep_${step}`];
        expect(label).not.toMatch(/metric pack|funnel|חבילת מדדים|משפך/i);
      }
    }
  });
});
