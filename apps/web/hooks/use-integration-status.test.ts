import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useIntegrationStatus } from './use-integration-status';

describe('useIntegrationStatus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly maps missing connectors, missing fields, and affected metrics for MRR', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ installs: [] }),
    });

    const { result } = renderHook(() =>
      useIntegrationStatus({
        orgId: 'org_test_1',
        projectId: 'prj_test_1',
        metricKey: 'MRR',
      }),
    );

    await waitFor(() => {
      expect(result.current.isConnectorActive('stripe')).toBe(false);
    });

    expect(result.current.isCurrentMetricReady).toBe(false);
    expect(result.current.currentMetricGap).toBeDefined();
    expect(result.current.currentMetricGap?.name).toBe('Monthly Recurring Revenue (MRR)');
    expect(result.current.currentMetricGap?.requiredConnectors).toContain('stripe');
    expect(result.current.currentMetricGap?.missingEventTypes).toContain('subscription_state_change');
  });

  it('recognizes initialActiveConnectors as connected', () => {
    const { result } = renderHook(() =>
      useIntegrationStatus({
        orgId: 'org_test_2',
        projectId: 'prj_test_2',
        metricKey: 'CAC',
        initialActiveConnectors: ['google_ads', 'stripe'],
      }),
    );

    expect(result.current.isConnectorActive('google_ads')).toBe(true);
    expect(result.current.isConnectorActive('stripe')).toBe(true);
    expect(result.current.isCurrentMetricReady).toBe(true);
    expect(result.current.currentMetricGap?.isComplete).toBe(true);
  });

  it('emits mock event and instantaneously updates status to connected', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/mock-event')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              batchId: 'batch_test_777',
              accepted: 1,
              connectorStatus: 'connected',
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ installs: [] }),
      });
    });

    const { result } = renderHook(() =>
      useIntegrationStatus({
        orgId: 'org_test_3',
        projectId: 'prj_test_3',
        metricKey: 'CONVERSION_FUNNEL',
      }),
    );

    expect(result.current.isConnectorActive('growthos_sdk')).toBe(false);

    let res: unknown;
    await act(async () => {
      res = await result.current.emitMockEvent('growthos_sdk', 'product_telemetry');
    });

    expect(res).toEqual(
      expect.objectContaining({
        ok: true,
        connectorStatus: 'connected',
      }),
    );
    expect(result.current.isConnectorActive('growthos_sdk')).toBe(true);
    expect(result.current.isCurrentMetricReady).toBe(true);
  });
});
