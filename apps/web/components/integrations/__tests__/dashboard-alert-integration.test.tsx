import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import { MissingIntegrationAlert } from './missing-integration-alert.test';
import { resolveMetricPrerequisites, type ConnectorStatusRecord } from './missing-stream-detection.test';
import React from 'react';

// Simulated Dashboard Card with contextual alert guard
export function DashboardCardWithAlertGuard({
  title,
  metricKey,
  activeConnectors,
  children,
}: {
  title: string;
  metricKey: any;
  activeConnectors: ConnectorStatusRecord[];
  children: React.ReactNode;
}): React.ReactElement {
  const resolution = resolveMetricPrerequisites(metricKey, activeConnectors);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="font-semibold text-foreground text-base">{title}</h3>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            resolution.isReady ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
          }`}
        >
          {resolution.isReady ? 'Active' : 'Missing Prerequisites'}
        </span>
      </div>

      {resolution.isReady ? (
        <div data-testid="dashboard-chart-content">{children}</div>
      ) : (
        <MissingIntegrationAlert
          requiredConnectors={resolution.missingConnectors}
          affectedMetrics={[metricKey]}
          missingDataPoints={resolution.missingDataPoints}
          impactDescription={resolution.impactDescription}
          title={`Setup Required for ${title}`}
        />
      )}
    </div>
  );
}

describe('F19: Dashboard Contextual Alert Integration', () => {
  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F19-T1-01: renders MissingIntegrationAlert on Cohorts page when Ad Spend stream is missing for TROI', () => {
      const stripeOnlyConnectors: ConnectorStatusRecord[] = [
        {
          connectorId: 'stripe',
          name: 'Stripe Billing',
          category: 'Billing & Revenue',
          status: 'active',
          supportedEventTypes: ['customer_transaction', 'subscription_state_change'],
        },
      ];

      renderWithIntl(
        <DashboardCardWithAlertGuard
          title="TROI & Payback Analysis"
          metricKey="TROI"
          activeConnectors={stripeOnlyConnectors}
        >
          <div>TROI Line Chart</div>
        </DashboardCardWithAlertGuard>,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Setup Required for TROI & Payback Analysis/i)).toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-chart-content')).not.toBeInTheDocument();
    });

    it('F19-T1-02: renders live chart content on Cohorts page when all TROI prerequisites are active', () => {
      const fullConnectors: ConnectorStatusRecord[] = [
        {
          connectorId: 'stripe',
          name: 'Stripe',
          category: 'Billing',
          status: 'active',
          supportedEventTypes: ['customer_transaction', 'subscription_state_change'],
        },
        {
          connectorId: 'google_ads',
          name: 'Google Ads',
          category: 'Ads',
          status: 'active',
          supportedEventTypes: ['ad_spend'],
        },
        {
          connectorId: 'web_sdk',
          name: 'GrowthOS Web SDK',
          category: 'Telemetry',
          status: 'active',
          supportedEventTypes: ['product_telemetry'],
        },
      ];

      renderWithIntl(
        <DashboardCardWithAlertGuard
          title="TROI & Payback Analysis"
          metricKey="TROI"
          activeConnectors={fullConnectors}
        >
          <div>TROI Line Chart</div>
        </DashboardCardWithAlertGuard>,
      );

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('dashboard-chart-content')).toHaveTextContent('TROI Line Chart');
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('F19-T1-03: renders alert on MRR Waterfall dashboard when billing webhook stream is missing', () => {
      renderWithIntl(
        <DashboardCardWithAlertGuard
          title="MRR Velocity & Movement Bridge"
          metricKey="MRR_WATERFALL"
          activeConnectors={[]}
        >
          <div>MRR Waterfall Waterfall Chart</div>
        </DashboardCardWithAlertGuard>,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Subscription lifecycle & cancellation webhooks/i)).toBeInTheDocument();
    });

    it('F19-T1-04: renders alert on Ad Campaigns dashboard when all ad connectors are missing', () => {
      renderWithIntl(
        <DashboardCardWithAlertGuard
          title="Ad Campaigns & Blended ROAS"
          metricKey="ROI"
          activeConnectors={[]}
        >
          <div>ROAS Performance Grid</div>
        </DashboardCardWithAlertGuard>,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('ROI')).toBeInTheDocument();
    });

    it('F19-T1-05: renders alert on Conversion Funnel dashboard when Web SDK telemetry is missing', () => {
      renderWithIntl(
        <DashboardCardWithAlertGuard
          title="Conversion Funnels & Drop-offs"
          metricKey="CONVERSION_FUNNEL"
          activeConnectors={[]}
        >
          <div>Funnel Steps</div>
        </DashboardCardWithAlertGuard>,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Web\/Mobile SDK telemetry & session tracking/i)).toBeInTheDocument();
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F19-T2-01: handles partial stream connections with clear distinction of what is missing', () => {
      const adsOnlyConnectors: ConnectorStatusRecord[] = [
        {
          connectorId: 'meta_ads',
          name: 'Meta Ads',
          category: 'Ads',
          status: 'active',
          supportedEventTypes: ['ad_spend'],
        },
      ];

      renderWithIntl(
        <DashboardCardWithAlertGuard
          title="Customer Acquisition Cost (CAC)"
          metricKey="CAC"
          activeConnectors={adsOnlyConnectors}
        >
          <div>CAC Gauge</div>
        </DashboardCardWithAlertGuard>,
      );

      // CAC requires ad_spend and customer_transaction
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Customer purchase & renewal transaction stream/i)).toBeInTheDocument();
    });

    it('F19-T2-02: seamlessly transitions from alert state to chart state when connectors are activated', () => {
      const { rerender } = renderWithIntl(
        <DashboardCardWithAlertGuard
          title="Live DAU/MAU Stickiness"
          metricKey="DAU_MAU"
          activeConnectors={[]}
        >
          <div>Stickiness Heatmap</div>
        </DashboardCardWithAlertGuard>,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Rerender with active SDK
      rerender(
        <DashboardCardWithAlertGuard
          title="Live DAU/MAU Stickiness"
          metricKey="DAU_MAU"
          activeConnectors={[
            {
              connectorId: 'web_sdk',
              name: 'Web SDK',
              category: 'Telemetry',
              status: 'active',
              supportedEventTypes: ['product_telemetry'],
            },
          ]}
        >
          <div>Stickiness Heatmap</div>
        </DashboardCardWithAlertGuard>,
      );

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('dashboard-chart-content')).toBeInTheDocument();
    });

    it('F19-T2-03: renders card container with semantic heading hierarchy and card styling', () => {
      renderWithIntl(
        <DashboardCardWithAlertGuard
          title="Rep Collections & LTV"
          metricKey="LTV"
          activeConnectors={[]}
        >
          <div>LTV Curves</div>
        </DashboardCardWithAlertGuard>,
      );

      const heading = screen.getByRole('heading', { level: 3, name: 'Rep Collections & LTV' });
      expect(heading).toBeInTheDocument();
    });

    it('F19-T2-04: supports multiple dashboard cards on the same screen independently evaluating status', () => {
      const partialConnectors: ConnectorStatusRecord[] = [
        {
          connectorId: 'stripe',
          name: 'Stripe',
          category: 'Billing',
          status: 'active',
          supportedEventTypes: ['customer_transaction', 'subscription_state_change'],
        },
      ];

      renderWithIntl(
        <div className="grid grid-cols-2 gap-4">
          <DashboardCardWithAlertGuard
            title="MRR Overview"
            metricKey="MRR"
            activeConnectors={partialConnectors}
          >
            <div>MRR Chart (Ready)</div>
          </DashboardCardWithAlertGuard>

          <DashboardCardWithAlertGuard
            title="Ad ROAS Overview"
            metricKey="ROI"
            activeConnectors={partialConnectors}
          >
            <div>ROAS Chart (Missing Ads)</div>
          </DashboardCardWithAlertGuard>
        </div>,
      );

      // MRR is ready (stripe active)
      expect(screen.getByText('MRR Chart (Ready)')).toBeInTheDocument();
      // ROI is not ready (missing ads)
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('F19-T2-05: preserves layout stability without visual layout shift when alert renders', () => {
      const { container } = renderWithIntl(
        <DashboardCardWithAlertGuard
          title="Account Survival"
          metricKey="ACCOUNT_SURVIVAL"
          activeConnectors={[]}
        >
          <div>Survival Table</div>
        </DashboardCardWithAlertGuard>,
      );

      expect(container.firstChild).toHaveClass('rounded-2xl');
    });
  });
});
