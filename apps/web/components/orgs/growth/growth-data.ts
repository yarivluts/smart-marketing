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

export function getGrowthKpis(
  range: GrowthDateRange,
  channel: GrowthChannelFilter,
  isLiveMode = false,
  hasLiveTraffic = false,
): GrowthKpiSummary {
  if (isLiveMode && !hasLiveTraffic) {
    return {
      totalSpend: 0,
      totalRevenue: 0,
      blendedRoas: 0,
      totalConversions: 0,
      blendedCac: 0,
      netProfit: 0,
      spendDeltaPct: 0,
      revenueDeltaPct: 0,
      conversionsDeltaPct: 0,
      cacDeltaPct: 0,
    };
  }

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

export function getChannelPerformances(
  range: GrowthDateRange,
  isLiveMode = false,
  hasLiveTraffic = false,
): ChannelPerformance[] {
  if (isLiveMode && !hasLiveTraffic) {
    return [];
  }

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

export function getCampaignLeaderboard(
  channel: GrowthChannelFilter,
  projectName = '',
  isLiveMode = false,
  hasLiveTraffic = false,
): CampaignLeaderboardItem[] {
  if (isLiveMode && !hasLiveTraffic) {
    return [];
  }

  const prefix = projectName ? `${projectName} - ` : '';

  const all: CampaignLeaderboardItem[] = [
    {
      id: 'cmp-1',
      name: `${prefix}Google Search B2B High Intent`,
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
      name: `${prefix}Meta Retargeting Trial Abandoners (7d)`,
      channel: 'meta_ads',
      status: 'active',
      spend: 3400,
      conversions: 68,
      cpa: 50.0,
      revenue: 16200,
      roas: 4.76,
      recommendationKey: 'recTopRetargeting',
    },
    {
      id: 'cmp-3',
      name: `${prefix}Google Performance Max Document Workflow`,
      channel: 'google_ads',
      status: 'active',
      spend: 4100,
      conversions: 71,
      cpa: 57.74,
      revenue: 18400,
      roas: 4.49,
      recommendationKey: 'recProfitableStable',
    },
    {
      id: 'cmp-4',
      name: `${prefix}Meta Video Lookalike 1% Decision Makers`,
      channel: 'meta_ads',
      status: 'active',
      spend: 3800,
      conversions: 52,
      cpa: 73.07,
      revenue: 11200,
      roas: 2.95,
      recommendationKey: 'recScaleWinnerHook',
    },
    {
      id: 'cmp-5',
      name: `${prefix}Google Search Generic Keywords`,
      channel: 'google_ads',
      status: 'active',
      spend: 3500,
      conversions: 28,
      cpa: 125.0,
      revenue: 6200,
      roas: 1.77,
      recommendationKey: 'recOptimizeNegativeKeywords',
    },
  ];

  if (channel === 'all') return all;
  return all.filter((c) => c.channel === channel);
}

export function getCreativePerformances(
  channel: GrowthChannelFilter,
  projectName = '',
  isLiveMode = false,
  hasLiveTraffic = false,
): CreativePerformanceItem[] {
  if (isLiveMode && !hasLiveTraffic) {
    return [];
  }

  const isEasySign = projectName.toLowerCase().includes('easysign') || projectName.toLowerCase().includes('sign');

  const headline1 = isEasySign
    ? 'Sign contracts and documents from anywhere in 30 seconds'
    : 'Stop Wasting 40% of Ad Spend - Autonomous Marketing ROI Engine';

  const headline2 = isEasySign
    ? 'Replace paper, scanning and couriers with secure digital signatures'
    : 'Transform Ad Clicks Into Paying Customers - Live Growth OS';

  const headline3 = isEasySign
    ? 'EasySign B2B Enterprise: Legally binding electronic signature platform'
    : 'Full-Funnel ROAS Attribution - See Exactly Which Campaign Wins';

  const headline4 = isEasySign
    ? 'Start Free 14-Day Trial - Unlimited documents and team templates'
    : 'Instant AI Growth Recommendations - Automated Budget Scaling';

  const all: CreativePerformanceItem[] = [
    {
      id: 'cr-1',
      headline: headline1,
      format: 'video',
      channel: 'meta_ads',
      impressions: 48000,
      clicks: 1930,
      ctrPct: 4.02,
      conversions: 62,
      revenue: 15500,
      roas: 5.34,
      cpa: 46.77,
      isTopWinner: true,
    },
    {
      id: 'cr-2',
      headline: headline2,
      format: 'search_text',
      channel: 'google_ads',
      impressions: 24500,
      clicks: 1675,
      ctrPct: 6.84,
      conversions: 78,
      revenue: 19800,
      roas: 5.21,
      cpa: 48.71,
    },
    {
      id: 'cr-3',
      headline: headline3,
      format: 'carousel',
      channel: 'meta_ads',
      impressions: 32000,
      clicks: 1008,
      ctrPct: 3.15,
      conversions: 34,
      revenue: 7200,
      roas: 3.43,
      cpa: 61.76,
    },
    {
      id: 'cr-4',
      headline: headline4,
      format: 'image',
      channel: 'google_ads',
      impressions: 18200,
      clicks: 336,
      ctrPct: 1.85,
      conversions: 18,
      revenue: 3800,
      roas: 2.71,
      cpa: 77.77,
    },
  ];

  if (channel === 'all') return all;
  return all.filter((c) => c.channel === channel);
}

export function getAudienceSegments(isLiveMode = false, hasLiveTraffic = false): AudienceSegmentItem[] {
  if (isLiveMode && !hasLiveTraffic) {
    return [];
  }

  return [
    {
      id: 'seg-1',
      nameKey: 'segmentLookalikeBuyers',
      type: 'lookalike',
      visitors: 4200,
      conversions: 168,
      conversionRatePct: 4.0,
      revenue: 41200,
      roas: 4.85,
    },
    {
      id: 'seg-2',
      nameKey: 'segmentCartAbandoners',
      type: 'retargeting',
      visitors: 1100,
      conversions: 70,
      conversionRatePct: 6.36,
      revenue: 22400,
      roas: 5.1,
    },
    {
      id: 'seg-3',
      nameKey: 'segmentHighIntentSearch',
      type: 'search_intent',
      visitors: 3800,
      conversions: 124,
      conversionRatePct: 3.26,
      revenue: 24800,
      roas: 4.12,
    },
    {
      id: 'seg-4',
      nameKey: 'segmentBroadInterest',
      type: 'interest',
      visitors: 3700,
      conversions: 50,
      conversionRatePct: 1.35,
      revenue: 7020,
      roas: 1.95,
    },
  ];
}

export function getDeviceBreakdown(isLiveMode = false, hasLiveTraffic = false): DeviceBreakdownItem[] {
  if (isLiveMode && !hasLiveTraffic) {
    return [];
  }

  return [
    {
      device: 'mobile',
      trafficSharePct: 68,
      conversionRatePct: 2.82,
      revenue: 56800,
    },
    {
      device: 'desktop',
      trafficSharePct: 28,
      conversionRatePct: 4.12,
      revenue: 34900,
    },
    {
      device: 'tablet',
      trafficSharePct: 4,
      conversionRatePct: 3.52,
      revenue: 3720,
    },
  ];
}

export function getFunnelSteps(
  range: GrowthDateRange,
  isLiveMode = false,
  hasLiveTraffic = false,
): FunnelStepItem[] {
  if (isLiveMode && !hasLiveTraffic) {
    return [
      { key: 'impressions', titleKey: 'funnelImpressions', count: 0 },
      { key: 'clicks', titleKey: 'funnelClicks', count: 0, conversionFromPrevPct: 0, dropoffPct: 0 },
      { key: 'visitors', titleKey: 'funnelVisitors', count: 0, conversionFromPrevPct: 0, dropoffPct: 0 },
      { key: 'leads', titleKey: 'funnelLeads', count: 0, conversionFromPrevPct: 0, dropoffPct: 0 },
      { key: 'customers', titleKey: 'funnelCustomers', count: 0, conversionFromPrevPct: 0, dropoffPct: 0 },
    ];
  }

  const mult = range === '7d' ? 0.25 : range === '90d' ? 3.0 : 1.0;
  const impressions = Math.round(240000 * mult);
  const clicks = Math.round(14200 * mult);
  const visitors = Math.round(12800 * mult);
  const leads = Math.round(1640 * mult);
  const customers = Math.round(412 * mult);

  return [
    {
      key: 'impressions',
      titleKey: 'funnelImpressions',
      count: impressions,
    },
    {
      key: 'clicks',
      titleKey: 'funnelClicks',
      count: clicks,
      conversionFromPrevPct: (clicks / impressions) * 100,
      dropoffPct: (1 - clicks / impressions) * 100,
    },
    {
      key: 'visitors',
      titleKey: 'funnelVisitors',
      count: visitors,
      conversionFromPrevPct: (visitors / clicks) * 100,
      dropoffPct: (1 - visitors / clicks) * 100,
    },
    {
      key: 'leads',
      titleKey: 'funnelLeads',
      count: leads,
      conversionFromPrevPct: (leads / visitors) * 100,
      dropoffPct: (1 - leads / visitors) * 100,
    },
    {
      key: 'customers',
      titleKey: 'funnelCustomers',
      count: customers,
      conversionFromPrevPct: (customers / leads) * 100,
      dropoffPct: (1 - customers / leads) * 100,
    },
  ];
}

export function getActionableInsights(isLiveMode = false, hasLiveTraffic = false): ActionableInsightItem[] {
  if (isLiveMode && !hasLiveTraffic) {
    return [];
  }

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
