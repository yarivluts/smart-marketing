import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { CohortRetentionHeatmap } from './cohort-retention-heatmap';
import { PaybackVelocityCard } from './payback-velocity-card';
import { IntentQualityCalibration } from './intent-quality-calibration';
import { GoalsDashboard } from './goals-dashboard';

describe('Cohort Retention & Goals Dashboard Components (Milestone 3)', () => {
  it('renders Cohort Retention Heatmap with color-coded retention cells', () => {
    renderWithIntl(<CohortRetentionHeatmap />);

    expect(screen.getByTestId('cohort-matrix')).toBeInTheDocument();
    expect(screen.getByText('2026-05')).toBeInTheDocument();
    expect(screen.getByText('2026-06')).toBeInTheDocument();
    expect(screen.getByText('2026-07')).toBeInTheDocument();
    expect(screen.getByText('68%')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('handles period cell click for detailed drilldown', () => {
    renderWithIntl(<CohortRetentionHeatmap />);

    const cell = screen.getByTestId('cohort-cell-2026-05-m1');
    fireEvent.click(cell);

    expect(screen.getByTestId('cohort-cell-drilldown')).toBeInTheDocument();
    expect(screen.getByText(/May 2026 ֲ· Month 1 Retention/)).toBeInTheDocument();
    expect(screen.getByText(/82/)).toBeInTheDocument();
  });

  it('renders Customer Payback Velocity Card with window bars', () => {
    renderWithIntl(<PaybackVelocityCard />);

    expect(screen.getByTestId('payback-velocity-card')).toBeInTheDocument();
    expect(screen.getByText('Day 7 Window')).toBeInTheDocument();
    expect(screen.getByText('Day 40 Window')).toBeInTheDocument();
    expect(screen.getByText('$12,400')).toBeInTheDocument();
  });

  it('renders Intent Quality Calibration table with tier breakdown', () => {
    renderWithIntl(<IntentQualityCalibration />);

    expect(screen.getByTestId('quality-calibration-card')).toBeInTheDocument();
    expect(screen.getByText('Diamond (Tier 1)')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('$1,420')).toBeInTheDocument();
  });

  it('filters goals by search input in GoalsDashboard', () => {
    renderWithIntl(<GoalsDashboard />);

    expect(screen.getByTestId('goals-dashboard')).toBeInTheDocument();
    expect(screen.getByText('Q3 Enterprise Signups')).toBeInTheDocument();
    expect(screen.getByText('Blended Paid CAC Ceiling')).toBeInTheDocument();

    const searchInput = screen.getByTestId('search-goals-input');
    fireEvent.change(searchInput, { target: { value: 'CAC' } });

    expect(screen.queryByText('Q3 Enterprise Signups')).not.toBeInTheDocument();
    expect(screen.getByText('Blended Paid CAC Ceiling')).toBeInTheDocument();
  });

  it('opens and creates a goal from CreateGoalModal', () => {
    renderWithIntl(<GoalsDashboard />);

    const createBtn = screen.getByTestId('create-new-goal-btn');
    fireEvent.click(createBtn);

    expect(screen.getByTestId('create-goal-modal')).toBeInTheDocument();

    // Click MRR preset
    fireEvent.click(screen.getByTestId('preset-mrr-btn'));
    expect(screen.getByTestId('goal-name-input')).toHaveValue('Q3 MRR Scale Target');

    // Submit
    fireEvent.click(screen.getByTestId('submit-create-goal-btn'));
    expect(screen.queryByTestId('create-goal-modal')).not.toBeInTheDocument();
  });
});
