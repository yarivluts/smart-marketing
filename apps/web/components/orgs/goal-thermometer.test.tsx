import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { GoalThermometer } from './goal-thermometer';
import type { GoalThermometerView } from '@/lib/orgs/goal-view';
import messages from '../../messages/en.json';

function renderThermometer(view: GoalThermometerView) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GoalThermometer view={view} />
    </NextIntlClientProvider>,
  );
}

describe('GoalThermometer', () => {
  it('renders an on_track goal with a green badge and the bar filled to percentFilled', () => {
    renderThermometer({
      kind: 'ok',
      percentFilled: 60,
      status: 'on_track',
      statusColor: 'green',
      actualValue: 60,
      expectedAtNow: 50,
      projectedFinalValue: 120,
      isGoalMet: false,
    });
    expect(screen.getByText('On track')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
  });

  it('renders an off_track minimize goal (signup cost over ceiling) with a red badge — the AC’s own red case', () => {
    renderThermometer({
      kind: 'ok',
      percentFilled: 100,
      status: 'off_track',
      statusColor: 'red',
      actualValue: 65,
      expectedAtNow: 50,
      projectedFinalValue: 65,
      isGoalMet: false,
    });
    expect(screen.getByText('Off track')).toBeInTheDocument();
  });

  it('renders an at_risk goal with an amber badge', () => {
    renderThermometer({
      kind: 'ok',
      percentFilled: 92,
      status: 'at_risk',
      statusColor: 'amber',
      actualValue: 46,
      expectedAtNow: 50,
      projectedFinalValue: 92,
      isGoalMet: false,
    });
    expect(screen.getByText('At risk')).toBeInTheDocument();
  });

  it('renders each degraded outcome kind with its own translated message', () => {
    renderThermometer({ kind: 'warehouse_not_configured' });
    expect(screen.getByText('Warehouse not configured yet')).toBeInTheDocument();
  });

  it('renders a quota_exceeded degraded outcome with its message', () => {
    renderThermometer({ kind: 'quota_exceeded', message: 'Daily query quota exceeded' });
    expect(screen.getByText('Daily query quota exceeded')).toBeInTheDocument();
  });

  it('renders a query_error degraded outcome with its message', () => {
    renderThermometer({ kind: 'query_error', message: 'boom' });
    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});
