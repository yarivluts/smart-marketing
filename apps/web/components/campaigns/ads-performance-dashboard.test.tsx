import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { AdsPerformanceDashboard } from './ads-performance-dashboard';
import type {
  UnifiedCampaignItem,
  AdsPerformanceSummary,
} from '@/lib/orgs/ads-performance-synthesizer';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/campaigns',
}));

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
  activeCampaignsCount: 2,
  totalCampaignsCount: 2,
  campaignsWithSpendCount: 6,
};

const mockItems: UnifiedCampaignItem[] = [
  {
    id: 'c1',
    targetId: 't1',
    label: 'Meta Retargeting Leads',
    platform: 'meta_ads',
    status: 'enabled',
    dailyBudgetUsd: 150,
    spend30dUsd: 1200,
    impressions: 45000,
    clicks: 1800,
    conversions: 85,
    cpaUsd: 14.12,
    ctrPct: 4.0,
    roas: 3.8,
  },
  {
    id: 'c2',
    targetId: 't2',
    label: 'Google Search - Commercial',
    platform: 'google_ads',
    status: 'enabled',
    dailyBudgetUsd: 200,
    spend30dUsd: 2400,
    impressions: 80000,
    clicks: 2400,
    conversions: 120,
    cpaUsd: 20.0,
    ctrPct: 3.0,
    roas: 2.5,
  },
];

describe('AdsPerformanceDashboard', () => {
  it('renders complete Ads & Performance Cockpit with KPI scorecards, recommendation, and tabs', () => {
    renderWithIntl(
      <AdsPerformanceDashboard
        orgId="org-1"
        projectId="proj-1"
        items={mockItems}
        summary={mockSummary}
        rawTargets={[]}
        connections={[]}
        canExecute={true}
      />,
    );

    expect(screen.getByTestId('ads-performance-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-metric-cards')).toBeInTheDocument();
    expect(screen.getByTestId('proactive-recommendation-banner')).toBeInTheDocument();
    expect(screen.getByTestId('campaign-list-table')).toBeInTheDocument();

    // Tab navigation
    expect(screen.getByText('Campaigns & Performance')).toBeInTheDocument();
    expect(screen.getByText('Creatives Gallery')).toBeInTheDocument();
    expect(screen.getByText('Spend & ROAS Analytics')).toBeInTheDocument();
  });

  it('states the recommendation from the selected campaign, not a fixed string', () => {
    renderWithIntl(
      <AdsPerformanceDashboard
        orgId="org-1"
        projectId="proj-1"
        items={mockItems}
        summary={mockSummary}
        rawTargets={[]}
        connections={[]}
        canExecute={true}
      />,
    );

    const banner = screen.getByTestId('proactive-recommendation-banner');
    // The highest measured ROAS in the fixture is 3.8x on a $150/day budget, so
    // 20% takes it to $180. Every figure shown has to be one of those.
    expect(banner).toHaveTextContent('Meta Retargeting Leads');
    expect(banner).toHaveTextContent('3.8x');
    expect(banner).toHaveTextContent('$150');
    expect(banner).toHaveTextContent('$180');
  });

  it('projects no conversion lift, because none is measured', () => {
    renderWithIntl(
      <AdsPerformanceDashboard
        orgId="org-1"
        projectId="proj-1"
        items={mockItems}
        summary={mockSummary}
        rawTargets={[]}
        connections={[]}
        canExecute={true}
      />,
    );

    const banner = screen.getByTestId('proactive-recommendation-banner');
    // This banner sits beside a button that raises a real daily budget on a real
    // ad account. It previously carried a constant "ROAS is 4.8x ... +18%
    // projected conversions" regardless of the campaign, which is the exact
    // claim a user would be acting on. Nothing here can compute a conversion
    // forecast, so the text must not imply one.
    expect(banner).not.toHaveTextContent('4.8x');
    expect(banner).not.toHaveTextContent('+18%');
    expect(banner).toHaveTextContent('No conversion lift is projected');
  });

  it('shows no recommendation when no campaign has a measured ROAS', () => {
    // Ranking by an unmeasured value would propose spending more on a campaign
    // nobody has evidence about, so with nothing measured there is no proposal.
    const unmeasured = mockItems.map((item) => ({ ...item, roas: null }));
    renderWithIntl(
      <AdsPerformanceDashboard
        orgId="org-1"
        projectId="proj-1"
        items={unmeasured}
        summary={mockSummary}
        rawTargets={[]}
        connections={[]}
        canExecute={true}
      />,
    );

    expect(screen.queryByTestId('proactive-recommendation-banner')).not.toBeInTheDocument();
  });

  it('switches to Creatives Gallery tab and Analytics tab seamlessly', () => {
    renderWithIntl(
      <AdsPerformanceDashboard
        orgId="org-1"
        projectId="proj-1"
        items={mockItems}
        summary={mockSummary}
        rawTargets={[]}
        connections={[]}
        canExecute={true}
      />,
    );

    // Switch to creatives tab
    fireEvent.click(screen.getByText('Creatives Gallery'));
    expect(screen.getByTestId('creative-preview-gallery')).toBeInTheDocument();
    expect(screen.queryByTestId('campaign-list-table')).not.toBeInTheDocument();

    // Switch to analytics tab
    fireEvent.click(screen.getByText('Spend & ROAS Analytics'));
    expect(screen.getByTestId('executive-blended-report')).toBeInTheDocument();
  });
});
