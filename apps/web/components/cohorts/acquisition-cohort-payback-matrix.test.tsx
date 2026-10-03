import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AcquisitionCohortPaybackMatrix } from './acquisition-cohort-payback-matrix';

describe('AcquisitionCohortPaybackMatrix', () => {
  it('renders spend, cash collected, breakeven, and maturation matrix', () => {
    render(<AcquisitionCohortPaybackMatrix isDataConnected={true} />);

    expect(screen.getByTestId('acquisition-cohort-payback-matrix')).toBeDefined();
    expect(screen.getByText('12/24-Month Acquisition Cohort & Payback Return Matrix')).toBeDefined();
    expect(screen.getByText('Total Marketing Spend')).toBeDefined();
    expect(screen.getByText('$142,800')).toBeDefined();
    expect(screen.getByText('Total Cash Collected')).toBeDefined();
    expect(screen.getByText('$594,200')).toBeDefined();
    expect(screen.getByText('Avg Breakeven Month')).toBeDefined();
    expect(screen.getByText('Month 2.8')).toBeDefined();
    expect(screen.getByText('Month 24 Cumulative Return')).toBeDefined();
    expect(screen.getAllByText('542%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Jan 2024')).toBeDefined();
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<AcquisitionCohortPaybackMatrix isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
