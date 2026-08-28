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

describe('CampaignCreativesPanel', () => {
  it('shows the no-draft empty state when the target has no campaign draft', () => {
    renderPanel(undefined);
    expect(screen.getByText('No campaign draft exists for this target yet - create one from the campaigns page.')).toBeInTheDocument();
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
