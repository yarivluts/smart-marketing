export type AutopilotChannelId = 'google_ads' | 'meta_ads' | 'tiktok' | 'connected_tv';

export type AutopilotChannelStatus = 'scaling' | 'stable' | 'rebalancing' | 'throttled';

export interface AutopilotChannelPerformance {
  channel: AutopilotChannelId;
  channelLabel: string;
  dailySpendUsd: number;
  spendSharePct: number;
  roas7d: number;
  targetRoas: number;
  cpaUsd: number;
  targetCpa: number;
  conversionsPerMin: number;
  trend: 'up' | 'down' | 'flat';
  status: AutopilotChannelStatus;
}

export interface AutopilotGuardrails {
  dailyCapUsd: number;
  minRoasFloor: number;
  maxCpaCeiling: number;
  maxShiftVelocityPct: number;
  killSwitchEngaged: boolean;
}

export interface AutopilotFatigueMitigationItem {
  id: string;
  creativeId: string;
  creativeName: string;
  channel: string;
  frequency: number;
  currentCtrPct: number;
  baselineCtrPct: number;
  decayPct: number;
  fatigueLevel: 'fresh' | 'wearing_out' | 'fatigued';
  recommendedAction: 'auto_swap' | 'throttle' | 'review' | 'scale';
  timestamp: string;
}

export type AutopilotPipelineStageId =
  | 'telemetry_ingest'
  | 'neural_analysis'
  | 'channel_rebalance'
  | 'fatigue_mitigation'
  | 'live_deployment';

export interface AutopilotPipelineStage {
  stageId: AutopilotPipelineStageId;
  stageNumber: string;
  title: string;
  description: string;
  durationMs: number;
  status: 'complete' | 'running' | 'queued' | 'skipped';
  progressPct?: number;
}

export type AutopilotActionType =
  | 'budget_rebalance'
  | 'creative_swap'
  | 'kill_switch_pause'
  | 'frequency_cap_throttle';

export interface AutopilotActionRecord {
  id: string;
  timestamp: string;
  actionType: AutopilotActionType;
  channel: string;
  targetCampaignId?: string;
  beforeBudgetUsd: number;
  afterBudgetUsd: number;
  deltaPct: number;
  reason: string;
  impact: string;
  status: 'executed' | 'rolled_back';
  executedBy: string;
}

export interface AutopilotKpis {
  roasVelocity: {
    currentRoas: number;
    targetRoas: number;
    roasDeltaPct: number;
    status: 'optimal' | 'rebalancing' | 'below_floor';
  };
  spendCap: {
    activeSpendUsd: number;
    dailyCapUsd: number;
    capUtilizationPct: number;
    pacingStatus: 'stable' | 'near_cap' | 'capped';
  };
  conversionVelocity: {
    currentVpm: number;
    targetVpm: number;
    deltaVpm: number;
    latencyMs: number;
  };
  cadenceStability: {
    jitterErrorPct: number;
    nominalStatus: string;
    syncPct: number;
  };
}

export interface AutopilotTelemetryResult {
  hasData: boolean;
  autopilotActive: boolean;
  killSwitchTriggered: boolean;
  kpis: AutopilotKpis;
  channels: AutopilotChannelPerformance[];
  fatigueAlerts: AutopilotFatigueMitigationItem[];
  pipelineStages: AutopilotPipelineStage[];
  recentActions: AutopilotActionRecord[];
  guardrails: AutopilotGuardrails;
}

export interface RebalanceProposal {
  channel: AutopilotChannelId;
  beforeDailySpendUsd: number;
  proposedDailySpendUsd: number;
  deltaUsd: number;
  deltaPct: number;
  reason: string;
  impact: string;
}

export interface FatigueMitigationProposal {
  creativeId: string;
  creativeName: string;
  channel: string;
  action: 'auto_swap' | 'throttle' | 'review';
  frequency: number;
  decayPct: number;
  reason: string;
}

export interface AutopilotOptimizationCycleResult {
  executionId: string;
  executedAt: string;
  guardrailsChecked: AutopilotGuardrails;
  rebalanceProposals: RebalanceProposal[];
  fatigueMitigationProposals: FatigueMitigationProposal[];
  actionsGenerated: AutopilotActionRecord[];
  pipelineStages: AutopilotPipelineStage[];
  newTelemetry: AutopilotTelemetryResult;
}
