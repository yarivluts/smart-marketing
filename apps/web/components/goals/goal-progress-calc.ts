import type { GoalDirection, GoalPaceStatus, GoalProgressCalculation } from './goal-types';

export interface CalculateGoalProgressParams {
  direction: GoalDirection;
  targetValue: number;
  actualValue: number;
  elapsedFraction?: number; // 0..1
  rangeMin?: number | null;
  rangeMax?: number | null;
  startDate?: string;
  deadline?: string;
}

export function calculateGoalProgress(params: CalculateGoalProgressParams): GoalProgressCalculation {
  const {
    direction,
    targetValue,
    actualValue,
    elapsedFraction = 0.5,
    rangeMin = null,
    rangeMax = null,
    startDate,
    deadline,
  } = params;

  const safeElapsed = Math.max(0.01, Math.min(1, elapsedFraction));

  if (direction === 'minimize') {
    // Lower is better (e.g. CAC ceiling: target $50, actual $40 is on track, actual $70 is off track)
    const isGoalMet = actualValue <= targetValue;
    const progressRatio = targetValue > 0 ? targetValue / Math.max(1, actualValue) : 1;
    const percentFilled = Math.min(100, Math.max(0, Math.round((targetValue / Math.max(0.1, actualValue)) * 100)));

    let status: GoalPaceStatus = 'on_track';
    if (actualValue > targetValue * 1.2) {
      status = 'off_track';
    } else if (actualValue > targetValue) {
      status = 'at_risk';
    }

    return {
      progressRatio,
      percentFilled,
      status,
      expectedAtNow: targetValue,
      projectedFinalValue: actualValue,
      isGoalMet,
    };
  }

  if (direction === 'range') {
    // Within bounds (e.g. 100 to 200)
    const min = rangeMin ?? targetValue * 0.8;
    const max = rangeMax ?? targetValue * 1.2;
    const isGoalMet = actualValue >= min && actualValue <= max;
    const progressRatio = max > 0 ? actualValue / max : 0;
    const percentFilled = Math.min(100, Math.max(0, Math.round(progressRatio * 100)));

    let status: GoalPaceStatus = 'on_track';
    if (actualValue < min * 0.8 || actualValue > max * 1.2) {
      status = 'off_track';
    } else if (actualValue < min || actualValue > max) {
      status = 'at_risk';
    }

    const projectedFinal = actualValue / safeElapsed;

    return {
      progressRatio,
      percentFilled,
      status,
      expectedAtNow: min * safeElapsed,
      projectedFinalValue: Math.round(projectedFinal),
      isGoalMet,
    };
  }

  // Direction: 'maximize' (higher is better)
  const target = Math.max(1, targetValue);
  const progressRatio = actualValue / target;
  const percentFilled = Math.min(100, Math.max(0, Math.round(progressRatio * 100)));
  const isGoalMet = actualValue >= target;

  const expectedAtNow = target * safeElapsed;
  const projectedFinalValue = Math.round(actualValue / safeElapsed);

  // Pace status based on ratio of actual to expected
  const paceRatio = actualValue / Math.max(1, expectedAtNow);
  let status: GoalPaceStatus = 'on_track';
  if (paceRatio < 0.75) {
    status = 'off_track';
  } else if (paceRatio < 0.95) {
    status = 'at_risk';
  }

  // Calculate projected completion date if dates provided
  let projectedCompletionDate: string | null = null;
  if (startDate && deadline && actualValue > 0) {
    const startMs = new Date(startDate).getTime();
    const deadMs = new Date(deadline).getTime();
    const nowMs = startMs + (deadMs - startMs) * safeElapsed;
    const elapsedDays = Math.max(1, (nowMs - startMs) / (1000 * 60 * 60 * 24));
    const dailyVelocity = actualValue / elapsedDays;
    if (dailyVelocity > 0) {
      const remainingValue = Math.max(0, target - actualValue);
      const remainingDays = remainingValue / dailyVelocity;
      const completionMs = nowMs + remainingDays * (1000 * 60 * 60 * 24);
      projectedCompletionDate = new Date(completionMs).toISOString().split('T')[0];
    }
  }

  return {
    progressRatio,
    percentFilled,
    status,
    expectedAtNow,
    projectedFinalValue,
    projectedCompletionDate,
    isGoalMet,
  };
}

export function getRetentionColorClass(ratePct: number | null): string {
  if (ratePct === null || isNaN(ratePct)) return 'bg-muted/20 text-muted-foreground/60';
  if (ratePct >= 75) return 'bg-emerald-500 text-white font-bold shadow-2xs';
  if (ratePct >= 55) return 'bg-emerald-500/70 text-white font-semibold';
  if (ratePct >= 40) return 'bg-emerald-500/35 text-emerald-950 dark:text-emerald-100 font-medium';
  if (ratePct >= 25) return 'bg-amber-500/30 text-amber-950 dark:text-amber-100 font-medium';
  if (ratePct > 0) return 'bg-rose-500/20 text-rose-950 dark:text-rose-100 font-medium';
  return 'bg-muted/30 text-muted-foreground';
}
