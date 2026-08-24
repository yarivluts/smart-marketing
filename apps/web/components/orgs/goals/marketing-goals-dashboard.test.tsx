import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MarketingGoalsDashboard } from './marketing-goals-dashboard';
import messages from '../../../messages/en.json';

describe('MarketingGoalsDashboard', () => {
  it('renders predefined marketing goals out of the box', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingGoalsDashboard projectName="EasySign Growth" />
      </NextIntlClientProvider>,
    );

    // Header and title
    expect(screen.getByRole('heading', { name: 'Marketing Targets & Pacing (EasySign Growth)' })).toBeInTheDocument();

    // Predefined Goals
    expect(screen.getByText('🎯 Blended Cross-Channel ROAS')).toBeInTheDocument();
    expect(screen.getByText('🚀 Monthly Attributed Revenue')).toBeInTheDocument();
    expect(screen.getByText('📉 Blended Acquisition Cost (CAC)')).toBeInTheDocument();
    expect(screen.getByText('🔄 Trial-to-Paid Conversion Rate')).toBeInTheDocument();
    expect(screen.getByText('🛍️ Cart Abandonment Recovery')).toBeInTheDocument();
  });

  it('allows switching between 1-click strategy presets', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MarketingGoalsDashboard projectName="EasySign Growth" />
      </NextIntlClientProvider>,
    );

    // Switch to Aggressive Scale preset
    const scaleBtn = screen.getByRole('button', { name: /Aggressive Scaling/i });
    fireEvent.click(scaleBtn);
    expect(scaleBtn).toHaveClass('bg-primary');
    expect(screen.getByText('₪180,000')).toBeInTheDocument();

    // Switch to Market Penetration preset
    const leadGenBtn = screen.getByRole('button', { name: /Market Penetration/i });
    fireEvent.click(leadGenBtn);
    expect(leadGenBtn).toHaveClass('bg-primary');
    expect(screen.getByText('2.50x')).toBeInTheDocument();
  });
});
