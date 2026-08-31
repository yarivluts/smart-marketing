import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { CampaignCreativesPanel, type ImportedAdView } from './campaign-creatives-panel';
import en from '../../messages/en.json';

describe('CampaignCreativesPanel', () => {
  it('renders imported ads correctly', () => {
    const importedAds: ImportedAdView[] = [
      {
        adName: 'DocSign Growth Ad #1',
        adSetName: 'Legal Professionals Audience',
        headline: 'Sign Documents 10x Faster',
        primaryText: 'Automate contracts and signatures in seconds with GrowthOS.',
        description: 'Secure, legally compliant electronic signatures.',
        imageUrl: 'https://example.com/ad-image.jpg',
        linkUrl: 'https://growthos.io/easysign',
        callToActionType: 'SIGN_UP',
      },
    ];

    renderWithIntl(<CampaignCreativesPanel draft={undefined} importedAds={importedAds} />);

    expect(screen.getByText('DocSign Growth Ad #1')).toBeInTheDocument();
    expect(screen.getByText('Legal Professionals Audience')).toBeInTheDocument();
    expect(screen.getByText('Sign Documents 10x Faster')).toBeInTheDocument();
    expect(screen.getByText('Automate contracts and signatures in seconds with GrowthOS.')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/ad-image.jpg');
    expect(screen.getByText('https://growthos.io/easysign')).toBeInTheDocument();
  });

  it('displays zero-creatives clean empty state when no ads or drafts are attached', () => {
    renderWithIntl(<CampaignCreativesPanel draft={undefined} importedAds={[]} />);
    expect(screen.getByText(en.Campaigns.noCreativesYet)).toBeInTheDocument();
  });

  it('renders responsive Google Search RSA ad previews with multi-headlines and descriptions', () => {
    const googleDraft = {
      platform: 'google_ads' as const,
      campaignName: 'Search - SaaS Tools',
      dailyBudgetUsd: 200,
      adGroups: [
        {
          name: 'Core Keywords Group',
          keywords: [{ text: 'digital signatures' }, { text: 'online contract signing' }],
          responsiveSearchAd: {
            headlines: ['Electronic Signature Tool', 'Sign PDF Online Fast', 'Free 14-Day Trial'],
            descriptions: [
              'Close deals faster with automated signing workflows.',
              'Trusted by 5,000+ business worldwide.',
            ],
            finalUrl: 'https://growthos.io/signup',
          },
        },
      ],
    };

    renderWithIntl(<CampaignCreativesPanel draft={googleDraft} />);

    expect(screen.getByText('Electronic Signature Tool')).toBeInTheDocument();
    expect(screen.getByText('Sign PDF Online Fast')).toBeInTheDocument();
    expect(screen.getByText('Close deals faster with automated signing workflows.')).toBeInTheDocument();
    expect(screen.getByText('https://growthos.io/signup')).toBeInTheDocument();
  });
});
