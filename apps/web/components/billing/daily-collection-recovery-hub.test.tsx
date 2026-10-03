import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DailyCollectionRecoveryHub } from './daily-collection-recovery-hub';

describe('DailyCollectionRecoveryHub', () => {
  it('renders recovery KPIs, pacing chart, and dunning queue', () => {
    render(<DailyCollectionRecoveryHub isDataConnected={true} />);

    expect(screen.getByTestId('daily-collection-recovery-hub')).toBeDefined();
    expect(screen.getByText('Daily Collection & Failed Charge Recovery Hub')).toBeDefined();
    expect(screen.getByText('Total Collected This Month')).toBeDefined();
    expect(screen.getByText('$198,450')).toBeDefined();
    expect(screen.getByText('Failed Recurring Charges')).toBeDefined();
    expect(screen.getByText('$8,420')).toBeDefined();
    expect(screen.getByText('Successfully Recovered')).toBeDefined();
    expect(screen.getByText('+$6,140')).toBeDefined();
    expect(screen.getByText('Involuntary Churn Prevented')).toBeDefined();
    expect(screen.getByText('TechFlow Systems')).toBeDefined();
  });

  it('allows retrying a failed charge', () => {
    render(<DailyCollectionRecoveryHub isDataConnected={true} />);

    const retryBtn = screen.getAllByRole('button', { name: /Retry Now/i });
    expect(retryBtn.length).toBeGreaterThan(0);

    fireEvent.click(retryBtn[0]);
    expect(screen.getByText(/Retrying.../i)).toBeDefined();
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<DailyCollectionRecoveryHub isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
