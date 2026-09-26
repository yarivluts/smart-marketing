import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { GoalThermometerCard } from './goal-thermometer-card';
import { CreateGoalModal } from './create-goal-modal';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import enMessages from '../../messages/en.json';
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
  isPaused: false,
  progressKind: 'ok',
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
  /* KAN-213: a paused goal shows "Paused" - never a pace badge or a Copilot callout. */
  it('marks a paused goal as paused, with no pace status or optimization callout', () => {
    renderWithIntl(<GoalThermometerCard orgId="org-1" projectId="p-1" goal={{ ...mockAtRiskGoal, id: 'goal-paused', isPaused: true }} onOptimizeRequested={() => undefined} />);
    expect(screen.getByTestId('goal-paused-goal-paused')).toHaveTextContent('Paused');
    expect(screen.queryByTestId('goal-status-goal-paused')).not.toBeInTheDocument();
    expect(screen.queryByTestId('goal-rec-card-goal-paused')).not.toBeInTheDocument();
  });

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

describe('GoalThermometerCard with unmeasured progress', () => {
  /*
    A goal whose metric has no rows, or whose query failed, used to render an actual of 0 with a
    pace judged against it - usually "Off track" in red - plus an AI Copilot "boost budget"
    callout. None of that was measured.
  */
  const unmeasured: UnifiedGoalItem = {
    ...mockGoal,
    id: 'goal-unmeasured',
    progressKind: 'no_measurements',
    actualValue: null,
    expectedAtNow: null,
    projectedFinalValue: null,
    percentFilled: null,
    status: null,
    statusColor: null,
    isGoalMet: null,
  };

  it('shows the reason and the real target, with no status, bar, projection or Copilot callout', () => {
    renderWithIntl(
      <GoalThermometerCard orgId="org-1" projectId="p-1" goal={unmeasured} onOptimizeRequested={vi.fn()} />,
    );

    expect(screen.getByTestId('goal-progress-unavailable-goal-unmeasured')).toHaveTextContent(
      enMessages.Goals.thermometerUnavailableReason.no_measurements,
    );
    expect(screen.getByTestId('goal-card-goal-unmeasured')).toHaveTextContent('$100,000');
    expect(screen.queryByTestId('goal-status-goal-unmeasured')).not.toBeInTheDocument();
    expect(screen.queryByTestId('goal-bar-goal-unmeasured')).not.toBeInTheDocument();
    expect(screen.queryByTestId('goal-projection-goal-unmeasured')).not.toBeInTheDocument();
    expect(screen.queryByTestId('goal-rec-card-goal-unmeasured')).not.toBeInTheDocument();
    expect(screen.queryByText('Demo Data')).not.toBeInTheDocument();
  });

  it('does not show a new target when saving it failed', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const handleTargetUpdated = vi.fn();
    renderWithIntl(
      <GoalThermometerCard orgId="org-1" projectId="p-1" goal={mockGoal} onTargetUpdated={handleTargetUpdated} />,
    );

    fireEvent.click(screen.getByTestId('adjust-target-btn-goal-1'));
    fireEvent.change(screen.getByTestId('input-target-goal-1'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('save-target-btn-goal-1'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(enMessages.Goals.targetUpdateError);
    });
    expect(handleTargetUpdated).not.toHaveBeenCalled();
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

  it('shows an error - and invents no goal - when the create request fails', async () => {
    // A failed create used to add a locally invented goal ("on track", 60 days left) instead.
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const handleCreated = vi.fn();
    const handleClose = vi.fn();

    renderWithIntl(
      <CreateGoalModal orgId="org-1" projectId="p-1" isOpen={true} onClose={handleClose} onGoalCreated={handleCreated} />,
    );

    fireEvent.click(screen.getByTestId('preset-leads-btn'));
    fireEvent.click(screen.getByTestId('modal-submit-btn'));

    await waitFor(() => {
      expect(screen.getByText(enMessages.Goals.createError)).toBeInTheDocument();
    });
    expect(handleCreated).not.toHaveBeenCalled();
    expect(handleClose).not.toHaveBeenCalled();
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
    // The created goal has not been measured yet, so it carries no progress figures.
    expect(handleCreated.mock.calls[0][0]).toMatchObject({
      id: 'goal-1',
      progressKind: 'pending',
      actualValue: null,
      percentFilled: null,
      status: null,
    });
  });
});
