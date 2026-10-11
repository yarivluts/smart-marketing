import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
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

  /*
    This used to click 7 / 30 / 90 day pills and assert only that the report still rendered.
    The pills changed nothing but their highlight - spend is only measured over a trailing 30
    days - so "7 Days" relabelled 30-day spend. The report now states its one real window.
  */
  it('states the one window it measures instead of offering pills that relabel it', () => {
    renderWithIntl(<ExecutiveBlendedReport canExecute={true} />);

    expect(screen.queryByText('7 Days')).not.toBeInTheDocument();
    expect(screen.queryByText('90 Days')).not.toBeInTheDocument();
    expect(screen.getByTestId('report-window-label')).toHaveTextContent('Last 30 Days');
  });

  it('with no measured spend: no "Live" badge and no invented 50/50 channel split', () => {
    renderWithIntl(<ExecutiveBlendedReport canExecute={true} />);

    expect(screen.queryByTestId('zero-config-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('channel-allocation-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('channel-split-bar')).not.toBeInTheDocument();
    expect(screen.queryByText('(50%)')).not.toBeInTheDocument();
    expect(screen.getByTestId('total-spend-val')).toHaveTextContent('No data');
  });

  it('with measured spend: shows the live badge and the real channel split', () => {
    const metrics = createMockExecutiveMetrics({ metaSpendUsd: 750, googleSpendUsd: 250, totalSpendUsd: 1000 });
    renderWithIntl(<ExecutiveBlendedReport metrics={metrics} />);

    expect(screen.getByTestId('zero-config-badge')).toBeInTheDocument();
    expect(screen.getByTestId('channel-split-bar')).toBeInTheDocument();
    expect(screen.getByText('(75%)')).toBeInTheDocument();
    expect(screen.getByText('(25%)')).toBeInTheDocument();
  });
});
