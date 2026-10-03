import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HotLeadsRadar } from './hot-leads-radar';

describe('HotLeadsRadar', () => {
  it('renders sales scorecards, hot leads radar table, and demo funnel', () => {
    render(<HotLeadsRadar isDataConnected={true} />);

    expect(screen.getByTestId('hot-leads-radar')).toBeDefined();
    expect(screen.getByText('Inbound Pipeline Value')).toBeDefined();
    expect(screen.getByText('$142,500')).toBeDefined();
    expect(screen.getByText('Self-Serve Conversion')).toBeDefined();
    expect(screen.getByText('Sales-Assisted Win Rate')).toBeDefined();
    expect(screen.getByText('Median Time to Close')).toBeDefined();
    expect(screen.getByText(/High-Intent "Hot Leads" Radar/)).toBeDefined();
    expect(screen.getByText('Crestview Law Firm')).toBeDefined();
    expect(screen.getByText('Inbound Demo Funnel')).toBeDefined();
  });

  it('allows claiming an unassigned lead', () => {
    render(<HotLeadsRadar isDataConnected={true} />);

    const claimButtons = screen.getAllByRole('button', { name: 'Claim Lead' });
    expect(claimButtons.length).toBeGreaterThan(0);

    fireEvent.click(claimButtons[0]);
    expect(screen.getByText('Claimed!')).toBeDefined();
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<HotLeadsRadar isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
