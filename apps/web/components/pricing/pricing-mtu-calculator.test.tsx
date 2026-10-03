import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PricingMtuCalculator } from './pricing-mtu-calculator';

describe('PricingMtuCalculator', () => {
  it('renders MTU slider, tier recommendation, and 3 tiers', () => {
    render(<PricingMtuCalculator />);

    expect(screen.getByTestId('pricing-mtu-calculator')).toBeDefined();
    expect(screen.getByText('Only Pay for Visitors in Active Experiments.')).toBeDefined();
    expect(screen.getByText('Estimate Your Monthly Tested Users (MTUs)')).toBeDefined();
    expect(screen.getByText('Free Sandbox')).toBeDefined();
    expect(screen.getAllByText('Growth Scale').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Enterprise Unlimited')).toBeDefined();
  });

  it('allows toggling annual/monthly billing', () => {
    render(<PricingMtuCalculator />);

    const toggle = screen.getByRole('switch');
    expect(toggle).toBeDefined();

    // Defaults to annual (true)
    expect(screen.getByText('$224')).toBeDefined();

    // Toggle to monthly
    fireEvent.click(toggle);
    expect(screen.getByText('$299')).toBeDefined();
  });
});
