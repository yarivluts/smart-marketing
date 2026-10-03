import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductTelemetryDashboard } from './product-telemetry-dashboard';

describe('ProductTelemetryDashboard', () => {
  it('renders stickiness scorecards, L28 histogram, and feature activation funnel', () => {
    render(<ProductTelemetryDashboard isDataConnected={true} />);

    expect(screen.getByTestId('product-telemetry-dashboard')).toBeDefined();
    expect(screen.getByText('DAU/MAU Stickiness, L28 Power Curve & Feature Activation')).toBeDefined();
    expect(screen.getByText('DAU / MAU Ratio (Stickiness)')).toBeDefined();
    expect(screen.getByText('38.4%')).toBeDefined();
    expect(screen.getByText('Daily Active Users (DAU)')).toBeDefined();
    expect(screen.getByText('Monthly Active Users (MAU)')).toBeDefined();
    expect(screen.getByText('Net Promoter Score (NPS)')).toBeDefined();
    expect(screen.getByText('L28 User Activity Distribution')).toBeDefined();
    expect(screen.getByText('Power Users')).toBeDefined();
    expect(screen.getByText('Core Product Feature Activation')).toBeDefined();
  });

  it('allows switching time range', () => {
    render(<ProductTelemetryDashboard isDataConnected={true} />);

    const l90Btn = screen.getByRole('button', { name: 'Last 90 Days' });
    fireEvent.click(l90Btn);
    expect(l90Btn.className).toContain('bg-primary');
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<ProductTelemetryDashboard isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
