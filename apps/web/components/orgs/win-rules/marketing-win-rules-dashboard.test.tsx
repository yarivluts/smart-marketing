import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import {
  MarketingWinRulesDashboard,
  type SerializedWinRule,
  type SerializedWinEvent,
} from './marketing-win-rules-dashboard';
import messages from '../../../messages/en.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

const mockRules: SerializedWinRule[] = [
  {
    id: 'wr-enterprise-deal',
    name: 'Enterprise Annual License Closed',
    schemaName: 'purchase',
    winType: 'enterprise_deal',
    active: true,
    label: 'Enterprise License',
    firedToday: 2,
  },
];

const mockEvents: SerializedWinEvent[] = [
  {
    id: 'we-001',
    winRuleName: 'Enterprise Annual License Closed',
    winType: 'enterprise_deal',
    title: 'EasySign — Enterprise License Closed!',
    amount: '₪12,400',
    occurredAt: '2026-08-24T09:47:00Z',
  },
];

describe('MarketingWinRulesDashboard', () => {
  it('renders marketing win triggers and live celebration stream', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingWinRulesDashboard
          orgId="JGTxet9aGXV6xUPWYidR"
          projectId="LYierelkF0eKnLmIrS9u"
          projectName="EasySign Growth"
          rules={mockRules}
          events={mockEvents}
        />
      </NextIntlClientProvider>,
    );

    // Header
    expect(
      screen.getByRole('heading', {
        name: 'Marketing Win Triggers & Live War Room (EasySign Growth)',
      }),
    ).toBeInTheDocument();

    // TV mode button
    expect(screen.getByRole('button', { name: /Launch War Room TV Mode/i })).toBeInTheDocument();

    // Live stream
    expect(screen.getByText('Live Marketing Wins Stream')).toBeInTheDocument();
    expect(screen.getByText('EasySign — Enterprise License Closed!')).toBeInTheDocument();
    expect(screen.getByText('₪12,400')).toBeInTheDocument();

    // Predefined triggers
    expect(screen.getAllByText('Enterprise Annual License Closed').length).toBeGreaterThan(0);
  });

  it('allows toggling win trigger rules', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingWinRulesDashboard
          orgId="JGTxet9aGXV6xUPWYidR"
          projectId="LYierelkF0eKnLmIrS9u"
          projectName="EasySign Growth"
          rules={mockRules}
          events={mockEvents}
        />
      </NextIntlClientProvider>,
    );

    const activeButtons = screen.getAllByRole('button', { name: 'Active' });
    fireEvent.click(activeButtons[0]!);
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeInTheDocument();
  });
});
