import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { CampaignSpendPanel } from './campaign-spend-panel';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe('CampaignSpendPanel', () => {
  it('explains why spend is missing when the query degraded', () => {
    renderWithIntl(<CampaignSpendPanel spend={{ ok: false, reason: 'not_yet_backed' }} />);
    expect(screen.getByText('Spend is not available yet')).toBeInTheDocument();
    expect(screen.getByText('The spend table has not been built in the warehouse yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('trend-chart')).not.toBeInTheDocument();
  });

  it('says no spend was recorded rather than charting zeros', () => {
    renderWithIntl(<CampaignSpendPanel spend={{ ok: true, totalSpendUsd: 0, days: [] }} />);
    expect(screen.getByText('No spend recorded for this campaign yet - the platform has not reported any delivery.')).toBeInTheDocument();
    expect(screen.queryByTestId('trend-chart')).not.toBeInTheDocument();
  });

  it('charts the measured days with total, daily average and peak', () => {
    renderWithIntl(
      <CampaignSpendPanel
        spend={{
          ok: true,
          totalSpendUsd: 30,
          days: [
            { date: '2026-08-01', spendUsd: 10 },
            { date: '2026-08-02', spendUsd: 20 },
          ],
        }}
      />,
    );
    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(screen.getByText('$15')).toBeInTheDocument();
    // The peak day is named under its amount, and each day is a row of the chart's data table.
    expect(screen.getAllByText('$20')).toHaveLength(2);
    expect(screen.getAllByText('Aug 2')).toHaveLength(2);
    expect(screen.getByTestId('trend-chart')).toBeInTheDocument();
  });
});
