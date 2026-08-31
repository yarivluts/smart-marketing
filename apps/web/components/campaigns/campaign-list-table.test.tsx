import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { CampaignListTable } from './campaign-list-table';
import type { UnifiedCampaignItem } from '@/lib/orgs/ads-performance-synthesizer';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/campaigns',
}));

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
    status: 'paused',
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

describe('CampaignListTable', () => {
  it('renders campaign rows with platform badges, budget controls, spend, and ROAS badges', () => {
    renderWithIntl(
      <CampaignListTable
        orgId="org-1"
        projectId="proj-1"
        items={mockItems}
        canExecute={true}
      />,
    );

    expect(screen.getByTestId('campaign-list-table')).toBeInTheDocument();
    expect(screen.getByText('Meta Retargeting Leads')).toBeInTheDocument();
    expect(screen.getByText('Google Search - Commercial')).toBeInTheDocument();

    expect(screen.getByText('Meta')).toBeInTheDocument();
    expect(screen.getByText('Google Ads')).toBeInTheDocument();

    expect(screen.getByText('$1,200')).toBeInTheDocument();
    expect(screen.getByText('$2,400')).toBeInTheDocument();

    expect(screen.getByText('3.8x')).toBeInTheDocument();
    expect(screen.getByText('2.5x')).toBeInTheDocument();
  });
});
