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
