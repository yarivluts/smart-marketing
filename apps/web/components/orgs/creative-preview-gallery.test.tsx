import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CreativePreviewGallery } from './creative-preview-gallery';
import messages from '../../messages/en.json';
import type { UnifiedCampaignItem } from '@/lib/orgs/ads-performance-synthesizer';

describe('CreativePreviewGallery', () => {
  const mockItems: UnifiedCampaignItem[] = [
    {
      id: 'target-meta',
      targetId: 'target-meta',
      label: 'Meta Scale Campaign',
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
      importedAds: [
        {
          adName: 'Meta Ad A',
          headline: 'Supercharge Your Funnel',
          primaryText: 'Experience automated growth with zero setup.',
          status: 'ACTIVE',
        },
      ],
    },
    {
      id: 'target-google',
      targetId: 'target-google',
      label: 'Google Search Leads',
      platform: 'google_ads',
      status: 'enabled',
      dailyBudgetUsd: 150,
      spend30dUsd: 3900,
      roas: 3.2,
      impressions: 65000,
      clicks: 2800,
      ctrPct: 4.3,
      cpaUsd: 28.0,
      conversions: 139,
      draft: {
        platform: 'google_ads',
        campaignName: 'Google Search Leads',
        dailyBudgetUsd: 150,
        adGroups: [
          {
            name: 'Main Group',
            keywords: [{ text: 'best b2b software' }],
            responsiveSearchAd: {
              headlines: ['Top B2B Software 2026', 'Boost Lead Generation'],
              descriptions: ['Enterprise grade growth platform.'],
              finalUrl: 'https://growthos.io',
            },
          },
        ],
      },
    },
  ];

  it('renders both Meta and Google Search preview cards in the gallery', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CreativePreviewGallery items={mockItems} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId('meta-ad-preview-card')).toBeInTheDocument();
    expect(screen.getByTestId('google-search-ad-preview-card')).toBeInTheDocument();
    expect(screen.getByText('Supercharge Your Funnel')).toBeInTheDocument();
    expect(screen.getByText('Top B2B Software 2026')).toBeInTheDocument();
  });

  it('filters gallery items when platform button is clicked', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CreativePreviewGallery items={mockItems} />
      </NextIntlClientProvider>,
    );

    // Click Google Ads filter
    fireEvent.click(screen.getByRole('button', { name: 'Google Ads' }));

    expect(screen.queryByTestId('meta-ad-preview-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('google-search-ad-preview-card')).toBeInTheDocument();
  });
});
