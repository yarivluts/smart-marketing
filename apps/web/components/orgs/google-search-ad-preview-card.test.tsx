import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { GoogleSearchAdPreviewCard } from './google-search-ad-preview-card';
import messages from '../../messages/en.json';

describe('GoogleSearchAdPreviewCard', () => {
  it('renders sponsored snippet, headlines, descriptions, and keyword chips', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <GoogleSearchAdPreviewCard
          campaignName="Legal Marketing Search"
          headlines={['Best Legal CRM Software', 'Automate Client Intake', 'Top Rated 2026']}
          descriptions={[
            'Seamless client onboarding and document generation for modern law firms.',
            'Get 14 days free with zero credit card required.',
          ]}
          finalUrl="https://legalgrowth.io/features"
          keywords={['law firm crm', 'legal intake automation']}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText('Sponsored')).toBeInTheDocument();
    expect(screen.getByText(/legalgrowth\.io › ads › legal-marketing-search/)).toBeInTheDocument();
    expect(screen.getByText('Best Legal CRM Software')).toBeInTheDocument();
    expect(screen.getByText('Automate Client Intake')).toBeInTheDocument();
    expect(screen.getByText('Top Rated 2026')).toBeInTheDocument();
    expect(
      screen.getByText('Seamless client onboarding and document generation for modern law firms.'),
    ).toBeInTheDocument();
    expect(screen.getByText('law firm crm')).toBeInTheDocument();
    expect(screen.getByText('legal intake automation')).toBeInTheDocument();
  });
});
