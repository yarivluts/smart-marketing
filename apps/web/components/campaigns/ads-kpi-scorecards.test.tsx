import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { AdsKpiScorecards } from './ads-kpi-scorecards';
import type { AdsPerformanceSummary } from '@/lib/orgs/ads-performance-synthesizer';

const mockSummary: AdsPerformanceSummary = {
  totalSpendUsd: 18500,
  metaSpendUsd: 11000,
  googleSpendUsd: 7500,
  simulatedSpendUsd: 0,
  blendedRoas: 4.2,
  totalImpressions: 125000,
  totalClicks: 4200,
  blendedCtrPct: 3.36,
  blendedCpaUsd: 44.05,
  totalConversions: 420,
  activeCampaignsCount: 5,
  totalCampaignsCount: 6,
  campaignsWithSpendCount: 6,
};

describe('AdsKpiScorecards', () => {
  it('renders all 6 KPI metric scorecards with formatted values', () => {
    renderWithIntl(<AdsKpiScorecards summary={mockSummary} />);

    expect(screen.getByTestId('kpi-metric-cards')).toBeInTheDocument();

    // 1. Total Spend
    expect(screen.getByText('Total Spend')).toBeInTheDocument();
    expect(screen.getByText('$18,500')).toBeInTheDocument();
    expect(screen.getByText('Meta: $11,000 · Google: $7,500')).toBeInTheDocument();

    // 2. Blended ROAS
    expect(screen.getByText('Blended ROAS')).toBeInTheDocument();
    expect(screen.getByText('4.2x')).toBeInTheDocument();
    expect(screen.getByText('Target: 3.5x')).toBeInTheDocument();

    // 3. Impressions & Clicks
    expect(screen.getByText('Impressions & Clicks')).toBeInTheDocument();
    expect(screen.getByText('125.0k')).toBeInTheDocument();
    expect(screen.getByText('4,200 clicks · 420 conv.')).toBeInTheDocument();

    // 4. Average CTR
    expect(screen.getByText('Average CTR')).toBeInTheDocument();
    expect(screen.getByText('3.36%')).toBeInTheDocument();

    // 5. Blended CPA
    expect(screen.getByText('Blended CPA')).toBeInTheDocument();
    expect(screen.getByText('$44.05')).toBeInTheDocument();

    // 6. Active Campaigns
    expect(screen.getByText('Active Campaigns')).toBeInTheDocument();
    expect(screen.getByText('5 / 6')).toBeInTheDocument();
    expect(screen.getByText('5 live delivery')).toBeInTheDocument();
  });

  it('renders correctly in Hebrew RTL locale with numeric isolation', () => {
    renderWithIntl(<AdsKpiScorecards summary={mockSummary} />, { locale: 'he' });

    expect(screen.getByTestId('kpi-metric-cards')).toBeInTheDocument();
    expect(screen.getByText('$18,500')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText('4.2x')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText('$44.05')).toHaveAttribute('dir', 'ltr');
  });
  /**
   * The scorecards used to fill every gap with a constant — `?? 14.2` spend change,
   * `?? 22.1` ROAS change, `?? -12.4` CPA change, `?? 2.85` CTR — so a project that had
   * never reported a metric still rendered six confident readings.
   */
  it('renders "No data" for every unmeasured metric instead of a stand-in constant', () => {
    renderWithIntl(
      <AdsKpiScorecards
        summary={{
          totalSpendUsd: null,
          metaSpendUsd: null,
          googleSpendUsd: null,
          simulatedSpendUsd: null,
          blendedRoas: null,
          totalImpressions: null,
          totalClicks: null,
          blendedCtrPct: null,
          blendedCpaUsd: null,
          totalConversions: null,
          activeCampaignsCount: 2,
          totalCampaignsCount: 5,
          campaignsWithSpendCount: 0,
        }}
      />,
    );

    expect(screen.getAllByText('No data')).toHaveLength(5);
    expect(screen.queryByText('2.85%')).not.toBeInTheDocument();
    expect(screen.queryByText(/14\.2/)).not.toBeInTheDocument();
    expect(screen.queryByText(/22\.1/)).not.toBeInTheDocument();

    // The campaign counts come from the target list, so they still render.
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
  });
});
