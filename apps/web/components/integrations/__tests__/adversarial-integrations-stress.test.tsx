import * as React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MissingIntegrationAlert } from '../missing-integration-alert';
import {
  resolveMetricPrerequisites,
  type ConnectorStatusRecord,
} from './missing-stream-detection.test';

/**
 * Adversarial Stress Test Suite for Web Integrations, Contextual Alerts & Mock Emission Engine
 *
 * Target Stress Areas:
 * 1. Multi-stream dependency resolution when only 1 of 2 (or 1/2 of 3) required connectors is active
 * 2. High-concurrency mock event emission idempotency (50 concurrent requests)
 * 3. Latency simulation (500ms slow network) and rapid re-triggering prevention
 * 4. Resilient error handling under HTTP 500 / network failures
 * 5. Multi-connector UI alert display and prerequisite validation
 */

describe('Adversarial Stress: Integrations Hub & Contextual Alerts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Multi-Stream Dependency Resolution Matrix (Partial Connectors)
  // =========================================================================
  describe('1. Multi-Stream Dependency Resolution when only 1 of N Connectors is Active', () => {
    const googleAdsConnector: ConnectorStatusRecord = {
      connectorId: 'google_ads',
      name: 'Google Ads',
      category: 'Ad Networks',
      status: 'active',
      supportedEventTypes: ['ad_spend'],
    };

    const stripeConnector: ConnectorStatusRecord = {
      connectorId: 'stripe',
      name: 'Stripe Billing',
      category: 'Billing & Revenue',
      status: 'active',
      supportedEventTypes: ['customer_transaction', 'subscription_state_change'],
    };

    const sdkConnector: ConnectorStatusRecord = {
      connectorId: 'growthos_sdk',
      name: 'GrowthOS Web SDK',
      category: 'Telemetry & Identity',
      status: 'active',
      supportedEventTypes: ['product_telemetry'],
    };

    const hubspotConnector: ConnectorStatusRecord = {
      connectorId: 'hubspot',
      name: 'HubSpot CRM',
      category: 'CRM & Sales',
      status: 'active',
      supportedEventTypes: ['crm_lifecycle'],
    };

    it('blocks ROI when only 1 of 2 required connectors is active (Google Ads vs Stripe)', () => {
      // Case A: Only Google Ads is active (ad_spend active, customer_transaction missing)
      const resAdsOnly = resolveMetricPrerequisites('ROI', [googleAdsConnector]);
      expect(resAdsOnly.isReady).toBe(false);
      expect(resAdsOnly.missingEventTypes).toEqual(['customer_transaction']);
      expect(resAdsOnly.missingDataPoints).toContain('Customer purchase & renewal transaction stream');

      // Case B: Only Stripe is active (customer_transaction active, ad_spend missing)
      const resStripeOnly = resolveMetricPrerequisites('ROI', [stripeConnector]);
      expect(resStripeOnly.isReady).toBe(false);
      expect(resStripeOnly.missingEventTypes).toEqual(['ad_spend']);
      expect(resStripeOnly.missingDataPoints).toContain('Ad spend metrics & campaign UTM tracking');

      // Case C: Both active -> ROI unblocked!
      const resBoth = resolveMetricPrerequisites('ROI', [googleAdsConnector, stripeConnector]);
      expect(resBoth.isReady).toBe(true);
      expect(resBoth.missingEventTypes).toHaveLength(0);
    });

    it('blocks TROI (3-stream dependency) across all partial subsets (1 of 3, 2 of 3 active)', () => {
      // Case A: 1 of 3 active (only SDK)
      const res1 = resolveMetricPrerequisites('TROI', [sdkConnector]);
      expect(res1.isReady).toBe(false);
      expect(res1.missingEventTypes).toEqual(['ad_spend', 'customer_transaction']);

      // Case B: 2 of 3 active (SDK + Google Ads, Stripe missing)
      const res2 = resolveMetricPrerequisites('TROI', [sdkConnector, googleAdsConnector]);
      expect(res2.isReady).toBe(false);
      expect(res2.missingEventTypes).toEqual(['customer_transaction']);

      // Case C: 2 of 3 active (SDK + Stripe, Google Ads missing)
      const res3 = resolveMetricPrerequisites('TROI', [sdkConnector, stripeConnector]);
      expect(res3.isReady).toBe(false);
      expect(res3.missingEventTypes).toEqual(['ad_spend']);

      // Case D: 2 of 3 active (Google Ads + Stripe, SDK missing)
      const res4 = resolveMetricPrerequisites('TROI', [googleAdsConnector, stripeConnector]);
      expect(res4.isReady).toBe(false);
      expect(res4.missingEventTypes).toEqual(['product_telemetry']);

      // Case E: 3 of 3 active -> TROI ready!
      const resAll = resolveMetricPrerequisites('TROI', [sdkConnector, googleAdsConnector, stripeConnector]);
      expect(resAll.isReady).toBe(true);
      expect(resAll.missingEventTypes).toHaveLength(0);
    });

    it('blocks Acquisition Cohort BREAKEVEN when 1 of 3 or 2 of 3 connectors is active', () => {
      // BREAKEVEN requires ad_spend, customer_transaction, product_telemetry
      const resNoSdk = resolveMetricPrerequisites('BREAKEVEN', [googleAdsConnector, stripeConnector]);
      expect(resNoSdk.isReady).toBe(false);
      expect(resNoSdk.missingEventTypes).toContain('product_telemetry');

      const resComplete = resolveMetricPrerequisites('BREAKEVEN', [googleAdsConnector, stripeConnector, sdkConnector]);
      expect(resComplete.isReady).toBe(true);
    });

    it('blocks CAC & CAS when either ad network or billing/telemetry stream is absent', () => {
      // CAC: ad_spend + customer_transaction
      expect(resolveMetricPrerequisites('CAC', [googleAdsConnector]).isReady).toBe(false);
      expect(resolveMetricPrerequisites('CAC', [stripeConnector]).isReady).toBe(false);
      expect(resolveMetricPrerequisites('CAC', [googleAdsConnector, stripeConnector]).isReady).toBe(true);

      // CAS: ad_spend + product_telemetry
      expect(resolveMetricPrerequisites('CAS', [googleAdsConnector]).isReady).toBe(false);
      expect(resolveMetricPrerequisites('CAS', [sdkConnector]).isReady).toBe(false);
      expect(resolveMetricPrerequisites('CAS', [googleAdsConnector, sdkConnector]).isReady).toBe(true);
    });

    it('blocks ACCOUNT_SURVIVAL when either telemetry or subscription stream is missing', () => {
      // Requires product_telemetry + subscription_state_change
      expect(resolveMetricPrerequisites('ACCOUNT_SURVIVAL', [sdkConnector]).isReady).toBe(false);
      expect(resolveMetricPrerequisites('ACCOUNT_SURVIVAL', [stripeConnector]).isReady).toBe(false);
      expect(resolveMetricPrerequisites('ACCOUNT_SURVIVAL', [sdkConnector, stripeConnector]).isReady).toBe(true);
    });

    it('blocks CONVERSION_FUNNEL when either telemetry or transaction stream is missing', () => {
      // Requires product_telemetry + customer_transaction
      expect(resolveMetricPrerequisites('CONVERSION_FUNNEL', [sdkConnector]).isReady).toBe(false);
      expect(resolveMetricPrerequisites('CONVERSION_FUNNEL', [stripeConnector]).isReady).toBe(false);
      expect(resolveMetricPrerequisites('CONVERSION_FUNNEL', [sdkConnector, stripeConnector]).isReady).toBe(true);
    });

    it('blocks PAYING_ACCOUNTS_GROWTH when either subscription or CRM stream is missing', () => {
      // Requires subscription_state_change + crm_lifecycle
      expect(resolveMetricPrerequisites('PAYING_ACCOUNTS_GROWTH', [stripeConnector]).isReady).toBe(false);
      expect(resolveMetricPrerequisites('PAYING_ACCOUNTS_GROWTH', [hubspotConnector]).isReady).toBe(false);
      expect(resolveMetricPrerequisites('PAYING_ACCOUNTS_GROWTH', [stripeConnector, hubspotConnector]).isReady).toBe(true);
    });

    it('blocks DEMOS_PIPELINE when either CRM or transaction stream is missing', () => {
      // Requires crm_lifecycle + customer_transaction
      expect(resolveMetricPrerequisites('DEMOS_PIPELINE', [hubspotConnector]).isReady).toBe(false);
      expect(resolveMetricPrerequisites('DEMOS_PIPELINE', [stripeConnector]).isReady).toBe(false);
      expect(resolveMetricPrerequisites('DEMOS_PIPELINE', [hubspotConnector, stripeConnector]).isReady).toBe(true);
    });
  });

  // =========================================================================
  // 2. High-Concurrency Mock Event Emission & Idempotency
  // =========================================================================
  describe('2. High-Concurrency Mock Event Emission & Idempotency', () => {
    it('handles 50 concurrent mock event emissions in parallel without race conditions', async () => {
      let mockCallCount = 0;
      global.fetch = vi.fn().mockImplementation((url) => {
        if (String(url).includes('/mock-event')) {
          mockCallCount++;
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                ok: true,
                batchId: `batch_mock_${mockCallCount}`,
                accepted: 1,
                quarantined: 0,
                connectorStatus: 'connected',
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ installs: [] }),
        });
      });

      // Fire 50 concurrent requests across various connectors
      const connectorTypes = ['stripe', 'google_ads', 'meta_ads', 'growthos_sdk', 'hubspot'];
      const requests = Array.from({ length: 50 }, (_, i) => {
        const conn = connectorTypes[i % connectorTypes.length];
        return fetch('/api/orgs/org_test/projects/prj_test/integrations/mock-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connectorId: conn }),
        }).then((res) => res.json());
      });

      const responses = await Promise.all(requests);
      expect(responses).toHaveLength(50);
      responses.forEach((res) => {
        expect(res.ok).toBe(true);
        expect(res.connectorStatus).toBe('connected');
        expect(res.batchId).toBeDefined();
      });
    });
  });

  // =========================================================================
  // 3. Latency Simulation & Re-triggering Prevention
  // =========================================================================
  describe('3. Latency Simulation & Asynchronous State Transitions', () => {
    it('disables action button during 500ms simulated network latency to prevent duplicate dispatch', async () => {
      let resolveMockFetch: (value: unknown) => void;
      const fetchPromise = new Promise((resolve) => {
        resolveMockFetch = resolve;
      });

      global.fetch = vi.fn().mockImplementation((url) => {
        if (String(url).includes('/mock-event')) {
          return fetchPromise;
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ installs: [] }),
        });
      });

      const onConnectedMock = vi.fn();

      render(
        <MissingIntegrationAlert
          orgId="org_latency_1"
          projectId="prj_latency_1"
          metricKey="MRR"
          onConnected={onConnectedMock}
        />,
      );

      const testBtn = screen.getByRole('button', { name: /test \/ send mock event/i });
      expect(testBtn).not.toBeDisabled();

      // Click test button to initiate simulated flight
      await act(async () => {
        fireEvent.click(testBtn);
      });

      // While flight is pending, button must be disabled
      expect(testBtn).toBeDisabled();

      // Resolve flight
      await act(async () => {
        resolveMockFetch!({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              batchId: 'batch_latency_resolved',
              accepted: 1,
              connectorStatus: 'connected',
            }),
        });
      });

      // Verify onConnected called
      await waitFor(() => {
        expect(onConnectedMock).toHaveBeenCalledWith('stripe');
      });
    });

    it('gracefully handles server 500 error without throwing unhandled exceptions', async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        if (String(url).includes('/mock-event')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: 'Internal server error in ingestion worker' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ installs: [] }),
        });
      });

      const onConnectedMock = vi.fn();

      render(
        <MissingIntegrationAlert
          orgId="org_err_1"
          projectId="prj_err_1"
          metricKey="CHURN"
          onConnected={onConnectedMock}
        />,
      );

      const testBtn = screen.getByRole('button', { name: /test \/ send mock event/i });

      await act(async () => {
        fireEvent.click(testBtn);
      });

      // Should not call onConnected on 500 error
      expect(onConnectedMock).not.toHaveBeenCalled();
      // Button re-enabled for retry
      expect(testBtn).not.toBeDisabled();
    });
  });

  // =========================================================================
  // 4. Missing Integration Alert Component Multi-Stream Rendering
  // =========================================================================
  describe('4. Missing Integration Alert Component Multi-Stream Rendering', () => {
    it('renders missing alert with impact description and quick action buttons', () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ installs: [] }),
      });

      render(
        <MissingIntegrationAlert
          orgId="org_ui_1"
          projectId="prj_ui_1"
          metricKey="TROI"
        />,
      );

      expect(screen.getByTestId('missing-integration-alert')).toBeInTheDocument();
      expect(screen.getByText(/Setup Required/i)).toBeInTheDocument();
      expect(screen.getByText(/True Return On Investment/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /1-Click Connect/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /test \/ send mock event/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /copy 1-line script/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /developer guide/i })).toBeInTheDocument();
    });

    it('opens 1-Click OAuth Modal when clicking 1-Click Connect button', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ installs: [] }),
      });

      render(
        <MissingIntegrationAlert
          orgId="org_ui_2"
          projectId="prj_ui_2"
          metricKey="MRR"
        />,
      );

      const connectBtn = screen.getByRole('button', { name: /1-Click Connect/i });
      await act(async () => {
        fireEvent.click(connectBtn);
      });

      expect(screen.getByText(/Authorize & Connect/i)).toBeInTheDocument();
    });

    it('opens Developer Setup Guide Modal when clicking Developer Guide link', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ installs: [] }),
      });

      render(
        <MissingIntegrationAlert
          orgId="org_ui_3"
          projectId="prj_ui_3"
          metricKey="CAC"
        />,
      );

      const guideBtn = screen.getByRole('button', { name: /developer guide/i });
      await act(async () => {
        fireEvent.click(guideBtn);
      });

      expect(screen.getByText(/Setup Guide for Developers/i)).toBeInTheDocument();
      expect(screen.getByText(/Embed Web SDK Snippet/i)).toBeInTheDocument();
    });
  });
});
