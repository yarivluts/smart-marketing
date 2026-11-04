import { describe, expect, it } from 'vitest';
import en from './en.json';

type Copy = Record<string, Record<string, string>>;

describe('Data pages: newcomer-friendly wording instead of "lands"', () => {
  const keys: Array<[string, string]> = [
    ['BillingOpsFeed', 'churnEmpty'],
    ['Firmographics', 'industryEmpty'],
    ['Firmographics', 'industryEmptyDetail'],
    ['FunnelGoals', 'calibrationNoData'],
    ['Feedback', 'setupFeaturesTitle'],
    ['Feedback', 'npsEmptyDetail'],
    ['ChurnReasons', 'reasonCodeEmptyDetail'],
  ];

  it.each(keys)('%s.%s does not say "land"', (ns, key) => {
    const text = (en as unknown as Copy)[ns][key];
    expect(text).toBeTruthy();
    expect(text).not.toMatch(/\bland(s|ed)?\b/i);
  });
});
