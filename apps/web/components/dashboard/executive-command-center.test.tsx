import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExecutiveCommandCenter } from './executive-command-center';

describe('ExecutiveCommandCenter', () => {
  it('renders the header, live badge, and 4 KPI scorecards', () => {
    render(<ExecutiveCommandCenter projectName="Acme SaaS" isDataConnected={true} />);

    expect(screen.getByTestId('executive-command-center')).toBeDefined();
    expect(screen.getByText('Executive Command Center')).toBeDefined();
    expect(screen.getByText(/Live 60s Stream/)).toBeDefined();
    expect(screen.getByText('Total Blended Spend')).toBeDefined();
    expect(screen.getByText('Blended ROAS')).toBeDefined();
    expect(screen.getByText('Marketing Efficiency (MER)')).toBeDefined();
    expect(screen.getByText('Net Contribution Margin')).toBeDefined();
  });

  it('allows toggling between time windows', () => {
    render(<ExecutiveCommandCenter isDataConnected={true} />);

    const todayBtn = screen.getByRole('button', { name: 'Today (Live)' });
    const yesterdayBtn = screen.getByRole('button', { name: 'Yesterday' });
    const sevenDaysBtn = screen.getByRole('button', { name: '7 Days' });

    expect(todayBtn).toBeDefined();
    fireEvent.click(yesterdayBtn);
    expect(yesterdayBtn.className).toContain('bg-pp-primary');

    fireEvent.click(sevenDaysBtn);
    expect(sevenDaysBtn.className).toContain('bg-pp-primary');
  });

  it('renders live conversion feed items and Copilot action', () => {
    const handleCopilot = vi.fn();
    const testFeed = [
      {
        id: '1',
        email: 'j.doe@example.com',
        action: 'purchased Enterprise Plan',
        platform: 'meta' as const,
        campaign: 'retargeting_v3',
        timeAgo: 'Just now',
        amount: '+$2,400',
        type: 'sale' as const,
      },
    ];

    render(
      <ExecutiveCommandCenter
        isDataConnected={true}
        onExecuteCopilotAction={handleCopilot}
        feedItems={testFeed}
      />
    );

    expect(screen.getByText('Live Conversion Feed')).toBeDefined();
    expect(screen.getByText(/j\.doe@example\.com/)).toBeDefined();

    const actionBtn = screen.getByRole('button', { name: /Execute 1-Click Rebalance/i });
    fireEvent.click(actionBtn);

    expect(handleCopilot).toHaveBeenCalledOnce();
    expect(screen.getByText(/Budget Reallocated Successfully/i)).toBeDefined();
  });

  it('renders honest empty state when feed is empty', () => {
    render(<ExecutiveCommandCenter isDataConnected={true} feedItems={[]} />);
    expect(screen.getByText('No Live Conversions Recorded Yet')).toBeDefined();
  });

  it('renders missing integration overlay when data is not connected', () => {
    render(
      <ExecutiveCommandCenter
        isDataConnected={false}
        missingConnectors={['stripe', 'google_ads']}
      />
    );

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
