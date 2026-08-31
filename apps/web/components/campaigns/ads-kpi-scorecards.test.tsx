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
  spendChangePct: 15.0,
  roasChangePct: 22.1,
  cpaChangePct: -12.4,
};

describe('AdsKpiScorecards', () => {
  it('renders all 6 KPI metric scorecards with formatted values and trend chips', () => {
    renderWithIntl(<AdsKpiScorecards summary={mockSummary} />);

    expect(screen.getByTestId('kpi-metric-cards')).toBeInTheDocument();

    // 1. Total Spend
    expect(screen.getByText('Total Spend')).toBeInTheDocument();
    expect(screen.getByText('$18,500')).toBeInTheDocument();
    expect(screen.getByText('+15%')).toBeInTheDocument();
    expect(screen.getByText('Meta: $11,000 · Google: $7,500')).toBeInTheDocument();

    // 2. Blended ROAS
    expect(screen.getByText('Blended ROAS')).toBeInTheDocument();
    expect(screen.getByText('4.2x')).toBeInTheDocument();
    expect(screen.getByText('+22.1%')).toBeInTheDocument();
    expect(screen.getByText('Target: 3.5x')).toBeInTheDocument();

    // 3. Impressions & Clicks
    expect(screen.getByText('Impressions & Clicks')).toBeInTheDocument();
    expect(screen.getByText('125.0k')).toBeInTheDocument();
    expect(screen.getByText('4,200 clicks · 420 conv.')).toBeInTheDocument();

    // 4. Average CTR
    expect(screen.getByText('Average CTR')).toBeInTheDocument();
    expect(screen.getByText('3.36%')).toBeInTheDocument();
    expect(screen.getByText('+0.8% vs benchmark')).toBeInTheDocument();

    // 5. Blended CPA
    expect(screen.getByText('Blended CPA')).toBeInTheDocument();
    expect(screen.getByText('$44.05')).toBeInTheDocument();
    expect(screen.getByText('-12.4%')).toBeInTheDocument();

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
});
