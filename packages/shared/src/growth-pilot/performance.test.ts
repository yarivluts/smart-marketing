import { describe, expect, it } from 'vitest';
import { dateRange, lastDays, summarizeGrowthPerformance, type GrowthPerformanceRow } from './performance';

const row = (campaignId: string, date: string, extra: Partial<GrowthPerformanceRow> = {}): GrowthPerformanceRow => ({ campaignId, date, spend: 10, impressions: 1000, clicks: 20, linkClicks: 15, conversions: 1, ...extra });

describe('summarizeGrowthPerformance', () => {
  it('adds up the targets campaigns, works out the ratios, and fills the days without data with zeros', () => {
    const summary = summarizeGrowthPerformance(
      [row('c1', '2026-10-01'), row('c2', '2026-10-03', { spend: 5.555, conversions: 0 }), row('other', '2026-10-01'), row('c1', '2026-09-01')],
      { c1: 't1', c2: 't2' },
      { since: '2026-10-01', until: '2026-10-03' },
    );
    expect(summary.totals).toEqual({ spend: 15.56, impressions: 2000, clicks: 40, linkClicks: 30, conversions: 1, ctr: 0.02, cpc: 15.56 / 40, costPerConversion: 15.56 });
    expect(summary.daily.map((day) => [day.date, day.clicks])).toEqual([
      ['2026-10-01', 20],
      ['2026-10-02', 0],
      ['2026-10-03', 20],
    ]);
    expect(summary.byTarget.t1).toMatchObject({ spend: 10, clicks: 20, conversions: 1 });
    expect(summary.byTarget.t2).toMatchObject({ spend: 5.56, conversions: 0, costPerConversion: null });
  });

  it('never invents a ratio: nothing under it means null', () => {
    const summary = summarizeGrowthPerformance([], { c1: 't1' }, { since: '2026-10-01', until: '2026-10-01' });
    expect(summary.totals).toEqual({ spend: 0, impressions: 0, clicks: 0, linkClicks: 0, conversions: 0, ctr: null, cpc: null, costPerConversion: null });
    expect(summary.daily).toHaveLength(1);
  });
});

describe('date helpers', () => {
  it('counts back the last days to today and lists every date between', () => {
    expect(lastDays(7, new Date('2026-10-14T09:00:00Z'))).toEqual({ since: '2026-10-08', until: '2026-10-14' });
    expect(lastDays(0, new Date('2026-10-14T09:00:00Z'))).toEqual({ since: '2026-10-14', until: '2026-10-14' });
    expect(dateRange('2026-09-30', '2026-10-02')).toEqual(['2026-09-30', '2026-10-01', '2026-10-02']);
  });
});
