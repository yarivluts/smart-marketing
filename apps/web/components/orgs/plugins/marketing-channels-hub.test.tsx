import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MarketingChannelsHub } from './marketing-channels-hub';
import messages from '../../../messages/en.json';

describe('MarketingChannelsHub', () => {
  it('renders marketing channels hub with pixel snippet and ad platforms', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingChannelsHub
          orgId="JGTxet9aGXV6xUPWYidR"
          projectId="LYierelkF0eKnLmIrS9u"
          projectName="EasySign Growth"
        />
      </NextIntlClientProvider>,
    );

    // Header
    expect(
      screen.getByRole('heading', {
        name: 'Marketing Channels & Connectors (EasySign Growth)',
      }),
    ).toBeInTheDocument();

    // Tracking snippet box
    expect(
      screen.getByText('Website Tracking Snippet (Zero-Config Web Pixel)'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Code Snippet/i })).toBeInTheDocument();

    // Ad Connectors
    expect(screen.getByText('Google Ads')).toBeInTheDocument();
    expect(screen.getByText('Meta Ads (Facebook & Instagram)')).toBeInTheDocument();
    expect(screen.getByText('TikTok Ads')).toBeInTheDocument();
    expect(screen.getByText('Stripe / Credit Card Ingest')).toBeInTheDocument();
  });
});
