export interface FunnelStep {
  stageKey: string;
  stepOrder: number;
  stageLabel: string;
  customerCount: number;
  conversionPercent: number;
  dropOffPercent: number;
  isBottleneck?: boolean;
  avgDurationHours?: number;
}

export interface FunnelSummaryMetrics {
  totalStarted: number;
  totalCompleted: number;
  overallConversionRate: number;
  highestDropOffStage?: FunnelStep | null;
  avgVelocityDays?: number;
}

export type FunnelChannelFilter = 'all' | 'meta' | 'google' | 'email' | 'organic';
