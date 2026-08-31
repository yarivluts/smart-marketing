import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { CreativePreviewGallery } from './creative-preview-gallery';
import type { UnifiedCampaignItem } from '@/lib/orgs/ads-performance-synthesizer';

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
    importedAds: [
      {
        adName: 'DocSign Meta Ad',
        headline: 'Sign Documents Fast',
        primaryText: 'Automate contracts in seconds.',
        linkUrl: 'https://growthos.io/easysign',
        callToActionType: 'SIGN_UP',
      },
    ],
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

describe('CreativePreviewGallery', () => {
  it('renders gallery with platform filter buttons and creative cards', () => {
    renderWithIntl(<CreativePreviewGallery items={mockItems} />);

    expect(screen.getByTestId('creative-preview-gallery')).toBeInTheDocument();
    expect(screen.getByText('All Platforms')).toBeInTheDocument();
    expect(screen.getByText('Meta Ads')).toBeInTheDocument();
    expect(screen.getByText('Google Ads')).toBeInTheDocument();

    expect(screen.getByText('Sign Documents Fast')).toBeInTheDocument();
    expect(screen.getByText('Automate contracts in seconds.')).toBeInTheDocument();
    expect(screen.getByText('Google Search - Commercial Official')).toBeInTheDocument();
  });

  it('filters by platform when clicking filter button', () => {
    renderWithIntl(<CreativePreviewGallery items={mockItems} />);

    // Click Google Ads filter
    fireEvent.click(screen.getByText('Google Ads'));

    expect(screen.getByText('Google Search - Commercial Official')).toBeInTheDocument();
    expect(screen.queryByText('Sign Documents Fast')).not.toBeInTheDocument();
  });
});
