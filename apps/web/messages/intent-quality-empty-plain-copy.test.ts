import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const iq = { en: en.IntentQuality, he: he.IntentQuality } as unknown as Record<'en' | 'he', Record<string, string>>;

describe('Signup quality empty state uses plain words', () => {
  it('shows no event or survey codes in either language', () => {
    for (const l of ['en', 'he'] as const) {
      for (const t of [iq[l].distributionEmpty, iq[l].distributionEmptyDetail]) {
        expect(t).not.toMatch(/onboarding_survey|onboarding-survey|_|סקר קליטה/);
      }
    }
  });

  it('keeps the score explanation', () => {
    expect(iq.en.distributionEmptyDetail).toContain('quality score');
    expect(iq.he.distributionEmptyDetail).toContain('ציון איכות');
  });
});
