import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MarketingAudiencesDashboard, type SerializedSegment } from './marketing-audiences-dashboard';
import messages from '../../../messages/en.json';

const mockAudiences: SerializedSegment[] = [
  {
    id: 'seg-cart-abandoners',
    name: 'High-Intent Cart & Form Abandoners',
    schemaName: 'visitor',
    size: 1240,
    matchQuality: 94,
    channels: ['google', 'meta'],
    tactic: 'Deploy 4-hour dynamic checkout sequence',
    createdAt: '2026-08-24T10:00:00Z',
  },
  {
    id: 'seg-vip-buyers',
    name: 'High-LTV VIP Repeat Buyers',
    schemaName: 'customer',
    size: 342,
    matchQuality: 98,
    channels: ['meta', 'google', 'tiktok'],
    tactic: 'Exclusive VIP drop previews',
    createdAt: '2026-08-24T10:00:00Z',
  },
];

describe('MarketingAudiencesDashboard', () => {
  it('renders empty state when no audiences exist', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingAudiencesDashboard projectName="EasySign Growth" audiences={[]} />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole('heading', { name: 'Smart audiences for EasySign Growth' }),
    ).toBeInTheDocument();
  });

  it('renders audiences from database', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingAudiencesDashboard projectName="EasySign Growth" audiences={mockAudiences} />
      </NextIntlClientProvider>,
    );

    // Header
    expect(
      screen.getByRole('heading', { name: 'Smart Audiences & Cohorts (EasySign Growth)' }),
    ).toBeInTheDocument();

    // Audiences
    expect(screen.getByText('High-Intent Cart & Form Abandoners')).toBeInTheDocument();
    expect(screen.getByText('High-LTV VIP Repeat Buyers')).toBeInTheDocument();

    // Sizing
    expect(screen.getByText('1,240')).toBeInTheDocument();
    expect(screen.getByText('342')).toBeInTheDocument();
  });
});

