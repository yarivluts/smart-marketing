import { describe, expect, it } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { enteredGoalTargetText, goalTargetEntryIssue, GoalTargetUnitHint, isPercentEntry, storedGoalTarget, useGoalTargetEntryError } from './goal-target-entry';
import messages from '../../messages/en.json';
import heMessages from '../../messages/he.json';

describe('goal target entry (KAN-213)', () => {
  it('types a ratio target as a percent and stores the fraction; every other unit as stored', () => {
    expect(storedGoalTarget(8, 'ratio')).toBe(0.08);
    expect(enteredGoalTargetText(0.08, 'ratio')).toBe('8');
    expect(enteredGoalTargetText(null, 'ratio')).toBe('');
    expect(storedGoalTarget(8, 'percent')).toBe(8);
    expect(storedGoalTarget(1000, undefined)).toBe(1000);
    expect(enteredGoalTargetText(1000, 'currency')).toBe('1000');
  });

  it('marks ratio and percent targets as percent-typed', () => {
    expect(isPercentEntry('ratio')).toBe(true);
    expect(isPercentEntry({ kind: 'percent' })).toBe(true);
    expect(isPercentEntry('count')).toBe(false);
    expect(isPercentEntry(undefined)).toBe(false);
  });

  it('checks the typed value against the unit range in the typed scale', () => {
    expect(goalTargetEntryIssue(8, 'ratio')).toBeNull();
    expect(goalTargetEntryIssue(800, 'ratio')).toEqual({ key: 'targetOutOfRange', min: 0, max: 100 });
    expect(goalTargetEntryIssue(-1, 'count')).toEqual({ key: 'targetBelowMinimum', min: 0 });
    expect(goalTargetEntryIssue(-1, undefined)).toBeNull();
  });

  it('translates the out-of-range message', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale="he" messages={heMessages}>
        {children}
      </NextIntlClientProvider>
    );
    const { result } = renderHook(() => useGoalTargetEntryError(), { wrapper });
    expect(result.current([5, 800], 'ratio')).toBe(heMessages.Goals.targetOutOfRange.replace('{min}', '0').replace('{max}', '100'));
    expect(result.current([5], 'ratio')).toBeNull();
  });

  it('shows the percent hint only for a percent-typed unit', () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <GoalTargetUnitHint unit="ratio" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('In percent: 8 means 8%.')).toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <GoalTargetUnitHint unit="count" />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText('In percent: 8 means 8%.')).not.toBeInTheDocument();
  });
});
