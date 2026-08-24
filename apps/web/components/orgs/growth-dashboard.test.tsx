import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { GrowthDashboard } from './growth-dashboard';
import messages from '../../messages/en.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GrowthDashboard orgId="org-123" projectId="proj-456" projectName="E-Commerce Core" />
    </NextIntlClientProvider>,
  );
}

describe('GrowthDashboard', () => {
  it('renders all question-led marketing and ROI intelligence sections', () => {
    renderDashboard();

    // 1. Executive Title & Connection Status
    expect(screen.getByRole('heading', { name: 'E-Commerce Core' })).toBeInTheDocument();
    expect(screen.getByText('Auto-Tracking Active')).toBeInTheDocument();

    // 2. High level KPI ribbon
    expect(screen.getByText('Total Ad Spend')).toBeInTheDocument();
    expect(screen.getByText('Attributed Revenue')).toBeInTheDocument();
    expect(screen.getByText('Blended ROAS')).toBeInTheDocument();

    // 3. Question 1: Cross-Channel ROI
    expect(
      screen.getByRole('heading', { name: 'What is our ROI & return across ad channels?' }),
    ).toBeInTheDocument();

    // 4. Question 2: Campaign Leaderboard
    expect(
      screen.getByRole('heading', { name: 'What is our best-performing campaign cross-platform?' }),
    ).toBeInTheDocument();

    // 5. Question 3: Winning Creatives & Ads
    expect(
      screen.getByRole('heading', { name: 'What are our top-performing creative ads & copy?' }),
    ).toBeInTheDocument();

    // 6. Question 4: Audience Segmentation
    expect(
      screen.getByRole('heading', { name: 'Where are our conversions coming from? Audience Segmentation' }),
    ).toBeInTheDocument();

    // 7. Question 5: Funnel Analysis & Bottlenecks
    expect(
      screen.getByRole('heading', { name: 'Where are the conversion bottlenecks? Full Funnel Analysis' }),
    ).toBeInTheDocument();

    // 8. Question 6: Actionable Insights & AI Recommendations
    expect(
      screen.getByRole('heading', { name: 'Actionable Growth & ROI Insights' }),
    ).toBeInTheDocument();
  });

  it('updates data when switching date range and channel filters', () => {
    renderDashboard();

    // Click 7 Days date range
    const btn7d = screen.getByRole('button', { name: 'Last 7 Days' });
    fireEvent.click(btn7d);
    expect(btn7d).toHaveClass('bg-primary');

    // Click Google Ads channel filter
    const btnGoogle = screen.getByRole('button', { name: 'Google Ads' });
    fireEvent.click(btnGoogle);
    expect(btnGoogle).toHaveClass('bg-foreground');
  });

  it('opens and closes the tracking code & connections modal', () => {
    renderDashboard();

    const connectBtn = screen.getByRole('button', { name: 'Connect Accounts / Snippet' });
    fireEvent.click(connectBtn);

    expect(
      screen.getByRole('heading', { name: 'Connect Ad Channels & Website Tracking' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Copy Script')).toBeInTheDocument();

    // Close modal
    const closeBtn = screen.getByRole('button', { name: 'Done' });
    fireEvent.click(closeBtn);

    expect(
      screen.queryByRole('heading', { name: 'Connect Ad Channels & Website Tracking' }),
    ).not.toBeInTheDocument();
  });
});
