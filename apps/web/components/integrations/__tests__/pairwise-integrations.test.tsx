import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '../../../tests/e2e/helpers/test-harness';
import { MissingIntegrationAlert } from './missing-integration-alert.test';
import { SetupModal } from './setup-modals-live-tester.test';
import { IntegrationsDirectory } from './integrations-directory.test';
import { resolveMetricPrerequisites, type ConnectorStatusRecord } from './missing-stream-detection.test';
import React from 'react';

describe('Tier 3: Pairwise Combinatorial Testing — Integrations & Alerts', () => {
  describe('Pairwise Matrix: Connector State x Alert Variant x Modal Step x Multi-Stream Dependencies', () => {
    it('T3-INT-01: Pairwise [Degraded Stripe Billing x Card Alert Variant x TROI Multi-Stream]', () => {
      const degradedConnectors: ConnectorStatusRecord[] = [
        {
          connectorId: 'stripe',
          name: 'Stripe',
          category: 'Billing',
          status: 'degraded',
          supportedEventTypes: ['customer_transaction', 'subscription_state_change'],
        },
        {
          connectorId: 'google_ads',
          name: 'Google Ads',
          category: 'Ads',
          status: 'active',
          supportedEventTypes: ['ad_spend'],
        },
      ];

      const resolution = resolveMetricPrerequisites('TROI', degradedConnectors);
      expect(resolution.isReady).toBe(false);

      renderWithIntl(
        <MissingIntegrationAlert
          requiredConnectors={resolution.missingConnectors}
          affectedMetrics={[resolution.metricKey]}
          missingDataPoints={resolution.missingDataPoints}
          variant="card"
          title="Degraded Stream Alert"
        />,
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Degraded Stream Alert')).toBeInTheDocument();
    });

    it('T3-INT-02: Pairwise [Missing Telemetry x Overlay Alert Variant x Funnel Route]', () => {
      const activeBillingOnly: ConnectorStatusRecord[] = [
        {
          connectorId: 'stripe',
          name: 'Stripe',
          category: 'Billing',
          status: 'active',
          supportedEventTypes: ['customer_transaction', 'subscription_state_change'],
        },
      ];

      const resolution = resolveMetricPrerequisites('CONVERSION_FUNNEL', activeBillingOnly);
      expect(resolution.isReady).toBe(false);

      renderWithIntl(
        <div style={{ position: 'relative', width: '300px', height: '200px' }}>
          <MissingIntegrationAlert
            requiredConnectors={resolution.missingConnectors}
            affectedMetrics={[resolution.metricKey]}
            missingDataPoints={resolution.missingDataPoints}
            variant="overlay"
          />
        </div>,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('absolute');
      expect(alert).toHaveClass('inset-0');
    });

    it('T3-INT-03: Pairwise [Active Connectors Directory x 4-Step Setup Modal Launch x Mock Emission]', async () => {
      const user = userEvent.setup();
      const onTestMock = vi.fn().mockResolvedValue({ success: true, eventId: 'evt_123' });

      renderWithIntl(
        <SetupModal
          isOpen={true}
          onClose={vi.fn()}
          connectorId="google_ads"
          connectorName="Google Ads"
          projectId="proj-p1"
          onTestEventEmit={onTestMock}
        />,
      );

      // Advance to step 4
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));

      const testBtn = screen.getByRole('button', { name: /Send Simulated Test Event/i });
      await user.click(testBtn);

      expect(onTestMock).toHaveBeenCalled();
    });

    it('T3-INT-04: Pairwise [All 4 Categories Filter x Real-time Search x Connect Trigger]', async () => {
      const user = userEvent.setup();
      const onSelectMock = vi.fn();

      renderWithIntl(
        <IntegrationsDirectory
          connectors={[
            {
              id: 'tiktok_ads',
              name: 'TikTok Ads',
              category: 'ads',
              description: 'TikTok video ads spend and conversion tracking.',
              status: 'available',
            },
          ]}
          onSelectConnector={onSelectMock}
        />,
      );

      const searchInput = screen.getByLabelText('Search connectors');
      await user.type(searchInput, 'TikTok');

      const connectBtn = screen.getByRole('button', { name: 'Connect' });
      await user.click(connectBtn);

      expect(onSelectMock).toHaveBeenCalledWith('tiktok_ads');
    });
  });
});
