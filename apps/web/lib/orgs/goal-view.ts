import type { GoalModel, GoalProgressOutcome } from '@growthos/firebase-orm-models';
import type { GoalForecastMilestone, GoalForecastResult, GoalPaceStatus, GoalTrajectoryPoint } from '@growthos/shared';

/** A goal's own list-page card — never sends the full `@arbel/firebase-orm` model instance to a client component. */
export interface GoalSummaryView {
  id: string;
  name: string;
  metricName: string;
  direction: GoalModel['direction'];
  /** `null` unless `direction` is `maximize`/`minimize` — see `GoalModel.target_value`'s own doc comment. */
  targetValue: number | null;
  /** `null` unless `direction === 'range'` — see `GoalModel.range_min`'s own doc comment. */
  rangeMin: number | null;
  /** `null` unless `direction === 'range'` — see `GoalModel.range_max`'s own doc comment. */
  rangeMax: number | null;
  deadline: string;
  ownerPersonId: string;
}

export function toGoalSummaryView(goal: GoalModel): GoalSummaryView {
  return {
    id: goal.id,
    name: goal.name,
    metricName: goal.metric_name,
    direction: goal.direction,
    targetValue: goal.target_value,
    rangeMin: goal.range_min,
    rangeMax: goal.range_max,
    deadline: goal.deadline,
    ownerPersonId: goal.owner_person_id,
  };
}

/** Mirrors `BoardTileUnavailableReason` (`board-view.ts`) — `queryGoalProgress`'s own degraded-outcome reason union. */
export type GoalProgressUnavailableReason = 'warehouse_not_configured' | 'quota_exceeded' | 'not_yet_backed' | 'query_error';

const STATUS_COLOR: Record<GoalPaceStatus, 'green' | 'amber' | 'red'> = {
  on_track: 'green',
  at_risk: 'amber',
  off_track: 'red',
};

export interface GoalForecastView {
  completionProbability: number;
  probabilityFormatted: string; // e.g. "84.2%"
  p10: number;
  p50: number;
  p90: number;
  projectedCompletionDate: string | null;
  projectedDaysAheadOrBehind: number;
  meanDailyVelocity: number;
  standardDeviation: number;
  velocityUpliftPct: number;
  simulatedRuns: number;
  trajectorySpline: GoalTrajectoryPoint[];
  milestones: GoalForecastMilestone[];
}

export type GoalThermometerView =
  | {
      kind: 'ok';
      /** 0-100, clamped — the thermometer bar's fill percentage. */
      percentFilled: number;
      status: GoalPaceStatus;
      statusColor: 'green' | 'amber' | 'red';
      actualValue: number;
      expectedAtNow: number;
      projectedFinalValue: number;
      isGoalMet: boolean;
      forecast?: GoalForecastResult;
    }
  | { kind: 'warehouse_not_configured' }
  | { kind: 'quota_exceeded'; message: string }
  | { kind: 'not_yet_backed'; message: string }
  | { kind: 'query_error'; message: string };

/**
 * Turns one goal's raw `queryGoalProgress` outcome into the shape
 * `GoalThermometer` renders — mirrors `buildTileRenderView`'s own
 * ok/degraded-outcome split (`board-view.ts`). `percentFilled` reuses
 * `GoalProgressResult.progressRatio` (already the right 0..1+ fill math per
 * direction — see that field's own doc comment in `goal-progress.ts`),
 * clamped to 0-100 here since a thermometer bar can't render past full or
 * below empty even when the underlying ratio legitimately exceeds 1 (an
 * over-target maximize goal) or sits at 0 (a range goal missed on the low
 * side).
 */
export function buildGoalThermometerView(outcome: GoalProgressOutcome): GoalThermometerView {
  if (!outcome.ok) {
    if (outcome.reason === 'warehouse_not_configured') {
      return { kind: 'warehouse_not_configured' };
    }
    return { kind: outcome.reason, message: outcome.message };
  }

  const { progress, actualValue, forecast } = outcome;
  const percentFilled = Math.min(100, Math.max(0, progress.progressRatio * 100));

  return {
    kind: 'ok',
    percentFilled,
    status: progress.status,
    statusColor: STATUS_COLOR[progress.status],
    actualValue,
    expectedAtNow: progress.expectedAtNow,
    projectedFinalValue: progress.projectedFinalValue,
    isGoalMet: progress.isGoalMet,
    ...(forecast ? { forecast } : {}),
  };
}

export function buildGoalForecastView(forecast?: GoalForecastResult): GoalForecastView | null {
  if (!forecast) return null;
  return {
    completionProbability: forecast.completionProbability,
    probabilityFormatted: `${(forecast.completionProbability * 100).toFixed(1)}%`,
    p10: forecast.confidenceInterval.p10,
    p50: forecast.confidenceInterval.p50,
    p90: forecast.confidenceInterval.p90,
    projectedCompletionDate: forecast.projectedCompletionDate,
    projectedDaysAheadOrBehind: forecast.projectedDaysAheadOrBehind,
    meanDailyVelocity: forecast.meanDailyVelocity,
    standardDeviation: forecast.standardDeviation,
    velocityUpliftPct: forecast.velocityUpliftPct,
    simulatedRuns: forecast.simulatedRuns,
    trajectorySpline: forecast.trajectorySpline,
    milestones: forecast.milestones,
  };
}
