import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CohortRetentionMatrix } from './cohort-retention-matrix';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
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
      />,
    );

    expect(screen.getByTestId('cohort-retention-matrix')).toBeInTheDocument();
    expect(screen.getByText('Feb 2026')).toBeInTheDocument();
    expect(screen.getByText('Jan 2026')).toBeInTheDocument();

    expect(screen.getByTestId('retention-cell-2026-02-01-p0')).toHaveTextContent('100%');
    expect(screen.getByTestId('retention-cell-2026-02-01-p1')).toHaveTextContent('64%');
    expect(screen.getByTestId('retention-cell-2026-01-01-p2')).toHaveTextContent('48%');
  });

  it('handles conversion event filtering pills', () => {
    const handleSelectEvent = vi.fn();

    renderWithIntl(
      <CohortRetentionMatrix
        cohorts={mockCohorts}
        periodNumbers={[0, 1, 2, 3]}
        conversionEvent=""
        onSelectConversionEvent={handleSelectEvent}
      />,
    );

    const purchaseBtn = screen.getByTestId('filter-purchases');
    fireEvent.click(purchaseBtn);
    expect(handleSelectEvent).toHaveBeenCalledWith('purchase');

    const signinBtn = screen.getByTestId('filter-sign-ins');
    fireEvent.click(signinBtn);
    expect(handleSelectEvent).toHaveBeenCalledWith('sign_in');
  });

  it('renders heatmap legend and trend indicators', () => {
    renderWithIntl(
      <CohortRetentionMatrix
        cohorts={mockCohorts}
        periodNumbers={[0, 1, 2, 3]}
      />,
    );

    expect(screen.getByText('Retention:')).toBeInTheDocument();
    expect(screen.getByText('Cohort retention trending +4% above target')).toBeInTheDocument();
  });
});
