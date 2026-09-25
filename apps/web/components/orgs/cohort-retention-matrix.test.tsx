import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import React from 'react';
import { CohortRetentionMatrix } from './cohort-retention-matrix';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import enMessages from '../../messages/en.json';
import { getHeatmapCellColor, type CohortHeatmapRow } from '../../lib/orgs/funnel-goals-synthesizer';

const mockCohorts: CohortHeatmapRow[] = [
  {
    cohortMonth: '2026-02-01',
    cohortLabel: 'Feb 2026',
    cohortSize: 50,
    retentionByPeriod: new Map([
      [0, { retainedCount: 50, retentionRatePercent: 100, colorClass: getHeatmapCellColor(100) }],
      [1, { retainedCount: 32, retentionRatePercent: 64, colorClass: getHeatmapCellColor(64) }],
    ]),
  },
  {
    cohortMonth: '2026-01-01',
    cohortLabel: 'Jan 2026',
    cohortSize: 100,
    retentionByPeriod: new Map([
      [0, { retainedCount: 100, retentionRatePercent: 100, colorClass: getHeatmapCellColor(100) }],
      [1, { retainedCount: 62, retentionRatePercent: 62, colorClass: getHeatmapCellColor(62) }],
      [2, { retainedCount: 48, retentionRatePercent: 48, colorClass: getHeatmapCellColor(48) }],
      [3, { retainedCount: 42, retentionRatePercent: 42, colorClass: getHeatmapCellColor(42) }],
    ]),
  },
];

describe('CohortRetentionMatrix Component', () => {
  it('renders matrix table with cohort month, size, and retention rate percentages', () => {
    renderWithIntl(
      <CohortRetentionMatrix
        cohorts={mockCohorts}
        periodNumbers={[0, 1, 2, 3]}
        projectName="EasySign"
      />,
    );

    expect(screen.getByTestId('cohort-retention-matrix')).toBeInTheDocument();
    expect(screen.getByText('Feb 2026')).toBeInTheDocument();
    expect(screen.getByText('Jan 2026')).toBeInTheDocument();

    expect(screen.getByTestId('retention-cell-2026-02-01-p0')).toHaveTextContent('100%');
    expect(screen.getByTestId('retention-cell-2026-02-01-p1')).toHaveTextContent('64%');
    expect(screen.getByTestId('retention-cell-2026-01-01-p2')).toHaveTextContent('48%');
  });

  /*
    The "All Activity / Purchases / Sign-ins" pills are gone: they changed their own highlight and
    nothing else (the page never re-queried), so "Purchases" relabelled all-activity retention.
  */
  it('offers no conversion-event filter pills that would relabel the same data', () => {
    renderWithIntl(<CohortRetentionMatrix cohorts={mockCohorts} periodNumbers={[0, 1, 2, 3]} projectName="EasySign" />);
    expect(screen.queryByTestId('cohort-event-filters')).not.toBeInTheDocument();
  });

  it('renders a not-enough-data empty state instead of sample cohorts when there are none', () => {
    renderWithIntl(<CohortRetentionMatrix cohorts={[]} periodNumbers={[]} projectName="EasySign" />);
    const empty = screen.getByTestId('cohort-retention-empty');
    expect(empty).toHaveTextContent(enMessages.CohortRetention.empty);
    expect(empty).toHaveTextContent(enMessages.CohortRetention.emptyDetail);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByTestId('cohort-retention-matrix').textContent ?? '').not.toMatch(/\d+%/);
  });

  it('explains a warehouse failure when cohorts could not be queried', () => {
    renderWithIntl(
      <CohortRetentionMatrix cohorts={[]} periodNumbers={[]} projectName="EasySign" viewKind="warehouse_not_configured" />,
    );
    expect(screen.getByTestId('cohort-retention-empty')).toHaveTextContent(enMessages.CohortRetention.notConfigured);
  });

  it('renders heatmap legend and trend indicators', () => {
    renderWithIntl(
      <CohortRetentionMatrix
        cohorts={mockCohorts}
        periodNumbers={[0, 1, 2, 3]}
        projectName="EasySign"
      />,
    );

    expect(screen.getByText('Retention:')).toBeInTheDocument();
  });
});
