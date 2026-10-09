import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computePeerBenchmarkTelemetry } from '@growthos/shared';
import { PeerBenchmarksHub } from './peer-benchmarks-hub';

describe('PeerBenchmarksHub', () => {
  it('renders benchmark cards, industry filters, and distribution charts', () => {
    render(<PeerBenchmarksHub isDataConnected={true} />);

    expect(screen.getByTestId('peer-benchmarks-hub')).toBeDefined();
    expect(screen.getByText('Dynamic Peer Benchmarks')).toBeDefined();
    expect(screen.getByText('(20,000+ Active Brands Like Yours)')).toBeDefined();
    expect(screen.getByText('Sales Return')).toBeDefined();
    expect(screen.getByText('Cost to Get a Customer')).toBeDefined();
    expect(screen.getByText('Landing Page Success Rate')).toBeDefined();
    expect(screen.getByText('Ad Click-Through Rate')).toBeDefined();
    expect(screen.getByText('ROAS Distribution')).toBeDefined();
    expect(screen.getByText('CAC Efficiency Pacing')).toBeDefined();
    expect(screen.getByText(/Customer Loyalty Over Time/)).toBeDefined();
    expect(screen.getByText(/k-Anonymity Verified/)).toBeDefined();
    expect(screen.getByText('Algorithmic Growth Guidance')).toBeDefined();
  });

  it('allows changing the industry filter and compare target', () => {
    render(<PeerBenchmarksHub isDataConnected={true} />);

    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(2);

    fireEvent.change(selects[0], { target: { value: 'ecommerce' } });
    expect((selects[0] as HTMLSelectElement).value).toBe('ecommerce');

    fireEvent.change(selects[1], { target: { value: 'top10' } });
    expect((selects[1] as HTMLSelectElement).value).toBe('top10');
  });

  it('renders missing integration overlay when data is disconnected', () => {
    render(<PeerBenchmarksHub isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });

  it('renders privacy protection empty state when k-anonymity fails', () => {
    const insufficientTelemetry = computePeerBenchmarkTelemetry({}, { sampleMerchantCount: 3 });

    render(
      <PeerBenchmarksHub
        isDataConnected={true}
        initialTelemetry={insufficientTelemetry}
      />,
    );

    expect(screen.getByText('Cohort Telemetry Under Privacy Threshold')).toBeDefined();
    expect(screen.getByText('Insufficient Cohort Sample Size')).toBeDefined();
  });

  it('renders custom project metrics when provided in initialTelemetry', () => {
    const customTelemetry = computePeerBenchmarkTelemetry(
      { roas: 4.85, cac: 55, conversionRate: 6.2, ctr: 3.1 },
      { industry: 'fintech' },
    );

    render(
      <PeerBenchmarksHub
        isDataConnected={true}
        initialTelemetry={customTelemetry}
      />,
    );

    expect(screen.getByText('4.85x')).toBeDefined();
    expect(screen.getAllByText('$55').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('6.2%')).toBeDefined();
    expect(screen.getByText('3.1%')).toBeDefined();
  });
});
