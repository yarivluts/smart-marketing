import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
  });

  it('allows changing the industry filter and compare target', () => {
    render(<PeerBenchmarksHub isDataConnected={true} />);

    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(2);

    fireEvent.change(selects[0], { target: { value: 'ecommerce' } });
    expect((selects[0] as HTMLSelectElement).value).toBe('ecommerce');
  });

  it('renders missing integration overlay when data is disconnected', () => {
    render(<PeerBenchmarksHub isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
