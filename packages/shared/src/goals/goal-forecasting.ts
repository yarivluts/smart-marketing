import type { GoalDirection, GoalRhythm } from './goal-progress';

export interface DailyObservation {
  date: string; // YYYY-MM-DD
  value: number; // Raw or daily incremental metric value
}

export interface GoalForecastInput {
  direction: GoalDirection;
  targetValue?: number;
  rangeMin?: number;
  rangeMax?: number;
  actualValue: number;
  startDate: string;
  deadline: string;
  asOfDate: string;
  rhythm: GoalRhythm;
  /** Historical daily observations from warehouse time series */
  observations?: readonly DailyObservation[];
  /** Number of Monte Carlo simulation iterations (default: 1000) */
  iterations?: number;
  /** Optional deterministic PRNG seed for reproducible simulations/tests */
  seed?: number;
}

export interface GoalForecastMilestone {
  percentage: number;
  targetValue: number;
  status: 'achieved' | 'in_flight' | 'upcoming';
  label: string;
  projectedDate?: string;
}

export interface GoalTrajectoryPoint {
  date: string;
  elapsedFraction: number;
  actual: number | null;
  expected: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface GoalForecastResult {
  completionProbability: number; // 0..1 (e.g. 0.84 = 84%)
  confidenceInterval: {
    p10: number;
    p50: number;
    p90: number;
  };
  projectedCompletionDate: string | null;
  projectedDaysAheadOrBehind: number;
  meanDailyVelocity: number;
  standardDeviation: number;
  velocityUpliftPct: number;
  trajectorySpline: GoalTrajectoryPoint[];
  milestones: GoalForecastMilestone[];
  simulatedRuns: number;
}

const MS_PER_DAY = 86_400_000;
const WEEKEND_WEIGHT = 0.4;

function parseDateOnlyUtc(value: string): number {
  return Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
  );
}

