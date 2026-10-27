import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const c = { en: en.Campaigns, he: he.Campaigns } as unknown as Record<'en' | 'he', Record<string, any>>;

describe('Ads & results spend tiles and empty states use plain words', () => {
  it('does not name ad products or say "avg" / "live" / "campaigns" on the budget tiles', () => {
    for (const l of ['en', 'he'] as const) {
      const texts = [c[l].spendCockpitDegraded.not_yet_backed, c[l].spendCockpitDegraded.query_error, c[l].effAvgDailySpend, c[l].effLiveBudget, c[l].effLiveBudgetSub];
      for (const t of texts) expect(t).not.toMatch(/Meta Ads|Google Ads/);
    }
    expect(c.en.effAvgDailySpend).not.toMatch(/Avg/);
    expect(c.en.effLiveBudget).not.toMatch(/Live/);
    expect(c.en.effLiveBudgetSub).not.toMatch(/campaign/i);
  });

  it('tells a newcomer which ad account to connect, in both languages', () => {
    expect(c.en.spendCockpitDegraded.not_yet_backed).toMatch(/Facebook, Instagram or Google ad account/);
    expect(c.he.spendCockpitDegraded.query_error).toMatch(/פייסבוק, באינסטגרם או בגוגל/);
  });
});
