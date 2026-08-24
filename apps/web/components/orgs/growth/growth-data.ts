import type {
  ActionableInsightItem,
  AudienceSegmentItem,
  CampaignLeaderboardItem,
  ChannelPerformance,
  CreativePerformanceItem,
  DeviceBreakdownItem,
  FunnelStepItem,
  GrowthChannelFilter,
  GrowthDateRange,
  GrowthKpiSummary,
} from './types';

export function getGrowthKpis(range: GrowthDateRange, channel: GrowthChannelFilter): GrowthKpiSummary {
  const multiplier = range === '7d' ? 0.25 : range === '90d' ? 3.0 : 1.0;
  const channelFactor = channel === 'google_ads' ? 0.52 : channel === 'meta_ads' ? 0.38 : channel === 'tiktok' ? 0.1 : 1.0;

  const baseSpend = 24850 * multiplier * (channel === 'all' || channel === 'organic' ? 1.0 : channelFactor);
  const baseRevenue = 95420 * multiplier * (channel === 'all' || channel === 'organic' ? 1.0 : channelFactor);
  const blendedRoas = baseSpend > 0 ? Number((baseRevenue / baseSpend).toFixed(2)) : 0;
  const totalConversions = Math.round(412 * multiplier * (channel === 'all' || channel === 'organic' ? 1.0 : channelFactor));
  const blendedCac = totalConversions > 0 ? Number((baseSpend / totalConversions).toFixed(2)) : 0;
  const netProfit = baseRevenue - baseSpend;

  return {
    totalSpend: Math.round(baseSpend),
    totalRevenue: Math.round(baseRevenue),
    blendedRoas,
    totalConversions,
    blendedCac,
    netProfit: Math.round(netProfit),
    spendDeltaPct: 12.4,
    revenueDeltaPct: 28.6,
    conversionsDeltaPct: 21.3,
    cacDeltaPct: -14.2,
  };
}

export function getChannelPerformances(range: GrowthDateRange): ChannelPerformance[] {
  const mult = range === '7d' ? 0.25 : range === '90d' ? 3.0 : 1.0;
  return [
    {
      channelId: 'google_ads',
      nameKey: 'channelGoogleAds',
      spend: Math.round(12800 * mult),
      revenue: Math.round(54200 * mult),
      roas: 4.23,
      conversions: Math.round(218 * mult),
      cpa: Math.round(58.71),
      revenueSharePct: 57,
      isTopRoas: true,
    },
    {
      channelId: 'meta_ads',
      nameKey: 'channelMetaAds',
      spend: Math.round(9450 * mult),
      revenue: Math.round(33100 * mult),
      roas: 3.5,
      conversions: Math.round(146 * mult),
      cpa: Math.round(64.72),
      revenueSharePct: 35,
    },
    {
      channelId: 'tiktok',
      nameKey: 'channelTikTok',
      spend: Math.round(2600 * mult),
      revenue: Math.round(8120 * mult),
      roas: 3.12,
      conversions: Math.round(48 * mult),
      cpa: Math.round(54.16),
      revenueSharePct: 8,
    },
  ];
}

export function getCampaignLeaderboard(channel: GrowthChannelFilter): CampaignLeaderboardItem[] {
  const all: CampaignLeaderboardItem[] = [
    {
      id: 'cmp-1',
      name: 'Search - High Intent Brand & Solution',
      channel: 'google_ads',
      status: 'active',
      spend: 5200,
      conversions: 104,
      cpa: 50.0,
      revenue: 26800,
      roas: 5.15,
      recommendationKey: 'recScaleBudget',
      isTopPerformer: true,
    },
    {
      id: 'cmp-2',
      name: 'Meta - Retargeting Cart Abandoners (7d)',
      channel: 'meta_ads',
      status: 'active',
      spend: 3400,
      conversions: 68,
      cpa: 50.0,
      revenue: 16200,
      roas: 4.76,
      recommendationKey: 'recScaleLookalike',
    },
    {
      id: 'cmp-3',
      name: 'Performance Max - Top Products',
      channel: 'google_ads',
      status: 'active',
      spend: 4800,
      conversions: 72,
      cpa: 66.67,
      revenue: 18400,
      roas: 3.83,
      recommendationKey: 'recProfitableMaintain',
    },
    {
      id: 'cmp-4',
      name: 'Meta - Prospecting Lookalike 1% Buyers',
      channel: 'meta_ads',
      status: 'active',
      spend: 4100,
      conversions: 54,
      cpa: 75.93,
      revenue: 12900,
      roas: 3.15,
      recommendationKey: 'recRefreshCreative',
    },
    {
      id: 'cmp-5',
      name: 'TikTok - UGC Video Hook Testing',
      channel: 'tiktok',
      status: 'learning',
      spend: 2600,
      conversions: 48,
      cpa: 54.17,
      revenue: 8120,
      roas: 3.12,
      recommendationKey: 'recScaleWinnerHook',
    },
    {
      id: 'cmp-6',
      name: 'Search - Generic Competitor Conquesting',
      channel: 'google_ads',
      status: 'active',
      spend: 2800,
      conversions: 22,
      cpa: 127.27,
      revenue: 4200,
      roas: 1.5,
      recommendationKey: 'recOptimizeNegativeKeywords',
    },
  ];

  if (channel === 'all') return all;
  return all.filter((c) => c.channel === channel);
}

