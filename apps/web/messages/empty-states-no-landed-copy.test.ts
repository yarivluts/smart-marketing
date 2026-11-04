import { describe, expect, it } from 'vitest';
import en from './en.json';

type Copy = Record<string, Record<string, string>>;

describe('Empty states: plain English for a newcomer', () => {
  const keys: Array<[string, string]> = [
    ['Feedback', 'npsEmpty'],
    ['Feedback', 'themeDigestEmpty'],
    ['Support', 'firstResponseEmpty'],
    ['Support', 'csatEmpty'],
    ['Demos', 'repBreakdownEmpty'],
    ['ChurnReasons', 'reasonCodeEmpty'],
    ['ChurnReasons', 'themeDigestEmpty'],
    ['CampaignOps', 'campaignPaybackEmpty'],
    ['CampaignOps', 'spendTargetsEmpty'],
  ];

  it.each(keys)('%s.%s does not say "landed" or use bare NPS/CSAT/no-show', (ns, key) => {
    const text = (en as unknown as Copy)[ns][key];
    expect(text).toBeTruthy();
    expect(text).not.toMatch(/landed|\bNPS\b|\bCSAT\b|no-show/i);
    expect(text).toMatch(/come in|has come in|have come in/);
  });
});
