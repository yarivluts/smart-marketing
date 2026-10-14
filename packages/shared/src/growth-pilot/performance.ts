/**
 * How a pilot's ads are doing, from the ad platform's own day-by-day numbers: totals, the ratios a
 * marketer reads (CTR, cost per click, cost per conversion), a gap-free daily series for the chart,
 * and the same per target. Only real numbers: a ratio with nothing under it is null, never zero.
 */

export interface GrowthPerformanceRow {
  campaignId: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  conversions: number;
}

export interface GrowthPerformanceTotals {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  conversions: number;
  /** Clicks per impression; null without impressions. */
  ctr: number | null;
  /** Spend per click; null without clicks. */
  cpc: number | null;
  /** Spend per conversion; null without conversions. */
  costPerConversion: number | null;
}

export interface GrowthPerformanceDay {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface GrowthPerformanceSummary {
  totals: GrowthPerformanceTotals;
  daily: GrowthPerformanceDay[];
  byTarget: Record<string, GrowthPerformanceTotals>;
}

function totalsOf(rows: readonly GrowthPerformanceRow[]): GrowthPerformanceTotals {
  const sum = (key: 'spend' | 'impressions' | 'clicks' | 'linkClicks' | 'conversions') => rows.reduce((total, row) => total + row[key], 0);
  const spend = Math.round(sum('spend') * 100) / 100;
  const impressions = sum('impressions');
  const clicks = sum('clicks');
  const conversions = sum('conversions');
  return {
    spend,
    impressions,
    clicks,
    linkClicks: sum('linkClicks'),
    conversions,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpc: clicks > 0 ? spend / clicks : null,
    costPerConversion: conversions > 0 ? spend / conversions : null,
  };
}

/** Every date from `since` to `until` (inclusive), YYYY-MM-DD. */
export function dateRange(since: string, until: string): string[] {
  const days: string[] = [];
  const end = new Date(`${until}T00:00:00Z`).getTime();
  for (let at = new Date(`${since}T00:00:00Z`).getTime(); at <= end && days.length < 400; at += 86_400_000) days.push(new Date(at).toISOString().slice(0, 10));
  return days;
}

/** The last `days` days ending today (UTC), as the since/until the platform is asked for. */
export function lastDays(days: number, now: Date = new Date()): { since: string; until: string } {
  const until = now.toISOString().slice(0, 10);
  const since = new Date(now.getTime() - (Math.max(1, days) - 1) * 86_400_000).toISOString().slice(0, 10);
  return { since, until };
}

export function summarizeGrowthPerformance(rows: readonly GrowthPerformanceRow[], targetOfCampaign: Readonly<Record<string, string>>, range: { since: string; until: string }): GrowthPerformanceSummary {
  const known = rows.filter((row) => targetOfCampaign[row.campaignId] && row.date >= range.since && row.date <= range.until);
  const byDate = new Map<string, GrowthPerformanceRow[]>();
  for (const row of known) byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);
  const daily = dateRange(range.since, range.until).map((date) => {
    const day = totalsOf(byDate.get(date) ?? []);
    return { date, spend: day.spend, impressions: day.impressions, clicks: day.clicks, conversions: day.conversions };
  });
  const byTarget: Record<string, GrowthPerformanceTotals> = {};
  for (const targetId of new Set(Object.values(targetOfCampaign))) {
    byTarget[targetId] = totalsOf(known.filter((row) => targetOfCampaign[row.campaignId] === targetId));
  }
  return { totals: totalsOf(known), daily, byTarget };
}
