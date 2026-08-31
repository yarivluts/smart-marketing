import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { GoalThermometerCard } from './goal-thermometer-card';
import { CreateGoalModal } from './create-goal-modal';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import type { UnifiedGoalItem } from '../../lib/orgs/funnel-goals-synthesizer';

const mockGoal: UnifiedGoalItem = {
  id: 'goal-1',
  name: 'Q3 Monthly Recurring Revenue (MRR)',
  metricName: 'mrr_usd',
  direction: 'maximize',
  targetValue: 100000,
  rangeMin: null,
  rangeMax: null,
  startDate: '2026-07-01',
  deadline: '2026-09-30',
  rhythm: 'work_week_weekend',
  ownerPersonId: 'person-1',
  ownerName: 'Sarah Jenkins',
  actualValue: 68400,
  expectedAtNow: 60000,
  projectedFinalValue: 114000,
  percentFilled: 68,
  status: 'on_track',
  statusColor: 'green',
  isGoalMet: false,
  elapsedFraction: 0.6,
  daysRemaining: 30,
  isDemo: false,
};

const mockAtRiskGoal: UnifiedGoalItem = {
  ...mockGoal,
  id: 'goal-at-risk',
  name: 'Inbound Lead Volume',
  actualValue: 400,
  expectedAtNow: 800,
  projectedFinalValue: 666,
  percentFilled: 40,
  status: 'at_risk',
  statusColor: 'amber',
};

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ goal: mockGoal }),
  });
});

describe('GoalThermometerCard Component', () => {
  it('renders goal name, status badge, progress bar, and linear statistical projection', () => {
    renderWithIntl(
      <GoalThermometerCard
        orgId="org-1"
        projectId="p-1"
        goal={mockGoal}
      />,
    );

    expect(screen.getByTestId('goal-card-goal-1')).toBeInTheDocument();
    expect(screen.getByText('Q3 Monthly Recurring Revenue (MRR)')).toBeInTheDocument();
    expect(screen.getByTestId('goal-status-goal-1')).toHaveTextContent('On track');
    expect(screen.getByTestId('goal-bar-goal-1')).toHaveStyle({ width: '68%' });
    expect(screen.getByTestId('goal-projection-goal-1')).toHaveTextContent('$114,000');
  });

  it('supports inline target adjustment and calls onTargetUpdated', async () => {
    const handleTargetUpdated = vi.fn();

    renderWithIntl(
      <GoalThermometerCard
        orgId="org-1"
        projectId="p-1"
        goal={mockGoal}
        onTargetUpdated={handleTargetUpdated}
      />,
    );

    // Open target editor
    const adjustBtn = screen.getByTestId('adjust-target-btn-goal-1');
    fireEvent.click(adjustBtn);

    const input = screen.getByTestId('input-target-goal-1');
    fireEvent.change(input, { target: { value: '120000' } });

    const saveBtn = screen.getByTestId('save-target-btn-goal-1');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleTargetUpdated).toHaveBeenCalledWith('goal-1', { targetValue: 120000 });
    });
  });

  it('displays proactive AI Copilot suggestion for at-risk goals and triggers optimize callback', () => {
    const handleOptimize = vi.fn();

    renderWithIntl(
      <GoalThermometerCard
        orgId="org-1"
        projectId="p-1"
        goal={mockAtRiskGoal}
        onOptimizeRequested={handleOptimize}
      />,
    );

    expect(screen.getByTestId('goal-rec-card-goal-at-risk')).toBeInTheDocument();
    const actionBtn = screen.getByTestId('goal-rec-action-btn-goal-at-risk');
    fireEvent.click(actionBtn);

    expect(handleOptimize).toHaveBeenCalledWith(mockAtRiskGoal);
  });
});

describe('CreateGoalModal Component', () => {
  it('applies 1-click presets properly', () => {
    renderWithIntl(
      <CreateGoalModal
        orgId="org-1"
        projectId="p-1"
        isOpen={true}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('create-goal-modal')).toBeInTheDocument();

    // Click MRR preset
    fireEvent.click(screen.getByTestId('preset-mrr-btn'));
    expect(screen.getByTestId('modal-input-name')).toHaveValue('Quarterly MRR Expansion');
    expect(screen.getByTestId('modal-input-metric')).toHaveValue('mrr_usd');
    expect(screen.getByTestId('modal-input-target')).toHaveValue(100000);

    // Click CAC preset
    fireEvent.click(screen.getByTestId('preset-cac-btn'));
    expect(screen.getByTestId('modal-input-name')).toHaveValue('Blended CAC Guardrail');
    expect(screen.getByTestId('modal-input-metric')).toHaveValue('blended_cac_usd');
    expect(screen.getByTestId('modal-input-target')).toHaveValue(45);
  });

  it('submits form and invokes onGoalCreated callback', async () => {
    const handleCreated = vi.fn();
    const handleClose = vi.fn();

    renderWithIntl(
      <CreateGoalModal
        orgId="org-1"
        projectId="p-1"
        isOpen={true}
        onClose={handleClose}
        onGoalCreated={handleCreated}
      />,
    );

    fireEvent.click(screen.getByTestId('preset-leads-btn'));
    fireEvent.click(screen.getByTestId('modal-submit-btn'));

    await waitFor(() => {
      expect(handleCreated).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
