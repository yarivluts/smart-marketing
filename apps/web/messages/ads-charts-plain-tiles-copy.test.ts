import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';
import { createTranslator } from 'next-intl';

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
    expect(c.he.spendCockpitDegraded.not_yet_backed).toMatch(/פייסבוק, באינסטגרם או בגוגל/);
  });

  it('a failed spend load says to retry, not that no spend was collected or to connect an account', () => {
    expect(c.en.spendCockpitDegraded.query_error).toMatch(/Refresh the page/);
    expect(c.en.spendCockpitDegraded.query_error).not.toMatch(/no spend has been collected/);
    expect(c.he.spendCockpitDegraded.query_error).toMatch(/רעננו/);
    expect(c.he.spendCockpitDegraded.query_error).not.toMatch(/לא נאספה/);
  });
});

describe('Ads & results coverage tile and zero-spend message use plain words', () => {
  it('says "ads" and what is known, not "measured campaigns"', () => {
    for (const l of ['en', 'he'] as const) {
      for (const k of ['effMeasuredCoverage', 'effMeasuredCoverageSub', 'chartsNoPositiveSpend']) {
        expect(String(c[l][k]).replace(/\{\w+\}/g, '')).not.toMatch(/measured|window|נמדד/i);
      }
      expect(c[l].effMeasuredCoverageSub).toContain('{measured}');
      expect(c[l].effMeasuredCoverageSub).toContain('{total,');
    }
    expect(c.en.effMeasuredCoverage).toBe('Ads with spend figures');
    expect(c.he.chartsNoPositiveSpend).toMatch(/מודעות/);
  });
});

describe('Ads charts say "ad" for a single ad, not "1 ads"', () => {
  it('uses plural forms for the coverage subtext and the platform split description', () => {
    const fmt = (l: 'en' | 'he', k: string, v: Record<string, number>) =>
      createTranslator({ locale: l, messages: l === 'en' ? en : he, namespace: 'Campaigns' } as never)(k as never, v as never) as string;
    expect(fmt('en', 'effMeasuredCoverageSub', { measured: 1, total: 1 })).toBe('We know what 1 of your 1 ad spent');
    expect(fmt('en', 'effMeasuredCoverageSub', { measured: 2, total: 3 })).toBe('We know what 2 of your 3 ads spent');
    expect(fmt('en', 'chartsCampaignsByChannelDescription', { count: 1 })).toBe('How your 1 ad is split across ad platforms.');
    expect(fmt('en', 'chartsCampaignsByChannelDescription', { count: 4 })).toBe('How your 4 ads are split across ad platforms.');
    expect(fmt('he', 'effMeasuredCoverageSub', { measured: 1, total: 1 })).toContain('מודעה אחת');
    expect(fmt('he', 'chartsCampaignsByChannelDescription', { count: 1 })).toContain('המודעה שלכם');
    expect(fmt('he', 'chartsCampaignsByChannelDescription', { count: 4 })).toContain('4 המודעות');
  });
});
