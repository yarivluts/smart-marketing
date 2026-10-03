import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CreativeFatigueRadar } from './creative-fatigue-radar';

describe('CreativeFatigueRadar', () => {
  it('renders creative assets, metrics, and fatigue indicators', () => {
    render(<CreativeFatigueRadar isDataConnected={true} />);

    expect(screen.getByTestId('creative-fatigue-radar')).toBeDefined();
    expect(screen.getByText('Creative Asset Performance & Fatigue Radar')).toBeDefined();
    expect(screen.getByText('Lawyer Testimonial 30s')).toBeDefined();
    expect(screen.getByText('Sign Contracts in Bed')).toBeDefined();
    expect(screen.getByText('3-Step Workflow Diagram')).toBeDefined();
    expect(screen.getByText(/1 Creative Fatigued/)).toBeDefined();
  });

  it('allows swapping a fatigued creative variant', () => {
    render(<CreativeFatigueRadar isDataConnected={true} />);

    const swapBtn = screen.getByRole('button', { name: /Swap with Hook #07/i });
    fireEvent.click(swapBtn);

    expect(screen.getByText(/Hook #07: Fast Signing \(Variant C\)/i)).toBeDefined();
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<CreativeFatigueRadar isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
