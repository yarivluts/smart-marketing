import { describe, expect, it } from 'vitest';
import { calculateGoalForecast, type GoalForecastInput } from './goal-forecasting';

describe('calculateGoalForecast', () => {
  it('computes completion probability and confidence intervals for an on-track maximize goal', () => {
    // 60-day goal, 30 days elapsed, target = 100k, actual = 60k (ahead of expected 50k)
    const observations = Array.from({ length: 30 }, (_, i) => ({
      date: `2025-10-${String(i + 1).padStart(2, '0')}`,
      value: 2000 + (i % 5) * 50, // Mean ~2100/day
    }));

    const input: GoalForecastInput = {
      direction: 'maximize',
      targetValue: 100000,
      actualValue: 60000,
      startDate: '2025-10-01',
      deadline: '2025-11-30',
      asOfDate: '2025-10-31',
      rhythm: 'even',
      observations,
      iterations: 1000,
      seed: 42,
    };

    const result = calculateGoalForecast(input);

    expect(result.completionProbability).toBeGreaterThan(0.9);
    expect(result.confidenceInterval.p10).toBeGreaterThan(50000);
    expect(result.confidenceInterval.p50).toBeGreaterThan(100000);
    expect(result.confidenceInterval.p90).toBeGreaterThan(result.confidenceInterval.p50);
    expect(result.projectedCompletionDate).toBeTruthy();
    expect(result.projectedDaysAheadOrBehind).toBeGreaterThan(0);
    expect(result.trajectorySpline.length).toBe(8);
    expect(result.milestones.length).toBe(4);
    expect(result.milestones[0].status).toBe('achieved'); // 25% = 25k (met with 60k)
    expect(result.milestones[1].status).toBe('achieved'); // 50% = 50k (met with 60k)
    expect(result.milestones[2].status).toBe('in_flight'); // 75% = 75k (in-flight)
    expect(result.milestones[3].status).toBe('upcoming'); // 100% = 100k
  });

  it('computes low completion probability for a severely lagging goal', () => {
    // 60-day goal, 40 days elapsed, target = 100k, actual = 20k (target pace was ~1666/day, actual was 500/day)
    const observations = Array.from({ length: 40 }, (_, i) => ({
      date: `2025-10-${String(i + 1).padStart(2, '0')}`,
      value: 500,
    }));

    const input: GoalForecastInput = {
      direction: 'maximize',
      targetValue: 100000,
      actualValue: 20000,
      startDate: '2025-10-01',
      deadline: '2025-11-30',
      asOfDate: '2025-11-09',
      rhythm: 'even',
      observations,
      iterations: 1000,
      seed: 42,
    };

    const result = calculateGoalForecast(input);

    expect(result.completionProbability).toBeLessThan(0.1);
    expect(result.confidenceInterval.p90).toBeLessThan(100000);
    expect(result.milestones[0].status).toBe('in_flight'); // 25k target > 20k actual
  });

  it('handles work_week_weekend rhythm weighting correctly', () => {
    const input: GoalForecastInput = {
      direction: 'maximize',
      targetValue: 50000,
      actualValue: 25000,
      startDate: '2025-10-01',
      deadline: '2025-10-31',
      asOfDate: '2025-10-15',
      rhythm: 'work_week_weekend',
      observations: [
        { date: '2025-10-01', value: 1600 },
        { date: '2025-10-02', value: 1700 },
        { date: '2025-10-03', value: 1650 },
      ],
      iterations: 500,
      seed: 123,
    };

    const result = calculateGoalForecast(input);
    expect(result.simulatedRuns).toBe(500);
    expect(result.confidenceInterval.p50).toBeGreaterThan(40000);
  });

  it('handles empty observations gracefully by inferring from actualValue and duration', () => {
    const input: GoalForecastInput = {
      direction: 'maximize',
      targetValue: 10000,
      actualValue: 4000,
      startDate: '2025-10-01',
      deadline: '2025-10-20',
      asOfDate: '2025-10-08', // 7 elapsed days
      rhythm: 'even',
      observations: [],
      iterations: 500,
      seed: 99,
    };

    const result = calculateGoalForecast(input);
    expect(result.meanDailyVelocity).toBeGreaterThan(0);
    expect(result.trajectorySpline.length).toBe(8);
  });

  it('handles goals that are already completed', () => {
    const input: GoalForecastInput = {
      direction: 'maximize',
      targetValue: 50000,
      actualValue: 55000,
      startDate: '2025-10-01',
      deadline: '2025-10-31',
      asOfDate: '2025-10-20',
      rhythm: 'even',
      iterations: 200,
      seed: 1,
    };

    const result = calculateGoalForecast(input);
    expect(result.completionProbability).toBe(1);
    expect(result.milestones.every((m) => m.status === 'achieved')).toBe(true);
  });
});
