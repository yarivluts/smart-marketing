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

function renderDashboard(props: Partial<React.ComponentProps<typeof GrowthDashboard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GrowthDashboard
        orgId="org-123"
        projectId="proj-456"
        projectName="EasySign Growth"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('GrowthDashboard', () => {
  it('renders all question-led marketing and ROI intelligence sections in demo mode', () => {
    renderDashboard();

    // 1. Executive Title & Demo Mode Badge
    expect(screen.getByRole('heading', { name: 'EasySign Growth' })).toBeInTheDocument();
    expect(screen.getAllByText('Demo Preview').length).toBeGreaterThanOrEqual(1);

    // 2. Source Status Bar
    expect(screen.getByText('Data Sources & Tracking Status')).toBeInTheDocument();
    expect(screen.getByText('Website Tracking Pixel')).toBeInTheDocument();

    // 3. High level KPI ribbon
    expect(screen.getByText('Total Ad Spend')).toBeInTheDocument();
    expect(screen.getByText('Attributed Revenue')).toBeInTheDocument();
    expect(screen.getByText('Blended ROAS')).toBeInTheDocument();

    // 4. Question 1: Cross-Channel ROI
    expect(
      screen.getByRole('heading', { name: 'What is our ROI & return across ad channels?' }),
    ).toBeInTheDocument();

    // 5. Question 2: Campaign Leaderboard
    expect(
      screen.getByRole('heading', { name: 'What is our best-performing campaign cross-platform?' }),
    ).toBeInTheDocument();

    // 6. Question 3: Winning Creatives & Ads
    expect(
      screen.getByRole('heading', { name: 'What are our top-performing creative ads & copy?' }),
    ).toBeInTheDocument();

    // 7. Question 4: Audience Segmentation
    expect(
      screen.getByRole('heading', { name: 'Where are our conversions coming from? Audience Segmentation' }),
    ).toBeInTheDocument();

    // 8. Question 5: Funnel Analysis & Bottlenecks
    expect(
      screen.getByRole('heading', { name: 'Where are the conversion bottlenecks? Full Funnel Analysis' }),
    ).toBeInTheDocument();

    // 9. Question 6: Actionable Insights & AI Recommendations
    expect(
      screen.getByRole('heading', { name: 'Actionable Growth & ROI Insights' }),
    ).toBeInTheDocument();
  });

  it('allows toggling between Demo Preview and Live Data mode', () => {
    renderDashboard();

    // Switch to Live Mode
    const switchLiveBtn = screen.getByRole('button', { name: 'Switch to Live Data' });
    fireEvent.click(switchLiveBtn);

    // Should show Live Empty State when not connected
    expect(screen.getByText('No live marketing events received yet')).toBeInTheDocument();

    // Switch back to Demo Mode
    const switchDemoBtn = screen.getAllByRole('button', { name: 'Preview with Demo Data' })[0];
    fireEvent.click(switchDemoBtn);

    expect(screen.getByText('Total Ad Spend')).toBeInTheDocument();
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

    const connectBtn = screen.getAllByRole('button', { name: 'Connect Accounts / Snippet' })[0];
    fireEvent.click(connectBtn);

    expect(
      screen.getByRole('heading', { name: 'Connect Ad Channels & Website Tracking' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Copy Script').length).toBeGreaterThanOrEqual(1);

    // Close modal
    const closeBtn = screen.getByRole('button', { name: 'Done' });
    fireEvent.click(closeBtn);

    expect(
      screen.queryByRole('heading', { name: 'Connect Ad Channels & Website Tracking' }),
    ).not.toBeInTheDocument();
  });
});
