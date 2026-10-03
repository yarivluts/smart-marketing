import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MrrWaterfallDashboard } from './mrr-waterfall-dashboard';

describe('MrrWaterfallDashboard', () => {
  it('renders MRR waterfall scorecards, steps, and decomposition', () => {
    render(<MrrWaterfallDashboard isDataConnected={true} />);

    expect(screen.getByTestId('mrr-waterfall-dashboard')).toBeDefined();
    expect(screen.getByText('MRR Growth Dynamics & Waterfall')).toBeDefined();
    expect(screen.getByText('Net MRR Churn')).toBeDefined();
    expect(screen.getByText('-0.4%')).toBeDefined();
    expect(screen.getByText('LTV / CAC Ratio')).toBeDefined();
    expect(screen.getByText('4.2x')).toBeDefined();
    expect(screen.getByText('Starting MRR')).toBeDefined();
    expect(screen.getByText('New MRR')).toBeDefined();
    expect(screen.getByText('Expansion MRR')).toBeDefined();
    expect(screen.getByText('Churn MRR')).toBeDefined();
    expect(screen.getByText('Ending MRR')).toBeDefined();
  });

  it('allows toggling timeframe', () => {
    render(<MrrWaterfallDashboard isDataConnected={true} />);

    const ytdBtn = screen.getByRole('button', { name: 'YTD' });
    fireEvent.click(ytdBtn);
    expect(ytdBtn.className).toContain('bg-primary');
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<MrrWaterfallDashboard isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
