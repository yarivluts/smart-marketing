import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MarketingAudiencesDashboard } from './marketing-audiences-dashboard';
import messages from '../../../messages/en.json';

describe('MarketingAudiencesDashboard', () => {
  it('renders all 5 predefined smart marketing audiences', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingAudiencesDashboard projectName="EasySign Growth" />
      </NextIntlClientProvider>,
    );

    // Header
    expect(
      screen.getByRole('heading', { name: 'Smart Audiences & Cohorts (EasySign Growth)' }),
    ).toBeInTheDocument();

    // 5 smart audiences
    expect(screen.getByText('🔥 High-Intent Cart & Form Abandoners')).toBeInTheDocument();
    expect(screen.getByText('💎 High-LTV VIP Repeat Buyers')).toBeInTheDocument();
    expect(screen.getByText('⚡ Expiring Free Trials (48h Left)')).toBeInTheDocument();
    expect(screen.getByText('💤 Dormant Churned Customers (60+ Days)')).toBeInTheDocument();
    expect(screen.getByText('🌟 Top 10% Converters (Lookalike Seed)')).toBeInTheDocument();

    // Sizing
    expect(screen.getByText('1,420')).toBeInTheDocument();
    expect(screen.getByText('840')).toBeInTheDocument();
  });
});
