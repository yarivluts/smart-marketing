import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import { MissingIntegrationAlert } from './missing-integration-alert.test';
import { SetupModal } from './setup-modals-live-tester.test';
import { IntegrationsHealthStrip } from './integrations-health-strip.test';
import React from 'react';

// Simulated End-to-End Onboarding Journey Controller
export function OnboardingJourneyWorkspace() {
  const [connectors, setConnectors] = React.useState<Record<string, 'active' | 'missing'>>({
    stripe: 'missing',
    google_ads: 'missing',
  });
  const [setupModalOpen, setSetupModalOpen] = React.useState(false);
  const [targetConnector, setTargetConnector] = React.useState<string>('stripe');

  const allReady = Object.values(connectors).every((s) => s === 'active');
  const activeCount = Object.values(connectors).filter((s) => s === 'active').length;
  const missingCount = Object.values(connectors).filter((s) => s === 'missing').length;

  return (
    <div className="space-y-8 p-6" data-testid="onboarding-workspace">
      {/* 1. Health Overview Strip */}
      <IntegrationsHealthStrip
        stats={{
          activeCount,
          degradedCount: 0,
          missingCount,
          availableCount: 10,
        }}
      />

      {/* 2. Executive Pulse Screen with Contextual Guard */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="text-lg font-bold text-foreground mb-4">Executive Overview Pulse</h2>

        {!allReady ? (
          <MissingIntegrationAlert
            requiredConnectors={Object.keys(connectors).filter((k) => connectors[k] === 'missing')}
            affectedMetrics={['ROI', 'TROI', 'MRR_VELOCITY']}
            missingDataPoints={[
              'Customer transactions & billing webhooks (Stripe)',
              'Ad spend feeds & UTM campaigns (Google Ads)',
            ]}
            impactDescription="Executive Pulse core metrics require active Stripe and Google Ads connections."
            onConnect={(id) => {
              setTargetConnector(id);
              setSetupModalOpen(true);
            }}
            onEmitMock={async (id) => {
              setConnectors((prev) => ({ ...prev, [id]: 'active' }));
            }}
          />
        ) : (
          <div data-testid="pulse-kpis" className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-emerald-500/10 rounded-xl">MRR: $42,500</div>
            <div className="p-4 bg-emerald-500/10 rounded-xl">ROAS: 3.8x</div>
            <div className="p-4 bg-emerald-500/10 rounded-xl">TROI: 240%</div>
          </div>
        )}
      </div>

      {/* 3. Setup Modal Wizard */}
      <SetupModal
        isOpen={setupModalOpen}
        onClose={() => setSetupModalOpen(false)}
        connectorId={targetConnector}
        connectorName={targetConnector === 'stripe' ? 'Stripe Billing' : 'Google Ads'}
        projectId="fresh-saas-org-1"
        onTestEventEmit={async () => {
          setConnectors((prev) => ({ ...prev, [targetConnector]: 'active' }));
          return { success: true, eventId: `evt_mock_${Date.now()}` };
        }}
        onCompleteSetup={() => {
          setConnectors((prev) => ({ ...prev, [targetConnector]: 'active' }));
          setSetupModalOpen(false);
        }}
      />
    </div>
  );
}

describe('Tier 4: Scenario 1: Fresh SaaS Onboarding Journey', () => {
  it('F15..F23-T4-01: executes full onboarding journey from missing alert to live connected KPI state', async () => {
    const user = userEvent.setup();

    // Step 1: User lands on empty workspace with 2 missing integrations
    renderWithIntl(<OnboardingJourneyWorkspace />);

    expect(screen.getByRole('button', { name: 'Missing Prerequisites: 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active Streams: 0' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Executive Pulse core metrics require active Stripe and Google Ads connections/)).toBeInTheDocument();
    expect(screen.queryByTestId('pulse-kpis')).not.toBeInTheDocument();

    // Step 2: User clicks Connect STRIPE in alert banner -> opens setup wizard
    const connectStripeBtn = screen.getByRole('button', { name: /Connect STRIPE/i });
    await user.click(connectStripeBtn);

    expect(screen.getByRole('dialog', { name: /Setup Stripe Billing/i })).toBeInTheDocument();

    // Step 3: User advances to Step 4 and emits mock event
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const testEmitBtn = screen.getByRole('button', { name: /Send Simulated Test Event/i });
    await user.click(testEmitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Event received!/i)).toBeInTheDocument();
    });

    // Step 4: User clicks Complete Setup
    const completeBtn = screen.getByRole('button', { name: 'Complete Setup' });
    await user.click(completeBtn);

    // Modal closes and Stripe is now active (1 missing remaining)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active Streams: 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Missing Prerequisites: 1' })).toBeInTheDocument();

    // Step 5: User connects Google Ads via quick mock event button
    const mockEmitGoogleBtn = screen.getByRole('button', { name: /⚡ Send Mock Event/i });
    await user.click(mockEmitGoogleBtn);

    // Step 6: Verify instantaneous transition to Connected KPI cards and Active health status
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('pulse-kpis')).toBeInTheDocument();
      expect(screen.getByText('MRR: $42,500')).toBeInTheDocument();
      expect(screen.getByText('ROAS: 3.8x')).toBeInTheDocument();
      expect(screen.getByText('TROI: 240%')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Active Streams: 2' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Missing Prerequisites: 0' })).toBeInTheDocument();
    });
  });
});
