import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { AdsPerformanceCharts } from './ads-performance-charts';
import type { UnifiedCampaignItem } from '@/lib/orgs/ads-performance-synthesizer';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

function campaign(overrides: Partial<UnifiedCampaignItem> & Pick<UnifiedCampaignItem, 'id'>): UnifiedCampaignItem {
  return {
    targetId: overrides.id,
    label: overrides.id,
    platform: 'meta_ads',
    status: 'enabled',
    dailyBudgetUsd: 10,
    spend30dUsd: null,
    roas: null,
    impressions: null,
    clicks: null,
    ctrPct: null,
    cpaUsd: null,
    conversions: null,
    ...overrides,
  };
}

describe('AdsPerformanceCharts', () => {
  it('shows a connect-a-source state, not spend charts, when nothing is measured', () => {
    renderWithIntl(
      <AdsPerformanceCharts
        orgId="o"
        projectId="p"
        items={[campaign({ id: 'Brand', dailyBudgetUsd: 50 }), campaign({ id: 'Validation', platform: 'google_ads', status: 'paused', dailyBudgetUsd: 20 })]}
        spendOutcome={{ ok: false, reason: 'query_error', message: 'x' }}
        spendWindowDays={30}
      />,
    );
    expect(screen.getByText('No ad spend connected yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Connect an ad source/ })).toHaveAttribute('href', '/orgs/o/projects/p/plugins');
    expect(screen.queryByRole('region', { name: 'Spend by channel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Spend efficiency' })).not.toBeInTheDocument();

    // Channel mix and budget come from the campaign rows themselves, so they still render.
    const budget = screen.getByRole('region', { name: 'Daily budget by channel' });
    const rows = within(budget).getAllByRole('row');
    expect(rows.map((row) => row.textContent)).toEqual(['channelActivePaused', 'Meta$50$0', 'Google Ads$0$20']);
    expect(within(screen.getByRole('region', { name: 'Campaigns by channel' })).getByText('2')).toBeInTheDocument();
  });

  it('charts measured spend per channel and campaign with efficiency figures', () => {
    renderWithIntl(
      <AdsPerformanceCharts
        orgId="o"
        projectId="p"
        items={[
          campaign({ id: 'Meta LP', dailyBudgetUsd: 10, spend30dUsd: 240 }),
          campaign({ id: 'Search', platform: 'google_ads', dailyBudgetUsd: 10, spend30dUsd: 60 }),
        ]}
        spendOutcome={{ ok: true, rows: [] }}
        spendWindowDays={30}
      />,
    );
    expect(screen.queryByText('No ad spend connected yet')).not.toBeInTheDocument();
    const byCampaign = screen.getByRole('region', { name: 'Spend by campaign' });
    expect(within(byCampaign).getByRole('link', { name: /Meta LP/ })).toHaveAttribute('href', '/orgs/o/projects/p/campaigns/Meta%20LP');
    const efficiency = screen.getByRole('region', { name: 'Spend efficiency' });
    // $300 over 30 days against 2 x $10/day x 30 days of budget.
    expect(within(efficiency).getByText('$10')).toBeInTheDocument();
    expect(within(efficiency).getByText('50%')).toBeInTheDocument();
    expect(within(efficiency).getByText('2 of 2 campaigns')).toBeInTheDocument();
  });

  it('renders nothing without campaigns', () => {
    const { container } = renderWithIntl(<AdsPerformanceCharts orgId="o" projectId="p" items={[]} spendOutcome={null} spendWindowDays={30} />);
    expect(container).toBeEmptyDOMElement();
  });
});
