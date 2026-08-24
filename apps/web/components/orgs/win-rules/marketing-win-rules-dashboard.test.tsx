import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MarketingWinRulesDashboard } from './marketing-win-rules-dashboard';
import messages from '../../../messages/en.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

describe('MarketingWinRulesDashboard', () => {
  it('renders marketing win triggers and live celebration stream', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingWinRulesDashboard
          orgId="JGTxet9aGXV6xUPWYidR"
          projectId="LYierelkF0eKnLmIrS9u"
          projectName="EasySign Growth"
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
    expect(screen.getByText('Enterprise License Closed!')).toBeInTheDocument();
    expect(screen.getByText('VIP High-Ticket Order!')).toBeInTheDocument();

    // Predefined triggers
    expect(
      screen.getByText('💼 Enterprise Contract / Annual SaaS License'),
    ).toBeInTheDocument();
    expect(screen.getByText('🛍️ High-Ticket E-Commerce Order')).toBeInTheDocument();
  });

  it('allows toggling win trigger rules', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingWinRulesDashboard
          orgId="JGTxet9aGXV6xUPWYidR"
          projectId="LYierelkF0eKnLmIrS9u"
          projectName="EasySign Growth"
        />
      </NextIntlClientProvider>,
    );

    const activeButtons = screen.getAllByRole('button', { name: 'Active' });
    expect(activeButtons.length).toBeGreaterThan(0);
    fireEvent.click(activeButtons[0]);
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeInTheDocument();
  });
});
