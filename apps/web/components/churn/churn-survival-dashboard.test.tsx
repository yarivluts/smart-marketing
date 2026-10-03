import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChurnSurvivalDashboard } from './churn-survival-dashboard';

describe('ChurnSurvivalDashboard', () => {
  it('renders scorecards, Kaplan-Meier curves, and churn diagnostics', () => {
    render(<ChurnSurvivalDashboard isDataConnected={true} />);

    expect(screen.getByTestId('churn-survival-dashboard')).toBeDefined();
    expect(screen.getByText('Customer Survival Curves & Churn Diagnostics')).toBeDefined();
    expect(screen.getByText('Net MRR Churn Rate')).toBeDefined();
    expect(screen.getByText('-0.4%')).toBeDefined();
    expect(screen.getByText('Gross MRR Churn Rate')).toBeDefined();
    expect(screen.getByText('Customer Logo Churn')).toBeDefined();
    expect(screen.getByText('365-Day Retention Rate')).toBeDefined();
    expect(screen.getByText('Customer Survival Probability Over Time (Days 0 to 365)')).toBeDefined();
    expect(screen.getByText('Nexus Logistics')).toBeDefined();
  });

  it('allows sending a win-back offer to a churned customer', () => {
    render(<ChurnSurvivalDashboard isDataConnected={true} />);

    const offerBtn = screen.getAllByRole('button', { name: /Send Offer/i });
    expect(offerBtn.length).toBeGreaterThan(0);

    fireEvent.click(offerBtn[0]);
    expect(screen.getByText('Offer Sent')).toBeDefined();
  });

  it('renders missing integration overlay when disconnected', () => {
    render(<ChurnSurvivalDashboard isDataConnected={false} />);

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
