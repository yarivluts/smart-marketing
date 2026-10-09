import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { GoalMonteCarloCard } from './goal-monte-carlo-card';
import type { GoalForecastView } from '@/lib/orgs/goal-view';
import messages from '../../messages/en.json';

const mockForecast: GoalForecastView = {
  completionProbability: 0.842,
  probabilityFormatted: '84.2%',
  p10: 82000,
  p50: 104500,
  p90: 128000,
  projectedCompletionDate: '2025-12-19',
  projectedDaysAheadOrBehind: 12,
  meanDailyVelocity: 1420,
  standardDeviation: 310,
  velocityUpliftPct: 12.4,
  simulatedRuns: 1000,
  trajectorySpline: [
    { date: '2025-10-01', elapsedFraction: 0, actual: 0, expected: 0, p10: 0, p50: 0, p90: 0 },
    { date: '2025-10-15', elapsedFraction: 0.25, actual: 30000, expected: 25000, p10: 30000, p50: 30000, p90: 30000 },
    { date: '2025-11-01', elapsedFraction: 0.5, actual: 60000, expected: 50000, p10: 60000, p50: 60000, p90: 60000 },
    { date: '2025-11-19', elapsedFraction: 0.65, actual: 84200, expected: 65000, p10: 84200, p50: 84200, p90: 84200 },
    { date: '2025-12-05', elapsedFraction: 0.85, actual: null, expected: 85000, p10: 95000, p50: 101000, p90: 112000 },
    { date: '2025-12-31', elapsedFraction: 1, actual: null, expected: 100000, p10: 82000, p50: 104500, p90: 128000 },
  ],
  milestones: [
    { percentage: 25, targetValue: 25000, status: 'achieved', label: 'Seed Velocity' },
    { percentage: 50, targetValue: 50000, status: 'achieved', label: 'Mid-Quarter Breakeven' },
    { percentage: 75, targetValue: 75000, status: 'achieved', label: 'Accelerated Corridor' },
    { percentage: 100, targetValue: 100000, status: 'in_flight', label: 'Full Target Achieved', projectedDate: '2025-12-19' },
  ],
};

function renderCard(forecast: GoalForecastView = mockForecast) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GoalMonteCarloCard
        forecast={forecast}
        targetValue={100000}
        direction="maximize"
        metricName="mrr"
        deadline="2025-12-31"
      />
    </NextIntlClientProvider>,
  );
}

describe('GoalMonteCarloCard', () => {
  it('renders Monte Carlo predictive pace title and probability pill', () => {
    renderCard();
    expect(screen.getByText('AI Monte Carlo Predictive Pace & Trajectory')).toBeInTheDocument();
    expect(screen.getByText('84.2% Attainment Probability')).toBeInTheDocument();
  });

  it('renders velocity uplift, projected finish, and confidence interval metrics', () => {
    renderCard();
    expect(screen.getByText('+12.4%')).toBeInTheDocument();
    expect(screen.getByText('2025-12-19')).toBeInTheDocument();
    expect(screen.getByText(/12 days ahead of target deadline/i)).toBeInTheDocument();
    expect(screen.getByText(/P10: 82,000 \/ P90: 128,000/i)).toBeInTheDocument();
  });

  it('renders milestone breakdowns and attainment statuses', () => {
    renderCard();
    expect(screen.getByText('Milestone Sub-Breakdown & Attainment Ledger')).toBeInTheDocument();
    expect(screen.getByText('25% • Seed Velocity')).toBeInTheDocument();
    expect(screen.getByText('50% • Mid-Quarter Breakeven')).toBeInTheDocument();
    expect(screen.getByText('75% • Accelerated Corridor')).toBeInTheDocument();
    expect(screen.getByText('100% • Full Target Achieved')).toBeInTheDocument();
    expect(screen.getAllByText('Achieved').length).toBe(3);
    expect(screen.getByText('In Flight')).toBeInTheDocument();
  });
});
