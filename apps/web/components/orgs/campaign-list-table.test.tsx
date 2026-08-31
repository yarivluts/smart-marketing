import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CampaignListTable } from './campaign-list-table';
import messages from '../../messages/en.json';
import type { UnifiedCampaignItem } from '@/lib/orgs/ads-performance-synthesizer';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe('CampaignListTable', () => {
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
    {
      id: 'c2',
      targetId: 'target-2',
      label: 'Google Search High Intent',
      platform: 'google_ads',
      status: 'paused',
      dailyBudgetUsd: 150,
      spend30dUsd: 3900,
      roas: 3.2,
      impressions: 65000,
      clicks: 2800,
      ctrPct: 4.3,
      cpaUsd: 28.0,
      conversions: 139,
    },
  ];

  it('renders table columns, campaign rows, and platform badges', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CampaignListTable
          orgId="org-1"
          projectId="proj-1"
          items={mockItems}
          canExecute={true}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId('campaign-list-table')).toBeInTheDocument();
    expect(screen.getByText('Campaign')).toBeInTheDocument();
    expect(screen.getByText('Meta Scale Growth')).toBeInTheDocument();
    expect(screen.getByText('Google Search High Intent')).toBeInTheDocument();
    expect(screen.getByText('Meta')).toBeInTheDocument();
    expect(screen.getByText('Google Ads')).toBeInTheDocument();
    expect(screen.getByText('3.8x')).toBeInTheDocument();
    expect(screen.getByText('3.2x')).toBeInTheDocument();
  });
});
