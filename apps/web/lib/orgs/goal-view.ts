import type { GoalModel, GoalProgressOutcome } from '@growthos/firebase-orm-models';
import type { GoalPaceStatus, ParsedMetricUnit } from '@growthos/shared';

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
      /** The goal metric's declared unit (KAN-213), which the figures are shown in. Absent for a plain number. */
      unit?: ParsedMetricUnit;
    }
  /**
   * The metric returned no rows over the goal's window, so there is no pace to report.
   *
   * Distinct from `ok` with a zero value: `actualValue` is a sum, so a metric that has never
   * received a record sums to 0 exactly as one measured at zero does. Pace computed against
   * that 0 renders "off track" in red at 0% - a project that has not started reporting shown
   * exactly like one that is failing, when the two call for opposite responses.
   */
  | { kind: 'no_measurements' }
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
export function buildGoalThermometerView(outcome: GoalProgressOutcome, unit?: ParsedMetricUnit): GoalThermometerView {
  if (!outcome.ok) {
    if (outcome.reason === 'warehouse_not_configured') {
      return { kind: 'warehouse_not_configured' };
    }
    return { kind: outcome.reason, message: outcome.message };
  }

  if (!outcome.hasMeasurements) {
    return { kind: 'no_measurements' };
  }

  const { progress, actualValue } = outcome;
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
    ...(unit && unit.kind !== 'number' ? { unit } : {}),
  };
}
