import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MultiTouchAttributionMatrix } from './multi-touch-attribution-matrix';

describe('MultiTouchAttributionMatrix', () => {
  it('renders attribution channels, Shapley allocations, and journey pathways', () => {
    render(<MultiTouchAttributionMatrix isDataConnected={true} />);

    expect(screen.getByTestId('multi-touch-attribution-matrix')).toBeDefined();
    expect(screen.getByText('Multi-Touch Attribution Matrix')).toBeDefined();
    expect(screen.getByText('Meta Ads')).toBeDefined();
    expect(screen.getByText('Google Search Ads')).toBeDefined();
    expect(screen.getByText('TikTok UGC')).toBeDefined();
    expect(screen.getByText('Channel Credit Allocation Comparison')).toBeDefined();
    expect(screen.getByText('Top Converting Omnichannel Journey Pathways')).toBeDefined();
  });

  it('allows toggling lookback days', () => {
    render(<MultiTouchAttributionMatrix isDataConnected={true} />);

    const btn90 = screen.getByRole('button', { name: '90 Days' });
    fireEvent.click(btn90);
    expect(btn90.className).toContain('bg-primary');
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<MultiTouchAttributionMatrix isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
