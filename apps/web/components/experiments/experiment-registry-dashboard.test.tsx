import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExperimentRegistryDashboard } from './experiment-registry-dashboard';

describe('ExperimentRegistryDashboard', () => {
  it('renders MTU usage, status filters, and experiment table', () => {
    render(<ExperimentRegistryDashboard isDataConnected={true} />);

    expect(screen.getByTestId('experiment-registry-dashboard')).toBeDefined();
    expect(screen.getByText('Experiment Registry & A/B Testing Hub')).toBeDefined();
    expect(screen.getByText(/42,100 \/ 100,000 MTUs/)).toBeDefined();
    expect(screen.getByText('Pricing Page - 30-Sec Signing Guarantee')).toBeDefined();
    expect(screen.getByText('Legal Landing Page - Testimonial Video Hook')).toBeDefined();
    expect(screen.getByText('Checkout Button Color & Copy')).toBeDefined();
  });

  it('allows deploying a winning variant to 100% traffic', () => {
    render(<ExperimentRegistryDashboard isDataConnected={true} />);

    const deployBtns = screen.getAllByRole('button', { name: /Deploy Winner/i });
    expect(deployBtns.length).toBeGreaterThan(0);

    fireEvent.click(deployBtns[0]);
    expect(screen.getAllByText('Deployed 100%').length).toBeGreaterThanOrEqual(1);
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<ExperimentRegistryDashboard isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
