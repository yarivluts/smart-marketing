export type GoalDirection = 'maximize' | 'minimize' | 'range';
export type GoalPaceStatus = 'on_track' | 'at_risk' | 'off_track';
export type GoalRhythm = 'even' | 'work_week_weekend';

export interface GoalProgressCalculation {
  progressRatio: number;
  percentFilled: number;
  status: GoalPaceStatus;
  expectedAtNow: number;
  projectedFinalValue: number;
  projectedCompletionDate?: string | null;
  isGoalMet: boolean;
}

export interface GoalItem {
  id: string;
  name: string;
  metricKey: string;
  metricLabel: string;
  direction: GoalDirection;
  targetValue: number;
  actualValue: number;
  rangeMin?: number | null;
  rangeMax?: number | null;
  startDate: string;
  deadline: string;
  rhythm?: GoalRhythm;
  ownerId?: string | null;
  ownerName?: string | null;
  progress?: GoalProgressCalculation;
}

export interface CohortPeriodData {
  periodNumber: number;
  retainedCount: number;
  retentionRatePercent: number;
  colorClass?: string;
}

export interface CohortHeatmapRow {
  cohortMonth: string;
  cohortLabel: string;
  cohortSize: number;
  periods: CohortPeriodData[];
}

export interface PaybackVelocityItem {
  windowDays: 7 | 14 | 30 | 40;
  collectedRevenue: number;
  targetRevenue: number;
  pacePercent: number;
}

export interface QualityCalibrationItem {
  tier: string;
  tierLabel: string;
  signups: number;
  payingSignups: number;
  payingRatePercent: number;
  avgCollectedRevenue40d: number;
}
