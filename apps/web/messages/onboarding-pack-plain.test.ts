import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['packSaasMarketingTitle', 'packEngagementTitle', 'packCustomTitle', 'packCustomDescription', 'introBody'] as const;

describe('onboarding starter-set copy stays in plain words', () => {
  it.each([
    ['en', en.Onboarding],
    ['he', he.Onboarding],
  ])('%s has no developer or marketing jargon', (_locale, section) => {
    for (const key of KEYS) {
      const text = section[key];
      expect(text, key).toBeTruthy();
      expect(text, key).not.toMatch(/SaaS|hybrid|Pack|board|metrics|היברידי|SaaS|חבילת|לוח מוכן/i);
    }
  });

  it('has a distinct title for each starting point', () => {
    const titles = [en.Onboarding.packSaasMarketingTitle, en.Onboarding.packEngagementTitle, en.Onboarding.packCustomTitle];
    expect(new Set(titles).size).toBe(3);
  });
});

describe('onboarding journey "nothing chosen" line uses the step name', () => {
  it.each([
    ['en', en.Onboarding, /starting point/i, /pack/i],
    ['he', he.Onboarding, /נקודת התחלה/, /חבילה/],
  ])('%s says starting point, not pack', (_locale, section, want, avoid) => {
    expect(section.journeyPackNone).toMatch(want);
    expect(section.journeyPackNone).not.toMatch(avoid);
  });
});
