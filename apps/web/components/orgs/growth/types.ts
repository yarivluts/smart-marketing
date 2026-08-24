export type GrowthDateRange = '7d' | '30d' | '90d' | 'this_month';
export type GrowthChannelFilter = 'all' | 'google_ads' | 'meta_ads' | 'tiktok' | 'organic';
export type GrowthBusinessModel = 'all' | 'subscriptions' | 'ecommerce';

export interface GrowthKpiSummary {
  totalSpend: number;
  totalRevenue: number;
  blendedRoas: number;
  totalConversions: number;
  blendedCac: number;
  netProfit: number;
  spendDeltaPct: number;
  revenueDeltaPct: number;
  conversionsDeltaPct: number;
  cacDeltaPct: number;
}

export interface ChannelPerformance {
  channelId: 'google_ads' | 'meta_ads' | 'tiktok' | 'organic' | 'email';
  nameKey: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  cpa: number;
  revenueSharePct: number;
  isTopRoas?: boolean;
}

export interface CampaignLeaderboardItem {
  id: string;
  name: string;
  channel: 'google_ads' | 'meta_ads' | 'tiktok';
  status: 'active' | 'learning' | 'paused';
  spend: number;
  conversions: number;
  cpa: number;
  revenue: number;
  roas: number;
  recommendationKey: string;
  isTopPerformer?: boolean;
}

export interface CreativePerformanceItem {
  id: string;
  headline: string;
  format: 'video' | 'image' | 'carousel' | 'search_text';
  channel: 'google_ads' | 'meta_ads' | 'tiktok';
  impressions: number;
  clicks: number;
  ctrPct: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  isTopWinner?: boolean;
}

export interface AudienceSegmentItem {
  id: string;
  nameKey: string;
  type: 'lookalike' | 'retargeting' | 'interest' | 'search_intent';
  visitors: number;
  conversions: number;
  conversionRatePct: number;
  revenue: number;
  roas: number;
}

export interface DeviceBreakdownItem {
  device: 'mobile' | 'desktop' | 'tablet';
  trafficSharePct: number;
  conversionRatePct: number;
  revenue: number;
}

export interface FunnelStepItem {
  key: string;
  titleKey: string;
  count: number;
  conversionFromPrevPct?: number;
  dropoffPct?: number;
}

export interface ActionableInsightItem {
  id: string;
  type: 'scale' | 'alert' | 'creative' | 'audience';
  severity: 'opportunity' | 'warning' | 'info';
  titleKey: string;
  descriptionKey: string;
  impactKey: string;
  actionKey: string;
}

export interface SubscriptionGrowthMetrics {
  mrr: number;
  arr: number;
  mrrGrowthRatePct: number;
  activeSubscribers: number;
  trialToPaidConversionPct: number;
  monthlyChurnRatePct: number;
  ltv: number;
  ltvToCacRatio: number;
  cacPaybackMonths: number;
  tiers: {
    nameKey: string;
    subscribers: number;
    mrrSharePct: number;
    arpu: number;
  }[];
}

export interface EcommerceGrowthMetrics {
  grossMerchandiseValue: number;
  averageOrderValue: number;
  aovDeltaPct: number;
  totalOrders: number;
  cartAbandonmentRatePct: number;
  cartRecoveryRevenue: number;
  repeatPurchaseRatePct: number;
  topSellingProducts: {
    id: string;
    nameKey: string;
    unitsSold: number;
    revenue: number;
    conversionRatePct: number;
  }[];
}
