import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MarketingGoalsDashboard, type SerializedGoal } from './marketing-goals-dashboard';
import messages from '../../../messages/en.json';

const mockGoals: SerializedGoal[] = [
  {
    id: 'goal-roas',
    name: 'Blended Cross-Channel ROAS',
    metricName: 'blended_roas',
    direction: 'at_least',
    targetValue: 4.0,
    currentValue: 3.2,
    progressPct: 80,
    pacingNote: 'Tracking +14% above projected milestone',
    status: 'on_track',
    startDate: '2026-08-01',
    deadline: '2026-08-31',
    rhythm: 'monthly',
  },
  {
    id: 'goal-revenue',
    name: 'Monthly Attributed Revenue',
    metricName: 'attributed_revenue',
    direction: 'at_least',
    targetValue: 120000,
    currentValue: 98400,
    progressPct: 82,
    pacingNote: 'Projected to meet 100% target by month end',
    status: 'on_track',
    startDate: '2026-08-01',
    deadline: '2026-08-31',
    rhythm: 'monthly',
  },
];

describe('MarketingGoalsDashboard', () => {
  it('renders empty state when no goals exist', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingGoalsDashboard projectName="EasySign Growth" goals={[]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Goal tracking for EasySign Growth' })).toBeInTheDocument();
  });

  it('renders marketing goals dynamically from database', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingGoalsDashboard projectName="EasySign Growth" goals={mockGoals} />
      </NextIntlClientProvider>,
    );

    // Header and title
    expect(screen.getByRole('heading', { name: 'Marketing Targets & Pacing (EasySign Growth)' })).toBeInTheDocument();

    // Goals from database
    expect(screen.getByText('Blended Cross-Channel ROAS')).toBeInTheDocument();
    expect(screen.getByText('Monthly Attributed Revenue')).toBeInTheDocument();
    expect(screen.getByText('4.00x')).toBeInTheDocument();
    expect(screen.getByText('3.20x')).toBeInTheDocument();
  });

  it('allows switching between 1-click strategy presets', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingGoalsDashboard projectName="EasySign Growth" goals={mockGoals} />
      </NextIntlClientProvider>,
    );

    // Switch to Aggressive Scale preset
    const scaleBtn = screen.getByRole('button', { name: /Aggressive Scaling/i });
    fireEvent.click(scaleBtn);
    expect(scaleBtn).toHaveClass('bg-primary');

    // Switch to Market Penetration preset
    const leadGenBtn = screen.getByRole('button', { name: /Market Penetration/i });
    fireEvent.click(leadGenBtn);
    expect(leadGenBtn).toHaveClass('bg-primary');
  });
});

