import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

const SHOWN_KEYS = ['metaTitle', 'title', 'description', 'noFunnel'];

describe('Customer path page: plain words', () => {
  it('en: the page title, description and empty state avoid funnel/conversion jargon', () => {
    const m = (en as unknown as Copy).Funnel;
    for (const key of SHOWN_KEYS) {
      expect(m[key], key).not.toMatch(/funnel|conversion|onboarding|mapping|stage/i);
    }
  });

  it('he: the page copy avoids משפך and המרה', () => {
    const m = (he as unknown as Copy).Funnel;
    for (const key of SHOWN_KEYS) {
      expect(m[key], key).not.toMatch(/משפך|המרה|המרות/);
    }
  });

  it('the "nobody yet" empty state uses the customer path wording in both languages', () => {
    for (const messages of [en, he] as unknown as Copy[]) {
      const m = messages.FunnelGoals;
      expect(`${m.funnelNoPeopleTitle} ${m.funnelNoPeopleBody}`).not.toMatch(/funnel|משפך/i);
    }
  });
});
