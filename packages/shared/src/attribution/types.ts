export type AttributionModelType =
  | 'data_driven_ml'
  | 'shapley'
  | 'markov'
  | 'linear'
  | 'first_touch'
  | 'last_touch'
  | 'w_shaped'
  | 'time_decay';

export interface TouchpointRecord {
  channelId: string;
  channelName: string;
  timestamp: number;
  campaignId?: string;
  landingPage?: string;
}

export interface CustomerJourneyRecord {
  journeyId: string;
  customerId: string;
  touchpoints: TouchpointRecord[];
  converted: boolean;
  conversionRevenue: number;
  conversionTimestamp: number;
  conversionEvent?: string;
}

export interface ChannelAttributionMetric {
  channelId: string;
  channelName: string;
  role: string;
  color: string;
  touchCount: number;
  firstTouchRevenue: number;
  firstTouchSharePct: number;
  lastTouchRevenue: number;
  lastTouchSharePct: number;
  linearRevenue: number;
  linearSharePct: number;
  timeDecayRevenue: number;
  timeDecaySharePct: number;
  wShapedRevenue: number;
  wShapedSharePct: number;
  markovRevenue: number;
  markovSharePct: number;
  shapleyRevenue: number;
  shapleySharePct: number;
  // Blended ML model is 50% Shapley + 50% Markov
  mlRevenue: number;
  mlSharePct: number;
  roas: number;
  roasStatus: 'emerald' | 'amber';
  varianceVsLastTouchPct: number;
  assistanceRatio: number;
}

export interface ConversionPathWay {
  pathId: string;
  sequence: Array<{ channelId: string; label: string; colorClass?: string }>;
  category: 'all' | 'three_plus' | 'paid_to_organic' | 'enterprise_b2b';
  journeyCount: number;
  journeySharePct: number;
  avgCycleDays: number;
  attributedRevenue: number;
  mlLiftPct: number;
}

export interface MarkovTransitionMatrix {
  states: string[];
  transitions: Record<string, Record<string, number>>;
  probabilities: Record<string, Record<string, number>>;
  removalEffects: Record<string, number>;
  normalizedWeights: Record<string, number>;
}

export interface AttributionKpiSummary {
  totalAttributedRevenue: number;
  verifiedConversions: number;
  deltaVsLastTouchPct: number;
  topConverterChannel: {
    channelId: string;
    channelName: string;
    revenue: number;
    sharePct: number;
    role: string;
    tag: string;
  };
  omniAssistedMultiplier: {
    value: number;
    unit: string;
    delta: string;
    trend: number[];
  };
  incrementalityLiftIndex: {
    valuePct: number;
    statSigPct: number;
    description: string;
  };
}

export interface AttributionCopilotRecommendation {
  id: string;
  confidenceScorePct: number;
  headline: string;
  narrative: string;
  projectedNetMonthlyLiftMrr: number;
  sourceChannel: string;
  targetChannel: string;
  recommendedDailyShiftUsd: number;
}

export interface AttributionSensitivityConfig {
  lookbackDays: 30 | 60 | 90;
  halfLifeDays: number;
  wShapedFirstWeight: number;
  wShapedMiddleWeight: number;
  wShapedLastWeight: number;
}

export interface AttributionIngestionHealth {
  status: 'healthy' | 'degraded';
  streamLagSec: number;
  matchConfidencePct: number;
  provider: string;
}

export interface AttributionTelemetryResult {
  kpis: AttributionKpiSummary;
  channels: ChannelAttributionMetric[];
  pathways: ConversionPathWay[];
  copilot: AttributionCopilotRecommendation;
  sensitivity: AttributionSensitivityConfig;
  ingestionHealth: AttributionIngestionHealth;
}
