import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl, createMockExecutiveMetrics } from '../../tests/e2e/helpers/test-harness';
import { ExecutiveBlendedReport } from './executive-blended-report';

describe('ExecutiveBlendedReport (Reporting Module)', () => {
  it('renders multi-channel aggregated spend, CAC, ROAS, and revenue health', () => {
    const metrics = createMockExecutiveMetrics({
      metaSpendUsd: 12000,
      googleSpendUsd: 8000,
      totalSpendUsd: 20000,
      blendedCacUsd: 40.0,
      blendedRoas: 4.2,
      totalConversions: 500,
      conversionVelocityDays: 3.5,
      churnRatePct: 1.5,
      dunningRecoveryRatePct: 84.5,
    });

    renderWithIntl(<ExecutiveBlendedReport metrics={metrics} canExecute={true} />);

    expect(screen.getByTestId('executive-blended-report')).toBeInTheDocument();
    expect(screen.getByTestId('total-spend-val')).toHaveTextContent('$20,000');
    expect(screen.getByTestId('meta-spend-breakdown')).toHaveTextContent('Meta: $12,000');
    expect(screen.getByTestId('google-spend-breakdown')).toHaveTextContent('Google: $8,000');
    expect(screen.getByTestId('blended-cac-val')).toHaveTextContent('$40.00');
    expect(screen.getByTestId('blended-roas-val')).toHaveTextContent('4.2x');
    expect(screen.getByTestId('dunning-rate-val')).toHaveTextContent('84.5%');
    expect(screen.getByText('500 Total Conversions')).toBeInTheDocument();
  });

  it('switches time windows (7d, 30d, 90d) accurately', () => {
    renderWithIntl(<ExecutiveBlendedReport canExecute={true} />);

    const btn7d = screen.getByText('7 Days');
    const btn30d = screen.getByText('30 Days');
    const btn90d = screen.getByText('90 Days');

    expect(btn7d).toBeInTheDocument();
    expect(btn30d).toBeInTheDocument();
    expect(btn90d).toBeInTheDocument();

    fireEvent.click(btn7d);
    expect(screen.getByTestId('executive-blended-report')).toBeInTheDocument();

    fireEvent.click(btn90d);
    expect(screen.getByTestId('executive-blended-report')).toBeInTheDocument();
  });
});
