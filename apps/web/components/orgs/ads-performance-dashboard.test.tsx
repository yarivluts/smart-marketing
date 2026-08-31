import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AdsPerformanceDashboard } from './ads-performance-dashboard';
import messages from '../../messages/en.json';
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
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe('AdsPerformanceDashboard', () => {
  const mockItems: UnifiedCampaignItem[] = [
    {
      id: 'c1',
      targetId: 'target-1',
      label: 'Meta Scale Growth',
      platform: 'meta_ads',
      status: 'enabled',
      dailyBudgetUsd: 100,
      spend30dUsd: 2600,
      roas: 3.8,
      impressions: 80000,
      clicks: 2200,
      ctrPct: 2.75,
      cpaUsd: 22.5,
      conversions: 115,
    },
  ];

  const mockSummary: AdsPerformanceSummary = {
    totalSpendUsd: 2600,
    metaSpendUsd: 2600,
    googleSpendUsd: 0,
    simulatedSpendUsd: 0,
    blendedRoas: 3.8,
    totalImpressions: 80000,
    totalClicks: 2200,
    blendedCtrPct: 2.75,
    blendedCpaUsd: 22.5,
    totalConversions: 115,
    activeCampaignsCount: 1,
    totalCampaignsCount: 1,
  };

  it('renders KPI metric cards, proactive recommendation, and sub-tabs', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AdsPerformanceDashboard
          orgId="org-1"
          projectId="proj-1"
          projectName="Growth Project"
          items={mockItems}
          summary={mockSummary}
          rawTargets={[]}
          connections={[]}
          canExecute={true}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId('ads-performance-dashboard')).toBeInTheDocument();
    const kpiCards = screen.getByTestId('kpi-metric-cards');
    expect(kpiCards).toBeInTheDocument();
    expect(screen.getByText('Total Spend')).toBeInTheDocument();
    expect(screen.getAllByText('$2,600').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3.8x').length).toBeGreaterThan(0);
    expect(screen.getByTestId('proactive-recommendation-banner')).toBeInTheDocument();
    expect(screen.getByText('1-Click Apply')).toBeInTheDocument();
  });

  it('switches between Overview, Creatives Gallery, and Analytics tabs', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AdsPerformanceDashboard
          orgId="org-1"
          projectId="proj-1"
          projectName="Growth Project"
          items={mockItems}
          summary={mockSummary}
          rawTargets={[]}
          connections={[]}
          canExecute={true}
        />
      </NextIntlClientProvider>,
    );

    // Initial Overview tab
    expect(screen.getByTestId('campaign-list-table')).toBeInTheDocument();

    // Click Creatives Gallery tab
    fireEvent.click(screen.getByRole('button', { name: /Creatives Gallery/i }));
    expect(screen.getByTestId('creative-preview-gallery')).toBeInTheDocument();

    // Click Analytics tab
    fireEvent.click(screen.getByRole('button', { name: /Spend & ROAS Analytics/i }));
    expect(screen.getByTestId('analytics-tab')).toBeInTheDocument();
  });
});