export function getCreativePerformances(channel: GrowthChannelFilter): CreativePerformanceItem[] {
  const all: CreativePerformanceItem[] = [
    {
      id: 'cr-1',
      headline: 'Stop Wasting 40% of Ad Spend — Automated Growth OS',
      format: 'video',
      channel: 'meta_ads',
      impressions: 48500,
      clicks: 1940,
      ctrPct: 4.0,
      conversions: 62,
      revenue: 15500,
      roas: 5.34,
      cpa: 46.77,
      isTopWinner: true,
    },
    {
      id: 'cr-2',
      headline: 'The #1 Marketing Growth Engine for Fast-Moving Brands',
      format: 'search_text',
      channel: 'google_ads',
      impressions: 32400,
      clicks: 2268,
      ctrPct: 7.0,
      conversions: 78,
      revenue: 20280,
      roas: 4.95,
      cpa: 52.56,
    },
    {
      id: 'cr-3',
      headline: 'Before vs After GrowthOS: 3.4x Revenue in 60 Days',
      format: 'carousel',
      channel: 'meta_ads',
      impressions: 39100,
      clicks: 1446,
      ctrPct: 3.7,
      conversions: 44,
      revenue: 10560,
      roas: 3.84,
      cpa: 62.5,
    },
    {
      id: 'cr-4',
      headline: 'Real Founder Unboxing & First-Look Dashboard',
      format: 'video',
      channel: 'tiktok',
      impressions: 54000,
      clicks: 2700,
      ctrPct: 5.0,
      conversions: 48,
      revenue: 8120,
      roas: 3.12,
      cpa: 54.17,
    },
  ];

  if (channel === 'all') return all;
  return all.filter((c) => c.channel === channel);
}

export function getAudienceSegments(): AudienceSegmentItem[] {
  return [
    {
      id: 'seg-1',
      nameKey: 'segmentLookalikeBuyers',
      type: 'lookalike',
      visitors: 4200,
      conversions: 142,
      conversionRatePct: 3.38,
      revenue: 35500,
      roas: 4.62,
    },
    {
      id: 'seg-2',
      nameKey: 'segmentCartAbandoners',
      type: 'retargeting',
      visitors: 1850,
      conversions: 118,
      conversionRatePct: 6.38,
      revenue: 28320,
      roas: 5.45,
    },
    {
      id: 'seg-3',
      nameKey: 'segmentHighIntentSearch',
      type: 'search_intent',
      visitors: 3100,
      conversions: 98,
      conversionRatePct: 3.16,
      revenue: 21560,
      roas: 4.12,
    },
    {
      id: 'seg-4',
      nameKey: 'segmentBroadInterest',
      type: 'interest',
      visitors: 5800,
      conversions: 54,
      conversionRatePct: 0.93,
      revenue: 10040,
      roas: 2.15,
    },
  ];
}

export function getDeviceBreakdown(): DeviceBreakdownItem[] {
  return [
    { device: 'mobile', trafficSharePct: 68, conversionRatePct: 3.1, revenue: 59160 },
    { device: 'desktop', trafficSharePct: 28, conversionRatePct: 4.4, revenue: 33400 },
    { device: 'tablet', trafficSharePct: 4, conversionRatePct: 1.8, revenue: 2860 },
  ];
}

export function getFunnelSteps(range: GrowthDateRange): FunnelStepItem[] {
  const mult = range === '7d' ? 0.25 : range === '90d' ? 3.0 : 1.0;
  return [
    { key: 'impressions', titleKey: 'funnelImpressions', count: Math.round(240000 * mult) },
    { key: 'clicks', titleKey: 'funnelClicks', count: Math.round(14200 * mult), conversionFromPrevPct: 5.92, dropoffPct: 94.08 },
    { key: 'visitors', titleKey: 'funnelVisitors', count: Math.round(12800 * mult), conversionFromPrevPct: 90.14, dropoffPct: 9.86 },
    { key: 'leads', titleKey: 'funnelLeads', count: Math.round(1640 * mult), conversionFromPrevPct: 12.81, dropoffPct: 87.19 },
    { key: 'customers', titleKey: 'funnelCustomers', count: Math.round(412 * mult), conversionFromPrevPct: 25.12, dropoffPct: 74.88 },
  ];
}

export function getActionableInsights(): ActionableInsightItem[] {
  return [
    {
      id: 'ins-1',
      type: 'scale',
      severity: 'opportunity',
      titleKey: 'insightScaleTitle',
      descriptionKey: 'insightScaleDesc',
      impactKey: 'insightScaleImpact',
      actionKey: 'insightScaleAction',
    },
    {
      id: 'ins-2',
      type: 'alert',
      severity: 'warning',
      titleKey: 'insightWastedSpendTitle',
      descriptionKey: 'insightWastedSpendDesc',
      impactKey: 'insightWastedSpendImpact',
      actionKey: 'insightWastedSpendAction',
    },
    {
      id: 'ins-3',
      type: 'creative',
      severity: 'opportunity',
      titleKey: 'insightWinningCreativeTitle',
      descriptionKey: 'insightWinningCreativeDesc',
      impactKey: 'insightWinningCreativeImpact',
      actionKey: 'insightWinningCreativeAction',
    },
    {
      id: 'ins-4',
      type: 'audience',
      severity: 'info',
      titleKey: 'insightAudienceTitle',
      descriptionKey: 'insightAudienceDesc',
      impactKey: 'insightAudienceImpact',
      actionKey: 'insightAudienceAction',
    },
  ];
}
