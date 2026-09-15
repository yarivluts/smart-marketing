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
  it('renders gallery with platform filter buttons and the real imported creative', () => {
    renderWithIntl(<CreativePreviewGallery items={mockItems} />);

    expect(screen.getByTestId('creative-preview-gallery')).toBeInTheDocument();
    expect(screen.getByText('All Platforms')).toBeInTheDocument();
    expect(screen.getByText('Meta Ads')).toBeInTheDocument();
    expect(screen.getByText('Google Ads')).toBeInTheDocument();

    expect(screen.getByText('Sign Documents Fast')).toBeInTheDocument();
    expect(screen.getByText('Automate contracts in seconds.')).toBeInTheDocument();
  });

  /**
   * `c2` has neither imported ads nor a draft. The gallery used to synthesize a card for
   * exactly this case — headline `${label} Official`, invented body copy and keywords, and
   * a growthos.io destination — rendered in the same card component as a genuinely imported
   * ad, in the one view whose job is showing what is really running on the platforms.
   */
  it('shows nothing for a campaign that has no imported ads and no draft', () => {
    renderWithIntl(<CreativePreviewGallery items={mockItems} />);

    expect(screen.queryByText(/Google Search - Commercial Official/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Smart Growth & ROI/)).not.toBeInTheDocument();
    expect(screen.queryByText(/growth marketing/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Accelerate your marketing performance/)).not.toBeInTheDocument();
  });

  it('falls through to the empty state when the filter leaves no real creatives', () => {
    renderWithIntl(<CreativePreviewGallery items={mockItems} />);

    fireEvent.click(screen.getByText('Google Ads'));

    expect(screen.queryByText('Sign Documents Fast')).not.toBeInTheDocument();
    expect(screen.getByText('No creatives found matching your filter.')).toBeInTheDocument();
  });
});
