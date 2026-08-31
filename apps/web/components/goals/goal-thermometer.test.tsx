import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { GoalThermometer } from './goal-thermometer';
import { GoalThermometerCard } from './goal-thermometer-card';
import { calculateGoalProgress } from './goal-progress-calc';
import type { GoalItem } from './goal-types';

describe('Goal Thermometer Components (Milestone 3)', () => {
  const mockGoal: GoalItem = {
    id: 'goal-test-1',
    name: 'Q3 Enterprise Scale',
    metricKey: 'signups',
    metricLabel: 'Enterprise Signups',
    direction: 'maximize',
    targetValue: 500,
    actualValue: 320,
    startDate: '2026-07-01',
    deadline: '2026-09-30',
    ownerName: 'Sarah Connor',
  };

  it('calculates progress pace and projected final values correctly', () => {
    // 320 actual / 500 target at 60% elapsed
    const progress = calculateGoalProgress({
      direction: 'maximize',
      targetValue: 500,
      actualValue: 320,
      elapsedFraction: 0.6,
    });

    expect(progress.status).toBe('on_track');
    expect(progress.expectedAtNow).toBe(300);
    expect(progress.projectedFinalValue).toBe(533);
    expect(progress.percentFilled).toBe(64);
  });

  it('handles minimize direction goals (e.g. CAC Ceiling) accurately', () => {
    const goodCac = calculateGoalProgress({
      direction: 'minimize',
      targetValue: 50,
      actualValue: 40,
      elapsedFraction: 0.5,
    });
    expect(goodCac.status).toBe('on_track');
    expect(goodCac.isGoalMet).toBe(true);

    const badCac = calculateGoalProgress({
      direction: 'minimize',
      targetValue: 50,
      actualValue: 70,
      elapsedFraction: 0.5,
    });
    expect(badCac.status).toBe('off_track');
    expect(badCac.isGoalMet).toBe(false);
  });

  it('renders GoalThermometer with status badge and fill width', () => {
    renderWithIntl(<GoalThermometer goal={mockGoal} />);

    expect(screen.getByTestId('goal-thermometer')).toBeInTheDocument();
    expect(screen.getByTestId('goal-pace-badge')).toHaveTextContent('On track');
    expect(screen.getByTestId('goal-thermometer-fill')).toHaveStyle({ width: '64%' });
    expect(screen.getByTestId('goal-projection')).toHaveTextContent('Projected at deadline: 533');
  });

  it('renders GoalThermometerCard with deadline, owner, projection and handles inline editing', () => {
    const handleTargetUpdate = vi.fn();
    const handleOptimize = vi.fn();

    renderWithIntl(
      <GoalThermometerCard
        goal={mockGoal}
        canExecute={true}
        onTargetUpdated={handleTargetUpdate}
        onOptimizeRequested={handleOptimize}
      />,
    );

    expect(screen.getByTestId('goal-card-goal-test-1')).toBeInTheDocument();
    expect(screen.getByText('Q3 Enterprise Scale')).toBeInTheDocument();
    expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    expect(screen.getByTestId('goal-projection-goal-test-1')).toHaveTextContent('533 (64%)');

    // Click edit target trigger
    const editBtn = screen.getByTestId('edit-target-trigger-goal-test-1');
    fireEvent.click(editBtn);

    const input = screen.getByTestId('edit-target-input-goal-test-1');
    expect(input).toHaveValue(500);

    fireEvent.change(input, { target: { value: '600' } });
    fireEvent.click(screen.getByTestId('save-target-btn-goal-test-1'));

    expect(handleTargetUpdate).toHaveBeenCalledWith('goal-test-1', 600);
  });
});
