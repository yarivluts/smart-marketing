import type { GoalModel, GoalProgressOutcome } from '@growthos/firebase-orm-models';
import type { GoalPaceStatus } from '@growthos/shared';

/** A goal's own list-page card — never sends the full `@arbel/firebase-orm` model instance to a client component. */
export interface GoalSummaryView {
  id: string;
  name: string;
  metricName: string;
  direction: GoalModel['direction'];
  deadline: string;
  ownerPersonId: string;
}

export function toGoalSummaryView(goal: GoalModel): GoalSummaryView {
  return {
    id: goal.id,
    name: goal.name,
    metricName: goal.metric_name,
    direction: goal.direction,
    deadline: goal.deadline,
    ownerPersonId: goal.owner_person_id,
  };
}

/** Mirrors `BoardTileUnavailableReason` (`board-view.ts`) — `queryGoalProgress`'s own degraded-outcome reason union. */
export type GoalProgressUnavailableReason = 'warehouse_not_configured' | 'quota_exceeded' | 'query_error';

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
    }
  | { kind: 'warehouse_not_configured' }
  | { kind: 'quota_exceeded'; message: string }
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
  };
}
