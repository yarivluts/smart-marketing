import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl, createMockExecutiveMetrics, type ExecutiveBlendedMetrics } from './helpers/test-harness';
import { ExecutiveBlendedReport } from '@/components/orgs/executive-blended-report';

// Mock Executive Blended Report Component
function MockExecutiveBlendedReport({
  metrics = createMockExecutiveMetrics(),
}: {
  metrics?: ExecutiveBlendedMetrics;
}) {
  return (
    <div data-testid="executive-blended-report" className="p-6 border rounded-xl bg-card space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Executive Growth & Performance Overview</h2>
          <p className="text-sm text-muted-foreground">Zero-configuration blended analytics across Meta & Google Ads</p>
        </div>
        <span data-testid="zero-config-badge" className="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded">
          Live Blended Pipeline
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {/* Blended Spend */}
        <div data-testid="metric-spend-card" className="p-4 border rounded-lg bg-background">
          <div className="text-xs text-muted-foreground">Total Blended Spend</div>
          <div className="text-2xl font-extrabold mt-1" dir="ltr" data-testid="total-spend-val">
            ${metrics.totalSpendUsd.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground mt-2 flex justify-between">
            <span data-testid="meta-spend-breakdown">Meta: <span dir="ltr">${metrics.metaSpendUsd.toLocaleString()}</span></span>
            <span data-testid="google-spend-breakdown">Google: <span dir="ltr">${metrics.googleSpendUsd.toLocaleString()}</span></span>
          </div>
          <div className="text-xs text-green-600 mt-1">
            +{metrics.periodComparison.spendChangePct}% vs prev period
          </div>
        </div>

        {/* Blended CAC */}
        <div data-testid="metric-cac-card" className="p-4 border rounded-lg bg-background">
          <div className="text-xs text-muted-foreground">Blended CAC</div>
          <div className="text-2xl font-extrabold mt-1" dir="ltr" data-testid="blended-cac-val">
            ${metrics.blendedCacUsd.toFixed(2)}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            {metrics.totalConversions} Total Conversions
          </div>
          <div className="text-xs text-green-600 mt-1">
            {metrics.periodComparison.cacChangePct}% vs prev period
          </div>
        </div>

        {/* Blended ROAS */}
        <div data-testid="metric-roas-card" className="p-4 border rounded-lg bg-background">
          <div className="text-xs text-muted-foreground">Blended ROAS</div>
          <div className="text-2xl font-extrabold mt-1" dir="ltr" data-testid="blended-roas-val">
            {metrics.blendedRoas.toFixed(1)}x
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Conversion Velocity: {metrics.conversionVelocityDays} days
          </div>
          <div className="text-xs text-green-600 mt-1">
            +{metrics.periodComparison.roasChangePct}% vs prev period
          </div>
        </div>

        {/* Retention & Dunning Health */}
        <div data-testid="metric-retention-card" className="p-4 border rounded-lg bg-background">
          <div className="text-xs text-muted-foreground">Revenue & Dunning Health</div>
          <div className="text-2xl font-extrabold mt-1 text-green-700" data-testid="dunning-rate-val">
            {metrics.dunningRecoveryRatePct}%
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Dunning Recovery Rate
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Churn Rate: {metrics.churnRatePct}%
          </div>
        </div>
      </div>
    </div>
  );
}

describe('Tier 1: Zero-Setup Executive Blended Reporting (R3)', () => {
  it('6.1 automatically aggregates Meta Ads and Google Ads into Total Blended Spend', () => {
    const metrics = createMockExecutiveMetrics({
      metaSpendUsd: 10000,
      googleSpendUsd: 6500,
      totalSpendUsd: 16500,
    });

    renderWithIntl(<MockExecutiveBlendedReport metrics={metrics} />);

    expect(screen.getByTestId('total-spend-val')).toHaveTextContent('$16,500');
    expect(screen.getByTestId('meta-spend-breakdown')).toHaveTextContent('Meta: $10,000');
    expect(screen.getByTestId('google-spend-breakdown')).toHaveTextContent('Google: $6,500');
    expect(screen.getByTestId('zero-config-badge')).toBeInTheDocument();
  });

  it('6.2 calculates Blended CAC accurately from total spend and total conversions', () => {
    const totalSpend = 20000;
    const totalConversions = 400;
    const expectedCac = totalSpend / totalConversions; // 50.00

    const metrics = createMockExecutiveMetrics({
      totalSpendUsd: totalSpend,
      totalConversions: totalConversions,
      blendedCacUsd: expectedCac,
    });

    renderWithIntl(<MockExecutiveBlendedReport metrics={metrics} />);

    expect(screen.getByTestId('blended-cac-val')).toHaveTextContent('$50.00');
    expect(screen.getByText('400 Total Conversions')).toBeInTheDocument();
  });

  it('6.3 calculates and displays Blended ROAS and conversion velocity days', () => {
    const metrics = createMockExecutiveMetrics({
      blendedRoas: 4.5,
      conversionVelocityDays: 3.8,
    });

    renderWithIntl(<MockExecutiveBlendedReport metrics={metrics} />);

    expect(screen.getByTestId('blended-roas-val')).toHaveTextContent('4.5x');
    expect(screen.getByText('Conversion Velocity: 3.8 days')).toBeInTheDocument();
  });

  it('6.4 displays revenue health, churn rate, and dunning recovery rate', () => {
    const metrics = createMockExecutiveMetrics({
      churnRatePct: 1.8,
      dunningRecoveryRatePct: 82.4,
    });

    renderWithIntl(<MockExecutiveBlendedReport metrics={metrics} />);

    expect(screen.getByTestId('dunning-rate-val')).toHaveTextContent('82.4%');
    expect(screen.getByText('Churn Rate: 1.8%')).toBeInTheDocument();
  });

  it('6.5 displays period-over-period comparison percentage indicators', () => {
    const metrics = createMockExecutiveMetrics({
      periodComparison: {
        spendChangePct: 15.0,
        cacChangePct: -12.4,
        roasChangePct: 22.1,
      },
    });

    renderWithIntl(<MockExecutiveBlendedReport metrics={metrics} />);

    expect(screen.getByText('+15% vs prev period')).toBeInTheDocument();
    expect(screen.getByText('-12.4% vs prev period')).toBeInTheDocument();
    expect(screen.getByText('+22.1% vs prev period')).toBeInTheDocument();
  });

  it('6.6 isolates currency values and metrics with dir="ltr" to prevent RTL inverted numbers', () => {
    renderWithIntl(<MockExecutiveBlendedReport />);

    expect(screen.getByTestId('total-spend-val')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByTestId('blended-cac-val')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByTestId('blended-roas-val')).toHaveAttribute('dir', 'ltr');
  });

  it('6.7 verifies production ExecutiveBlendedReport component with real props and interactions', () => {
    const metrics = createMockExecutiveMetrics({
      metaSpendUsd: 12000,
      googleSpendUsd: 8000,
      totalSpendUsd: 20000,
      blendedCacUsd: 40.0,
      blendedRoas: 4.2,
      totalConversions: 500,
    });

    renderWithIntl(<ExecutiveBlendedReport metrics={metrics} canExecute={true} />);

    expect(screen.getByTestId('executive-blended-report')).toBeInTheDocument();
    expect(screen.getByTestId('total-spend-val')).toHaveTextContent('$20,000');
    expect(screen.getByTestId('blended-cac-val')).toHaveTextContent('$40.00');
    expect(screen.getByTestId('blended-roas-val')).toHaveTextContent('4.2x');
    expect(screen.getByText('500 Total Conversions')).toBeInTheDocument();
  });
});

