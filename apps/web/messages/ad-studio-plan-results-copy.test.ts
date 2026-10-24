import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the Ad Studio plan results say sign-ups or sales, not conversions', () => {
  const keys = ['pagesChartDescription', 'pageSublabel', 'campaignRateSublabel', 'totals'] as const;

  it('English avoids the word conversion', () => {
    for (const k of keys) expect(en.AdStudio.plan[k].replace(/\{\w+\}/g, '')).not.toMatch(/conver/i);
  });

  it('Hebrew avoids המרה/המרות', () => {
    for (const k of keys) expect(he.AdStudio.plan[k]).not.toMatch(/המר/);
  });

  it('keeps the placeholders in both languages', () => {
    expect(en.AdStudio.plan.totals).toContain('{conversions}');
    expect(he.AdStudio.plan.totals).toContain('{conversions}');
  });
});
