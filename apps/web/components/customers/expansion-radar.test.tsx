import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExpansionRadar } from './expansion-radar';

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

  it('allows switching customer segments', () => {
    render(<ExpansionRadar isDataConnected={true} />);

    const enterpriseBtn = screen.getByRole('button', { name: /High-Potential Enterprise/i });
    fireEvent.click(enterpriseBtn);
    expect(enterpriseBtn.className).toContain('bg-primary');
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<ExpansionRadar isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
