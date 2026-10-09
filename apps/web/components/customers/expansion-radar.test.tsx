import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExpansionRadar } from './expansion-radar';
import type { CustomerExpansionSummary } from '@growthos/shared';

describe('ExpansionRadar', () => {
  it('renders expansion scorecards, tier migration waterfall, and recent upgrades feed', () => {
    render(<ExpansionRadar isDataConnected={true} />);

    expect(screen.getByTestId('expansion-radar')).toBeDefined();
    expect(screen.getByText('Account Size Distribution & Upgrade Expansion Potential')).toBeDefined();
    expect(screen.getByText('High Expansion Potential')).toBeDefined();
    expect(screen.getByText('248')).toBeDefined();
    expect(screen.getByText('Average Expansion Speed')).toBeDefined();
    expect(screen.getByText('Plan Tier Migration Waterfall')).toBeDefined();
    expect(screen.getByText('Recent Upgrades Feed')).toBeDefined();
    expect(screen.getByText('Vanguard Legal Partners')).toBeDefined();
  });

  it('allows switching customer segments and filters feed items', () => {
    render(<ExpansionRadar isDataConnected={true} />);

    const enterpriseBtn = screen.getByRole('button', { name: /High-Potential Enterprise/i });
    fireEvent.click(enterpriseBtn);
    expect(enterpriseBtn.className).toContain('bg-primary');

    // In enterprise segment, Northwest should be present and Vanguard (self_serve) should be hidden
    expect(screen.getByText('Northwest Real Estate LLC')).toBeDefined();
    expect(screen.queryByText('Vanguard Legal Partners')).toBeNull();

    // Switch to self serve
    const selfServeBtn = screen.getByRole('button', { name: /Self-Serve Upgrades/i });
    fireEvent.click(selfServeBtn);
    expect(selfServeBtn.className).toContain('bg-primary');
    expect(screen.getByText('Vanguard Legal Partners')).toBeDefined();
    expect(screen.queryByText('Northwest Real Estate LLC')).toBeNull();
  });

  it('renders custom initialTelemetry when passed', () => {
    const customTelemetry: CustomerExpansionSummary = {
      highExpansionPotentialCount: 312,
      potentialMrrLift: 52000,
      avgExpansionSpeedDays: 28,
      largeTeamAccountsCount: 110,
      upgradePenetrationRate: 41.5,
      tierDistribution: {
        free: 1500,
        starter: 900,
        pro: 600,
        enterprise: 120,
      },
      recentEvents: [
        {
          id: 'exp-custom-1',
          organizationId: 'org-test',
          projectId: 'proj-test',
          customerId: 'cust-99',
          accountName: 'Custom Biotech Labs',
          fromTier: 'Pro ($199)',
          toTier: 'Enterprise ($650)',
          previousMrr: 199,
          currentMrr: 650,
          mrrDelta: 451,
          movementType: 'expansion',
          direction: 'upgrade',
          segment: 'enterprise',
          velocityScore: 98,
          triggerReason: 'Custom compliance & dedicated IP',
          recordedAt: new Date().toISOString(),
          timeAgo: 'Just now',
        },
      ],
    };

    render(<ExpansionRadar isDataConnected={true} initialTelemetry={customTelemetry} />);

    expect(screen.getByText('312')).toBeDefined();
    expect(screen.getByText('+$52,000 potential MRR lift')).toBeDefined();
    expect(screen.getByText('28')).toBeDefined();
    expect(screen.getByText('110')).toBeDefined();
    expect(screen.getByText('41.5%')).toBeDefined();
    expect(screen.getByText('Custom Biotech Labs')).toBeDefined();
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<ExpansionRadar isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
