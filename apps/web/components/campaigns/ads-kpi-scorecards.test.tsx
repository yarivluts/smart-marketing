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
    expect(screen.getByText('Facebook & Instagram: $11,000 · Google: $7,500')).toBeInTheDocument();

    // 2. Blended ROAS
    expect(screen.getByText('Sales per $1 of ads')).toBeInTheDocument();
    expect(screen.getByText('4.2x')).toBeInTheDocument();
    // Deliberately asserts ABSENCE: the card used to show "Target: 3.5x" with a
    // progress bar against it, a benchmark no project ever set. This assertion
    // previously pinned the fabrication in place, which is how it survived.
    expect(screen.queryByText('Target: 3.5x')).not.toBeInTheDocument();

    // 3. Impressions & Clicks
    expect(screen.getByText('Times shown & clicks')).toBeInTheDocument();
    expect(screen.getByText('125.0k')).toBeInTheDocument();
    expect(screen.getByText('4,200 clicks · 420 sign-ups or sales')).toBeInTheDocument();

    // 4. Average CTR
    expect(screen.getByText('Share who clicked')).toBeInTheDocument();
    expect(screen.getByText('3.36%')).toBeInTheDocument();

    // 5. Blended CPA
    expect(screen.getByText('Cost per sign-up or sale')).toBeInTheDocument();
    expect(screen.getByText('$44.05')).toBeInTheDocument();

    // 6. Active Campaigns
    expect(screen.getByText('Active ads')).toBeInTheDocument();
    expect(screen.getByText('5 / 6')).toBeInTheDocument();
    expect(screen.getByText('5 ads showing now')).toBeInTheDocument();
  });

  it('uses singular wording for a count of one', () => {
    renderWithIntl(
      <AdsKpiScorecards
        summary={{ ...mockSummary, totalClicks: 1, totalConversions: 1, activeCampaignsCount: 1 }}
      />,
    );
    expect(screen.getByText('1 click · 1 sign-up or sale')).toBeInTheDocument();
    expect(screen.getByText('1 ad showing now')).toBeInTheDocument();
  });

  it('uses Hebrew singular wording for a count of one', () => {
    renderWithIntl(
      <AdsKpiScorecards
        summary={{ ...mockSummary, totalClicks: 1, totalConversions: 1, activeCampaignsCount: 1 }}
      />,
      { locale: 'he' },
    );
    expect(screen.getByText(/^\u05D4\u05E7\u05DC\u05E7\u05D4 \u05D0\u05D7\u05EA/)).toBeInTheDocument();
    expect(screen.getByText('\u05DE\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D7\u05EA \u05DE\u05D5\u05E6\u05D2\u05EA \u05E2\u05DB\u05E9\u05D9\u05D5')).toBeInTheDocument();
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
    // Each empty card says when it fills in, instead of leaving a dead end.
    expect(screen.getAllByText('Shows up here once your ads have been shown to people.')).toHaveLength(5);
    expect(screen.queryByText('2.85%')).not.toBeInTheDocument();
    expect(screen.queryByText(/14\.2/)).not.toBeInTheDocument();
    expect(screen.queryByText(/22\.1/)).not.toBeInTheDocument();

    // The campaign counts come from the target list, so they still render.
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
  });

  it('does not add the reason line when the numbers are measured', () => {
    renderWithIntl(<AdsKpiScorecards summary={mockSummary} />);
    expect(screen.queryByText('Shows up here once your ads have been shown to people.')).not.toBeInTheDocument();
  });

  it('explains empty cards in Hebrew too', () => {
    renderWithIntl(
      <AdsKpiScorecards
        summary={{ ...mockSummary, totalSpendUsd: null, blendedRoas: null, totalImpressions: null, blendedCtrPct: null, blendedCpaUsd: null }}
      />,
      { locale: 'he' },
    );
    expect(screen.getAllByText(/^\u05D9\u05D5\u05E4\u05D9\u05E2 \u05DB\u05D0\u05DF/)).toHaveLength(5);
  });
});
