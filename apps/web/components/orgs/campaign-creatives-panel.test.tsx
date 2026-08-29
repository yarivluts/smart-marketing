import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CampaignCreativesPanel, type CampaignDraftView } from './campaign-creatives-panel';
import messages from '../../messages/en.json';

function renderPanel(draft: CampaignDraftView | undefined): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CampaignCreativesPanel draft={draft} />
    </NextIntlClientProvider>,
  );
}

const googleDraft: CampaignDraftView = {
  platform: 'google_ads',
  campaignName: 'Brand Search',
  dailyBudgetUsd: 40,
  adGroups: [
    {
      name: 'Ad Group 1',
      keywords: [{ text: 'digital signatures' }, { text: 'sign online' }],
      responsiveSearchAd: {
        headlines: ['Sign Anywhere', 'Fast E-Sign', 'Try EasySign'],
        descriptions: ['Sign documents in seconds.', 'Free trial, no card needed.'],
        finalUrl: 'https://easysign.example.com/pricing',
      },
    },
  ],
};

const metaDraft: CampaignDraftView = {
  platform: 'meta',
  campaignName: 'Awareness',
  dailyBudgetUsd: 25,
  adSets: [
    {
      name: 'IL 25-45',
      targeting: { countries: ['IL'], ageMin: 25, ageMax: 45 },
      ad: {
        name: 'Ad 1',
        creative: {
          primaryText: 'Stop printing. Start signing.',
          headline: 'EasySign',
          description: 'The fastest way to close.',
          linkUrl: 'https://easysign.example.com',
        },
      },
    },
  ],
};

const importedAds = [
  {
    adSetName: 'Ad Set A',
    adName: 'lawyers | va | image ad',
    status: 'PAUSED',
    headline: 'Sign In Minutes',
    primaryText: 'Contracts signed from the phone in the same call.',
    linkUrl: 'https://easysign.example.com/lawyers',
    imageUrl: 'https://cdn.example.com/ad.png',
    callToActionType: 'SIGN_UP',
  },
];

describe('CampaignCreativesPanel', () => {
  it('shows the no-draft empty state when the target has no campaign draft', () => {
    renderPanel(undefined);
    expect(screen.getByText('No campaign draft exists for this target yet - create one from the campaigns page.')).toBeInTheDocument();
  });

  it('renders imported platform ads (image, headline, primary text, link, CTA, status) and prefers them over a draft', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <CampaignCreativesPanel draft={googleDraft} importedAds={importedAds} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('lawyers | va | image ad')).toBeInTheDocument();
    expect(screen.getByText('Ad Set A')).toBeInTheDocument();
    expect(screen.getByText('PAUSED')).toBeInTheDocument();
    expect(screen.getByText('Sign In Minutes')).toBeInTheDocument();
    expect(screen.getByText('Contracts signed from the phone in the same call.')).toBeInTheDocument();
    expect(screen.getByText('https://easysign.example.com/lawyers')).toBeInTheDocument();
    expect(screen.getByText('CTA: SIGN_UP')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sign In Minutes' })).toHaveAttribute('src', 'https://cdn.example.com/ad.png');
    // The imported snapshot IS the platform's truth for this campaign — the draft is not rendered alongside it.
    expect(screen.queryByText('Sign Anywhere')).not.toBeInTheDocument();
  });

  it('renders a Google draft as ad groups with RSA headlines, descriptions, final URL, and keywords', () => {
    renderPanel(googleDraft);
    expect(screen.getByText('Ad Group 1')).toBeInTheDocument();
    expect(screen.getByText('Sign Anywhere')).toBeInTheDocument();
    expect(screen.getByText('Free trial, no card needed.')).toBeInTheDocument();
    expect(screen.getByText('https://easysign.example.com/pricing')).toBeInTheDocument();
    expect(screen.getByText('Keywords: digital signatures, sign online')).toBeInTheDocument();
  });

  it('renders a Meta draft as ad sets with targeting summary and the link-ad creative', () => {
    renderPanel(metaDraft);
    expect(screen.getByText('IL 25-45')).toBeInTheDocument();
    expect(screen.getByText('IL, ages 25-45')).toBeInTheDocument();
    expect(screen.getByText('Stop printing. Start signing.')).toBeInTheDocument();
    expect(screen.getByText('EasySign')).toBeInTheDocument();
    expect(screen.getByText('https://easysign.example.com')).toBeInTheDocument();
  });
});
