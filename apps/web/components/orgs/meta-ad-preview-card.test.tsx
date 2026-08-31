import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MetaAdPreviewCard } from './meta-ad-preview-card';
import messages from '../../messages/en.json';

describe('MetaAdPreviewCard', () => {
  it('renders campaign brand header, primary copy, headline, and CTA button', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MetaAdPreviewCard
          campaignName="Growth Retargeting"
          ad={{
            adName: 'Ad 1',
            headline: 'Scale Your SaaS 10x Faster',
            primaryText: 'Automate your entire growth funnel with GrowthOS.',
            description: 'Start free trial today',
            linkUrl: 'https://growthos.io/trial',
            callToActionType: 'SIGN_UP',
            status: 'ACTIVE',
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('Growth Retargeting')).toBeInTheDocument();
    expect(screen.getByText('Sponsored')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('Automate your entire growth funnel with GrowthOS.')).toBeInTheDocument();
    expect(screen.getByText('Scale Your SaaS 10x Faster')).toBeInTheDocument();
    expect(screen.getByText('Start free trial today')).toBeInTheDocument();
    expect(screen.getByText('growthos.io')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
  });

  it('renders visual placeholder when imageUrl is not provided', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MetaAdPreviewCard
          campaignName="Brand Awareness"
          ad={{
            adName: 'Ad 2',
            headline: 'Brand Headline',
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('Creative Preview Mockup')).toBeInTheDocument();
  });
});