function formatDateUtc(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDayWeight(dayMs: number, rhythm: GoalRhythm): number {
  if (rhythm === 'even') return 1;
  const dow = new Date(dayMs).getUTCDay();
  return dow === 0 || dow === 6 ? WEEKEND_WEIGHT : 1;
}

/** Simple, fast Mulberry32 PRNG for deterministic simulation if seed is supplied */
function createPrng(seed: number) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard Normal (Gaussian) variate generator via Box-Muller transform */
function createNormalGenerator(prng: () => number) {
  let spare: number | null = null;
  return function (): number {
    if (spare !== null) {
      const val = spare;
      spare = null;
      return val;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = prng();
    while (v === 0) v = prng();
    const mag = Math.sqrt(-2.0 * Math.log(u));
    const z0 = mag * Math.cos(2.0 * Math.PI * v);
    const z1 = mag * Math.sin(2.0 * Math.PI * v);
    spare = z1;
    return z0;
  };
}

/**
 * Calculates Monte Carlo predictive completion forecasting and pacing regression
 * for project goals (KAN-308).
 *
 * Simulates future trajectories based on observed daily velocity distributions,
 * accounting for calendar rhythm weighting (work week vs weekend) and calculating
 * attainment probability, confidence corridor percentiles (P10, P50, P90),
 * projected completion dates, and milestone attainment ledger checkpoints.
 */
export function calculateGoalForecast(input: GoalForecastInput): GoalForecastResult {
  const {
    direction,
    actualValue,
    startDate,
    deadline,
    asOfDate,
    rhythm,
    observations = [],
    iterations = 1000,
    seed = 42,
  } = input;

  const startMs = parseDateOnlyUtc(startDate);
  const deadlineMs = parseDateOnlyUtc(deadline);
  const asOfMs = Math.min(deadlineMs, Math.max(startMs, parseDateOnlyUtc(asOfDate)));

  const totalDurationDays = Math.max(1, Math.round((deadlineMs - startMs) / MS_PER_DAY));
  const elapsedDays = Math.max(0, Math.round((asOfMs - startMs) / MS_PER_DAY));
  const remainingDays = Math.max(0, Math.round((deadlineMs - asOfMs) / MS_PER_DAY));

  const targetValue = input.targetValue ?? (direction === 'range' ? (input.rangeMax ?? 0) : 0);
  const rangeMin = input.rangeMin ?? 0;
  const rangeMax = input.rangeMax ?? targetValue;

  // Extract daily velocity samples
  const dailyValues: number[] = [];
  for (const obs of observations) {
    if (Number.isFinite(obs.value)) {
      dailyValues.push(obs.value);
    }
  }

  // Calculate velocity statistics
  let meanDailyVelocity: number;
  let standardDeviation: number;
  let velocityUpliftPct = 0;

  if (dailyValues.length >= 2) {
    const sum = dailyValues.reduce((a, b) => a + b, 0);
    meanDailyVelocity = sum / dailyValues.length;

    const variance =
      dailyValues.reduce((acc, val) => acc + Math.pow(val - meanDailyVelocity, 2), 0) /
      (dailyValues.length - 1);
    standardDeviation = Math.sqrt(variance);

    // Compute recent velocity uplift (last 30% of days or min 3 vs baseline)
    const recentWindowSize = Math.max(2, Math.min(7, Math.floor(dailyValues.length * 0.35)));
    const recentValues = dailyValues.slice(-recentWindowSize);
    const recentMean = recentValues.reduce((a, b) => a + b, 0) / recentWindowSize;

    if (meanDailyVelocity > 0) {
      velocityUpliftPct = Math.round(((recentMean - meanDailyVelocity) / meanDailyVelocity) * 1000) / 10;
    }
  } else if (elapsedDays > 0 && actualValue > 0) {
    meanDailyVelocity = actualValue / elapsedDays;
    standardDeviation = meanDailyVelocity * 0.25; // 25% empirical dispersion default
  } else {
    // Before start or zero actuals: default to target pace
    meanDailyVelocity = totalDurationDays > 0 ? targetValue / totalDurationDays : 0;
    standardDeviation = meanDailyVelocity * 0.3;
  }

  // Ensure minimum positive standard deviation
  standardDeviation = Math.max(standardDeviation, Math.abs(meanDailyVelocity) * 0.05, 0.01);

  // Setup PRNG and Normal Generator
  const prng = createPrng(seed);
  const randomNormal = createNormalGenerator(prng);

  // Run Monte Carlo simulation paths
  const finalValues: number[] = [];
  const daysToAttainment: number[] = [];
  let successfulRuns = 0;

  // Pre-calculate future day weights
  const futureDayWeights: number[] = [];
  for (let d = 1; d <= remainingDays; d++) {
    const dayMs = asOfMs + d * MS_PER_DAY;
    futureDayWeights.push(getDayWeight(dayMs, rhythm));
  }

  for (let run = 0; run < iterations; run++) {
    let currentVal = actualValue;
    let attainedAtDay: number | null = null;

    // Check if goal is already met at asOfDate
    const isInitiallyMet =
      direction === 'maximize'
        ? currentVal >= targetValue
        : direction === 'minimize'
          ? currentVal <= targetValue
          : currentVal >= rangeMin && currentVal <= rangeMax;

    if (isInitiallyMet) {
      attainedAtDay = 0;
    }

    for (let dayIndex = 0; dayIndex < remainingDays; dayIndex++) {
      const weight = futureDayWeights[dayIndex];
      const z = randomNormal();
      // Scale daily drift by rhythm weight and diffusion by sqrt(weight)
      const dailyDelta = meanDailyVelocity * weight + z * standardDeviation * Math.sqrt(weight);

      currentVal += dailyDelta;
      if (direction === 'maximize' && currentVal < 0) {
        currentVal = 0; // Natural floor for cumulative maximize metrics
      }

      if (attainedAtDay === null) {
        const isMet =
          direction === 'maximize'
            ? currentVal >= targetValue
            : direction === 'minimize'
              ? currentVal <= targetValue
              : currentVal >= rangeMin && currentVal <= rangeMax;

        if (isMet) {
          attainedAtDay = dayIndex + 1;
        }
      }
    }

    finalValues.push(currentVal);

    const meetsGoalAtDeadline =
      direction === 'maximize'
        ? currentVal >= targetValue
        : direction === 'minimize'
          ? currentVal <= targetValue
          : currentVal >= rangeMin && currentVal <= rangeMax;

    if (meetsGoalAtDeadline || attainedAtDay !== null) {
      successfulRuns++;
      if (attainedAtDay !== null) {
        daysToAttainment.push(attainedAtDay);
      } else {
        daysToAttainment.push(remainingDays);
      }
    }
  }

  // Calculate percentiles
  finalValues.sort((a, b) => a - b);
  const p10Index = Math.floor(iterations * 0.1);
  const p50Index = Math.floor(iterations * 0.5);
  const p90Index = Math.floor(iterations * 0.9);

  const p10 = Math.round(finalValues[p10Index] * 100) / 100;
  const p50 = Math.round(finalValues[p50Index] * 100) / 100;
  const p90 = Math.round(finalValues[p90Index] * 100) / 100;

  const completionProbability = Math.round((successfulRuns / iterations) * 1000) / 1000;

  // Determine projected completion date
  let projectedCompletionDate: string | null = null;
  let projectedDaysAheadOrBehind = 0;

  if (daysToAttainment.length > iterations * 0.4) {
    daysToAttainment.sort((a, b) => a - b);
    const medianAttainmentDay = daysToAttainment[Math.floor(daysToAttainment.length * 0.5)];
    const projectedMs = asOfMs + medianAttainmentDay * MS_PER_DAY;
    projectedCompletionDate = formatDateUtc(projectedMs);
    projectedDaysAheadOrBehind = Math.round((deadlineMs - projectedMs) / MS_PER_DAY);
  } else if (remainingDays === 0) {
    projectedCompletionDate = deadline;
    projectedDaysAheadOrBehind = 0;
  }

  // Generate Trajectory Spline Points (6-8 checkpoints for UI curve and corridor polygon)
  const trajectorySpline: GoalTrajectoryPoint[] = [];
  const numCheckpoints = 7;
  for (let i = 0; i <= numCheckpoints; i++) {
    const fraction = i / numCheckpoints;
    const pointMs = startMs + Math.round(fraction * (deadlineMs - startMs));
    const pointDate = formatDateUtc(pointMs);

    const isHistorical = pointMs <= asOfMs;
    const expected = Math.round(targetValue * fraction * 100) / 100;

    let p10Val: number;
    let p50Val: number;
    let p90Val: number;

    if (isHistorical) {
      // Prior to or at asOfDate: anchor to linear accumulation up to actualValue
      const historicalFraction = asOfMs > startMs ? (pointMs - startMs) / (asOfMs - startMs) : 0;
      const interpActual = Math.round(actualValue * historicalFraction * 100) / 100;
      p10Val = interpActual;
      p50Val = interpActual;
      p90Val = interpActual;
    } else {
      // Future corridor expanding from actualValue to final simulated percentiles
      const futureFraction = remainingDays > 0 ? (pointMs - asOfMs) / (deadlineMs - asOfMs) : 1;
      p10Val = Math.round((actualValue + (p10 - actualValue) * futureFraction) * 100) / 100;
      p50Val = Math.round((actualValue + (p50 - actualValue) * futureFraction) * 100) / 100;
      p90Val = Math.round((actualValue + (p90 - actualValue) * futureFraction) * 100) / 100;
    }

    trajectorySpline.push({
      date: pointDate,
      elapsedFraction: fraction,
      actual: isHistorical ? p50Val : null,
      expected,
      p10: p10Val,
      p50: p50Val,
      p90: p90Val,
    });
  }

  // Generate 4 Milestone Breakdowns (25%, 50%, 75%, 100%)
  const milestonePercentages = [25, 50, 75, 100];
  const milestoneLabels = ['Seed Velocity', 'Mid-Quarter Breakeven', 'Accelerated Corridor', 'Full Target Achieved'];
  const milestones: GoalForecastMilestone[] = milestonePercentages.map((pct, idx) => {
    const mTarget = Math.round((targetValue * (pct / 100)) * 100) / 100;
    let status: 'achieved' | 'in_flight' | 'upcoming';

    if (actualValue >= mTarget) {
      status = 'achieved';
    } else if (
      idx === 0 ||
      actualValue >= Math.round((targetValue * (milestonePercentages[idx - 1] / 100)) * 100) / 100
    ) {
      status = 'in_flight';
    } else {
      status = 'upcoming';
    }

    // Estimate projected milestone date
    let mProjectedDate: string | undefined;
    if (meanDailyVelocity > 0 && mTarget > actualValue) {
      const daysNeeded = Math.ceil((mTarget - actualValue) / meanDailyVelocity);
      const estMs = asOfMs + daysNeeded * MS_PER_DAY;
      mProjectedDate = formatDateUtc(estMs);
    } else if (actualValue >= mTarget) {
      mProjectedDate = undefined;
    }

    return {
      percentage: pct,
      targetValue: mTarget,
      status,
      label: milestoneLabels[idx],
      ...(mProjectedDate ? { projectedDate: mProjectedDate } : {}),
    };
  });

  return {
    completionProbability,
    confidenceInterval: { p10, p50, p90 },
    projectedCompletionDate,
    projectedDaysAheadOrBehind,
    meanDailyVelocity: Math.round(meanDailyVelocity * 100) / 100,
    standardDeviation: Math.round(standardDeviation * 100) / 100,
    velocityUpliftPct,
    trajectorySpline,
    milestones,
    simulatedRuns: iterations,
  };
}
